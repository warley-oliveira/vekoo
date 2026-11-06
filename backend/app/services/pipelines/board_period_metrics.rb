module Pipelines
  # O que aconteceu num quadro entre duas datas: o filtro de período da tela de métricas.
  #
  # `BoardMetrics` é a fotografia de agora, e continua sendo. Aqui mora o que só faz sentido com um
  # começo e um fim: quantos cards entraram, quantos negócios fecharam, quanto tempo cada etapa segurou
  # os cards, até onde os cards do período chegaram e quem mais fechou. Respeita a visibilidade: recebe
  # em `cards` só o que a pessoa enxerga.
  class BoardPeriodMetrics
    # Em quantos dias cada granularidade ainda cabe num gráfico sem virar um borrão.
    MAX_DAILY_DAYS = 31
    MAX_WEEKLY_DAYS = 183
    MAX_RANKING = 20

    def self.call(board, from:, to:, cards: board.cards)
      new(board, from: from, to: to, cards: cards).compute
    end

    def initialize(board, from:, to:, cards: board.cards)
      @board = board
      @cards = cards.unscope(:order)
      @from = from.to_date
      @to = to.to_date
    end

    def compute
      length = (@to - @from).to_i + 1
      previous_to = @from - 1
      previous_from = previous_to - (length - 1)

      {
        from: @from.iso8601,
        to: @to.iso8601,
        previousFrom: previous_from.iso8601,
        previousTo: previous_to.iso8601,
        bucket: bucket,
        summary: summary(range_of(@from, @to)),
        previous: summary(range_of(previous_from, previous_to)),
        series: series,
        stageConversion: stage_conversion,
        avgTimePerStage: avg_time_per_stage,
        ranking: ranking
      }
    end

    private

    def range_of(from, to)
      from.in_time_zone.beginning_of_day..to.in_time_zone.end_of_day
    end

    def range
      @range ||= range_of(@from, @to)
    end

    def stages
      @stages ||= @board.stages.to_a
    end

    def bucket
      days = (@to - @from).to_i + 1
      return "day" if days <= MAX_DAILY_DAYS

      days <= MAX_WEEKLY_DAYS ? "week" : "month"
    end

    def summary(period)
      won = @cards.where(won_at: period)
      lost = @cards.where(lost_at: period)
      won_count = won.count
      lost_count = lost.count
      closed = won_count + lost_count

      {
        createdCount: @cards.where(created_at: period).count,
        wonCount: won_count,
        wonValue: won.sum(:deal_value).to_f,
        lostCount: lost_count,
        lostValue: lost.sum(:deal_value).to_f,
        # Sem nenhum negócio fechado não há taxa, e 0% diria que todos foram perdidos.
        conversionRate: closed.zero? ? nil : (won_count.to_f / closed * 100).round(1)
      }
    end

    # Um ponto por dia, semana ou mês, sem buracos, na data do fuso da organização.
    def series
      created = per_bucket(:created_at).count
      won = per_bucket(:won_at).count
      won_value = per_bucket(:won_at).sum(:deal_value)
      lost = per_bucket(:lost_at).count

      bucket_starts.map do |start|
        key = start.iso8601
        {
          date: key,
          createdCount: created[key] || 0,
          wonCount: won[key] || 0,
          wonValue: (won_value[key] || 0).to_f,
          lostCount: lost[key] || 0
        }
      end
    end

    def per_bucket(column)
      @cards.where(column => range).group(Arel.sql(bucket_sql(column)))
    end

    # Os instantes estão em UTC, e o agrupamento vale no fuso da organização: o negócio ganho na noite
    # do dia 30 pertence ao dia 30 daqui. Igual a `GoalHistory`.
    def bucket_sql(column)
      zone = Card.lease_connection.quote(Time.zone.tzinfo.name)
      local = "pipeline_cards.#{column} AT TIME ZONE 'UTC' AT TIME ZONE #{zone}"
      "TO_CHAR(DATE_TRUNC('#{bucket}', #{local}), 'YYYY-MM-DD')"
    end

    def bucket_starts
      case bucket
      when "day" then (@from..@to).to_a
      when "week" then (@from.beginning_of_week(:monday)..@to).step(7).to_a
      else
        months = []
        month = @from.beginning_of_month
        while month <= @to
          months << month
          month = month.next_month
        end
        months
      end
    end

    # Dos cards criados no período, quantos chegaram a cada etapa ou além. Vale o ponto mais avançado
    # por onde o card passou: voltar uma etapa não apaga o que ele alcançou, e pular uma etapa conta
    # como ter passado por ela, senão o funil subiria de uma linha para a outra.
    def stage_conversion
      positions = stages.to_h { |stage| [ stage.id, stage.position.to_i ] }
      cohort = @cards.where(created_at: range)
      reached = cohort.pluck(:id, :stage_id).to_h { |id, stage_id| [ id, positions[stage_id].to_i ] }

      moved_stages_of(cohort).each do |card_id, from_stage, to_stage|
        next unless reached.key?(card_id)

        reached[card_id] = [ reached[card_id], positions[from_stage].to_i, positions[to_stage].to_i ].max
      end

      {
        cohort: reached.size,
        won: cohort.where.not(won_at: nil).count,
        stages: stages.map do |stage|
          {
            stageId: stage.id,
            stageName: stage.name,
            color: stage.color,
            position: stage.position,
            reached: reached.values.count { |position| position >= stage.position.to_i }
          }
        end
      }
    end

    def moved_stages_of(cohort)
      CardActivity.unscoped
                  .where(action: "moved", card_id: cohort.select(:id))
                  .pluck(:card_id, Arel.sql("details->>'from_stage_id'"), Arel.sql("details->>'to_stage_id'"))
    end

    # As passagens que terminaram no período e, se ele chega até hoje, as que seguem em aberto. A
    # mesma conta de `BoardMetrics#avg_time_per_stage`, recortada pelo fim de cada passagem.
    def avg_time_per_stage
      rows = Card.lease_connection.select_rows(passages_sql).to_h do |stage_id, average, count|
        [ stage_id, { seconds: average.to_f, count: count.to_i } ]
      end

      stages.map do |stage|
        row = rows[stage.id]
        {
          stageId: stage.id,
          stageName: stage.name,
          color: stage.color,
          avgHours: row ? (row[:seconds] / 3600).round(1) : nil,
          passages: row ? row[:count] : 0
        }
      end
    end

    def passages_sql
      card_ids = @cards.select(:id).to_sql

      Card.sanitize_sql_array([ <<~SQL.squish, { from: range.begin.utc, to: range.end.utc, now: Time.current.utc } ])
        SELECT stage_id, AVG(seconds), COUNT(*) FROM (
          SELECT stage_id, seconds FROM (
            SELECT activities.details->>'from_stage_id' AS stage_id,
                   activities.created_at AS ended_at,
                   EXTRACT(EPOCH FROM activities.created_at - COALESCE(
                     LAG(activities.created_at) OVER (PARTITION BY activities.card_id ORDER BY activities.created_at),
                     cards.created_at
                   )) AS seconds
            FROM pipeline_card_activities activities
            JOIN pipeline_cards cards ON cards.id = activities.card_id
            WHERE activities.action = 'moved' AND activities.card_id IN (#{card_ids})
          ) closed
          WHERE ended_at BETWEEN :from AND :to
          #{open_passages_sql(card_ids)}
        ) stays
        GROUP BY stage_id
      SQL
    end

    def open_passages_sql(card_ids)
      return "" if @to < Time.zone.today

      <<~SQL.squish
        UNION ALL
        SELECT cards.stage_id::text, EXTRACT(EPOCH FROM :now::timestamp - cards.stage_entered_at)
        FROM pipeline_cards cards
        WHERE cards.archived = false AND cards.won_at IS NULL AND cards.lost_at IS NULL
          AND cards.id IN (#{card_ids})
      SQL
    end

    # Quem fechou mais no período. Card sem responsável não tem de quem ser o mérito.
    def ranking
      won = @cards.where(won_at: range).where.not(assigned_to_id: nil).group(:assigned_to_id)
      won_counts = won.count
      won_values = won.sum(:deal_value)
      lost_counts = @cards.where(lost_at: range).where.not(assigned_to_id: nil).group(:assigned_to_id).count

      ids = (won_counts.keys + lost_counts.keys).uniq
      accounts = Account.where(id: ids).with_attached_avatar.index_by(&:id)

      ids.filter_map do |id|
        account = accounts[id]
        next unless account

        won_count = won_counts[id] || 0
        lost_count = lost_counts[id] || 0
        {
          user: { id: account.id, name: account.name, avatarUrl: StoredImagePath.for(account.avatar, :thumb) },
          wonCount: won_count,
          wonValue: (won_values[id] || 0).to_f,
          lostCount: lost_count,
          conversionRate: (won_count.to_f / (won_count + lost_count) * 100).round(1)
        }
      end.sort_by { |entry| [ -entry[:wonValue], -entry[:wonCount], entry[:user][:name].to_s ] }.first(MAX_RANKING)
    end
  end
end
