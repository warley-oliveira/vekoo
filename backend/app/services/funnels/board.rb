module Funnels
  # O quadro do funil: as conversas do período em colunas, uma por etapa, mais a coluna "Sem etapa".
  #
  # Uma agregação só, com `$facet`, como na origem: contagem e página de cada coluna saem da mesma
  # passada pelas conversas. O `$match` usa o índice da organização com a data escolhida, e o `$project`
  # logo depois deixa só o que o card mostra. Na origem o documento inteiro atravessava cada faceta.
  #
  # `$facet` devolve um documento só, então vale o teto de 16 MB do BSON: por isso os limites de etapas
  # por funil e de conversas por coluna. Passou do tempo, o Mongo corta (`MAX_TIME_MS`).
  class Board
    DEFAULT_PER_COLUMN = 20
    MAX_PER_COLUMN = 50
    DEFAULT_DAYS = 30
    MAX_DAYS = 365
    MAX_PAGE = 10_000
    MAX_TIME_MS = 15_000
    DATE_FIELDS = %w[last_message_at created_at].freeze
    NONE = "none".freeze

    PROJECTION_FIELDS = %w[
      connector_id external_id user_name display_name profile_picture_url status automation_enabled
      assigned_account_id team_id unread_messages session_start_at summary notes
      last_message_at last_message_type last_message_by last_message_content chat_tag_ids created_at
    ].freeze

    # @param account [Account] quem olha: só entra o que `Chat.visible_to` deixa
    # @param pages [Hash] { "none" => 2, "<stage_id>" => 3 }
    def initialize(funnel:, account:, date_field: nil, days: nil, per_column: nil, pages: {})
      @funnel = funnel
      @account = account
      @date_field = DATE_FIELDS.include?(date_field.to_s) ? date_field.to_s : DATE_FIELDS.first
      @days = (days.presence || DEFAULT_DAYS).to_i.clamp(1, MAX_DAYS)
      @per_column = (per_column.presence || DEFAULT_PER_COLUMN).to_i.clamp(1, MAX_PER_COLUMN)
      @pages = pages.to_h
    end

    def call
      rows = column_definitions.map { |column| materialize(column) }

      {
        funnel: FunnelSerializer.one(funnel),
        filters: { dateField: date_field, days: days, perColumn: per_column },
        columns: serialize_columns(rows),
        metrics: metrics(rows)
      }
    end

    private

    attr_reader :funnel, :account, :date_field, :days, :per_column, :pages

    def stages
      @stages ||= funnel.stages.to_a
    end

    def stage_key
      @stage_key ||= "funnel_stages.#{funnel.id}"
    end

    # Primeiro "Sem etapa", como na origem. Um id que não é mais de etapa nenhuma também cai aqui:
    # a etapa foi apagada, e o job de limpeza ainda não passou.
    def column_definitions
      [
        { key: NONE, stage: nil, match: { stage_key => { "$nin" => stages.map(&:id) } } },
        *stages.each_with_index.map { |stage, index| { key: index.to_s, stage: stage, match: { stage_key => stage.id } } }
      ]
    end

    def page_for(stage)
      (pages[stage ? stage.id : NONE].presence || 1).to_i.clamp(1, MAX_PAGE)
    end

    def base_match
      Chat.visible_to(account).valid_records.where(date_field.to_sym.gte => days.days.ago).selector
    end

    def projection
      PROJECTION_FIELDS.index_with { 1 }.merge(stage_key => 1)
    end

    def facets
      column_definitions.each_with_object({}) do |column, result|
        result["cnt_#{column[:key]}"] = [ { "$match" => column[:match] }, { "$count" => "n" } ]
        result["docs_#{column[:key]}"] = [
          { "$match" => column[:match] },
          { "$sort" => { date_field => -1, "_id" => -1 } },
          { "$skip" => (page_for(column[:stage]) - 1) * per_column },
          { "$limit" => per_column }
        ]
      end
    end

    def result
      @result ||= Chat.collection.aggregate(
        [ { "$match" => base_match }, { "$project" => projection }, { "$facet" => facets } ],
        allow_disk_use: true,
        max_time_ms: MAX_TIME_MS
      ).first || {}
    end

    def materialize(column)
      {
        stage: column[:stage],
        page: page_for(column[:stage]),
        count: result.dig("cnt_#{column[:key]}", 0, "n").to_i,
        chats: Array(result["docs_#{column[:key]}"]).map { |document| Chat.instantiate(document) }
      }
    end

    def serialize_columns(rows)
      chats = rows.flat_map { |row| row[:chats] }
      accounts = accounts_for(chats)
      tags = tags_for(chats)

      rows.map do |row|
        {
          stageId: row[:stage]&.id,
          stageName: row[:stage]&.name || I18n.t("insights.funnels.no_stage"),
          count: row[:count],
          page: row[:page],
          hasMore: row[:page] * per_column < row[:count],
          chats: row[:chats].map { |chat| FunnelChatSerializer.one(chat, funnel_id: funnel.id, accounts: accounts, tags: tags) }
        }
      end
    end

    def accounts_for(chats)
      ids = chats.filter_map(&:assigned_account_id).uniq
      return {} if ids.empty?

      Account.where(organization_id: funnel.organization_id, id: ids).pluck(:id, :name).to_h
    end

    def tags_for(chats)
      ids = chats.flat_map { |chat| Array(chat.chat_tag_ids) }.uniq
      return {} if ids.empty?

      ChatTag.where(organization_id: funnel.organization_id.to_s, :_id.in => ids).only(:name, :color).index_by(&:id)
    end

    # Na origem a primeira posição era "Sem etapa", e a taxa "em relação à 1ª etapa" dividia por ela.
    # Aqui a conta é só entre as etapas, e o funil é acumulado: quem está numa etapa passou pelas
    # anteriores, a mesma leitura de `ChatFunnel`.
    def metrics(rows)
      counts = rows.select { |row| row[:stage] }.map { |row| row[:count] }
      reached = ChatFunnel.reached(counts)

      {
        total: rows.sum { |row| row[:count] },
        noStage: rows.find { |row| row[:stage].nil? }[:count],
        perStageCounts: counts,
        reachedCounts: reached,
        conversionRates: reached.map { |count| ChatFunnel.rate(count, reached.first) }
      }
    end
  end
end
