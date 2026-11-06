module Insights
  # O que `GET /dashboard` responde: `daily_chat_stats` somado no período, mais os funis, que são contados
  # na hora. Origem: `dashboard_controller`, sem o que dependia de assistente (ver docs/migration/api/insights.md,
  # card a card).
  #
  # Os números do rollup são da organização inteira: é o que a permissão `dashboard` libera, e o rollup
  # não tem como separar por pessoa. Os funis passam por `Chat.visible_to`, por isso o cache é por nível
  # de visão.
  class DashboardReport
    # Bump ao alterar o formato do payload: invalida os caches já gravados.
    CACHE_VERSION = "v1".freeze
    CACHE_TTL = 10.minutes
    RANKING_SIZE = 20
    DEFAULT_RANGE = 1.year
    MAX_RANGE_DAYS = 731

    class RangeTooLong < StandardError; end
    class InvalidRange < StandardError; end

    # @raise [Agenda::TimeInput::Invalid] data que não dá para entender
    # @raise [InvalidRange] fim antes do início
    # @raise [RangeTooLong] mais de dois anos: os funis são contados na hora
    def initialize(account, date_start: nil, date_end: nil)
      @account = account
      @organization = account.organization
      @zone = @organization.reporting_zone
      @date_start = (::Agenda::TimeInput.parse(date_start, @zone) || @zone.now - DEFAULT_RANGE).beginning_of_day
      @date_end = (::Agenda::TimeInput.parse(date_end, @zone) || @zone.now).end_of_day

      raise InvalidRange if @date_end < @date_start
      raise RangeTooLong if (@date_end.to_date - @date_start.to_date).to_i > MAX_RANGE_DAYS
    end

    def call
      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) { build }
    end

    private

    attr_reader :account, :organization, :zone, :date_start, :date_end

    def cache_key
      viewer = account.permission_level(:chat_list_to) == "all" ? "all" : account.id
      "insights:dashboard:#{CACHE_VERSION}:#{organization.id}:#{viewer}:#{date_start.to_date}:#{date_end.to_date}"
    end

    def build
      {
        hasData: rows.any?,
        period: { dateStart: date_start.to_date.iso8601, dateEnd: date_end.to_date.iso8601 },

        chatsTotal: sum(:chats_started).to_i,
        newChats: series(:chats_started),
        activeChats: series(:active_chats),
        automationChats: series(:automation_chats),

        messagesInbound: sum(:messages_inbound).to_i,
        messagesSentByAutomation: sum(:messages_sent_by_automation).to_i,
        messagesSentByCampaign: sum(:messages_sent_by_campaign).to_i,
        messagesSentByHuman: sum(:messages_sent_by_human).to_i,
        messageVolume: message_volume,

        messagesByAccount: account_ranking,
        chatsByChannel: sum_hash(:chats_by_channel),

        firstResponseAutomationSeconds: weighted_avg_seconds(:first_response_automation_seconds_sum, :first_response_automation_count),
        firstResponseHumanSeconds: weighted_avg_seconds(:first_response_human_seconds_sum, :first_response_human_count),
        firstResponseAutomationCount: sum(:first_response_automation_count).to_i,
        firstResponseHumanCount: sum(:first_response_human_count).to_i,

        chatsWithHumanTouch: sum(:chats_with_human_touch).to_i,
        humanTouchRate: rate(:chats_with_human_touch),
        chatsHandledByAutomation: sum(:chats_handled_by_automation).to_i,
        automationResolutionRate: rate(:chats_handled_by_automation),

        hoursSaved: sum(:hours_saved).round(1),
        messagesAvoided: sum(:messages_avoided).to_i,
        outOfHoursMessages: sum(:out_of_hours_messages).to_i,
        automationBookings: sum(:automation_bookings).to_i,

        heatMap: heat_map,
        funnels: funnels
      }
    end

    # O rollup já vem inteiro para somar em Ruby: uma consulta só, em vez de um `SUM` por chave. E
    # `sum_stat` nem serve para as chaves-hash, porque o cast ::float quebra em objeto JSON.
    def rows
      @rows ||= DailyChatStat.where(organization_id: organization.id, day: date_start.to_date..date_end.to_date).to_a
    end

    def rows_by_day
      @rows_by_day ||= rows.index_by(&:day)
    end

    # Do primeiro dia com linha até o fim do período, sem passar de hoje. O job não grava linha em dia
    # parado, e um dia sem linha aqui é zero, não um buraco no gráfico.
    def days
      return [] if rows.empty?

      @days ||= (rows.first.day..[ date_end.to_date, zone.today ].min).to_a
    end

    def sum(key)
      rows.sum { |row| row[key].to_f }
    end

    def series(key)
      days.map { |day| { date: day.iso8601, count: rows_by_day[day]&.[](key).to_i } }
    end

    def message_volume
      days.map do |day|
        row = rows_by_day[day]

        {
          date: day.iso8601,
          inbound: row&.[](:messages_inbound).to_i,
          automation: row&.[](:messages_sent_by_automation).to_i,
          campaign: row&.[](:messages_sent_by_campaign).to_i,
          human: row&.[](:messages_sent_by_human).to_i
        }
      end
    end

    # Soma chaves-HASH do jsonb ao longo dos dias.
    def sum_hash(key)
      rows.each_with_object(Hash.new(0)) do |row, acc|
        bucket = row[key]
        next unless bucket.is_a?(Hash)

        bucket.each { |name, value| acc[name.to_s] += value.to_i }
      end
    end

    # Média PONDERADA ao longo do período: soma dos deltas / soma das contagens.
    # Média das médias diárias seria errada (um dia com 2 conversas pesaria igual
    # a um dia com 500).
    def weighted_avg_seconds(sum_key, count_key)
      count = sum(count_key)
      return nil if count.zero?

      (sum(sum_key) / count).round(1)
    end

    def rate(key)
      total = sum(:chats_started)
      return 0.0 if total.zero?

      (sum(key) / total * 100).round(1)
    end

    def account_ranking
      counts = sum_hash(:messages_by_account)
      return [] if counts.empty?

      top = counts.sort_by { |id, count| [ -count, id ] }.first(RANKING_SIZE)
      people = organization.accounts.where(id: top.map(&:first)).with_attached_avatar.index_by(&:id)

      top.map do |id, messages|
        person = people[id]

        { id: id, name: person&.name, avatarUrl: person && StoredImagePath.for(person.avatar, :thumb), messages: messages }
      end
    end

    def heat_map
      rows.filter_map do |row|
        hours = row.hourly_breakdown.to_h["message_count"]
        next unless hours.is_a?(Hash) && hours.any?

        {
          date: row.day.iso8601,
          events: hours.map { |hour, count| { hour: hour.to_i, count: count.to_i } }.sort_by { |event| event[:hour] }
        }
      end
    end

    def funnels
      list = organization.funnels.includes(:stages).order(:name, :id).to_a
      return [] if list.empty?

      ChatFunnel.analyze(Chat.visible_to(account).valid_records, list, from: date_start, to: date_end).map do |entry|
        {
          id: entry[:funnel].id,
          name: entry[:funnel].name,
          description: entry[:funnel].description,
          total: entry[:total],
          stages: entry[:stages].map { |stage| camelize_stage(stage) },
          tags: entry[:tags]
        }
      end
    end

    def camelize_stage(stage)
      {
        id: stage[:id],
        name: stage[:name],
        count: stage[:count],
        reached: stage[:reached],
        conversionRate: stage[:conversion_rate],
        stepRate: stage[:step_rate],
        dropOff: stage[:drop_off]
      }
    end
  end
end
