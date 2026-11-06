##
# app/services/insights/operational_daily_digest.rb
#
# Fachada: agrega Insights::MessageVolumeDaily, Insights::FirstResponseDaily e
# Insights::ChannelMixDaily num único hash pronto para o jsonb `metrics` de DailyChatStat.
#
# Cada bloco é isolado por `rescue`: o rollup horário é serial e uma falha em
# uma métrica não deve derrubar as demais nem abortar a organização.
#
module Insights
  class OperationalDailyDigest
    # Chaves escalares: somáveis via DailyChatStat.sum_stat.
    SCALAR_KEYS = %i[
      chats_started
      active_chats
      automation_chats
      messages_inbound
      messages_sent_by_automation
      messages_sent_by_campaign
      messages_sent_by_human
      out_of_hours_messages
      hours_saved
      messages_avoided
      automation_bookings
      first_response_automation_seconds_sum
      first_response_automation_count
      first_response_human_seconds_sum
      first_response_human_count
      chats_with_human_touch
      chats_handled_by_automation
    ].freeze

    # Chaves HASH: NUNCA podem passar por `sum_stat`, porque o cast
    # (metrics->>'k')::float levanta erro quando o valor é um objeto JSON.
    # São somadas em Ruby por Insights::DashboardReport.
    HASH_KEYS = %i[
      messages_by_account
      chats_by_channel
    ].freeze

    ALL_KEYS = (SCALAR_KEYS + HASH_KEYS).freeze

    attr_reader :organization_id, :range, :zone

    # @param organization_id [String]
    # @param range [Range<Time>] período half-open (from...to)
    # @param zone [ActiveSupport::TimeZone] o fuso da organização
    def initialize(organization_id:, range:, zone:)
      @organization_id = organization_id.to_s
      @range = range
      @zone = zone
    end

    # O que vai para a coluna `metrics`.
    def to_h
      counted = volume.except(:hourly)

      counted.merge(first_response).merge(
        chats_started: channels.total,
        chats_by_channel: channels.to_h,
        hours_saved: Efficiency.hours_saved(counted[:messages_sent_by_automation]),
        messages_avoided: Efficiency.messages_avoided(counted[:messages_sent_by_automation], counted[:messages_sent_by_human]),
        automation_bookings: automation_bookings
      )
    end

    # O que vai para a coluna `hourly_breakdown`: { '9' => 12, '14' => 30 }.
    def hourly
      volume[:hourly]
    end

    private

    def volume
      @volume ||= safely(:message_volume) do
        MessageVolumeDaily.new(organization_id: organization_id, range: range, zone: zone).to_h
      end || MessageVolumeDaily.blank_result
    end

    def first_response
      @first_response ||= safely(:first_response) do
        FirstResponseDaily.new(organization_id: organization_id, range: range).to_h
      end || blank_first_response
    end

    def channels
      @channels ||= ChannelMixDaily.new(organization_id: organization_id, range: range)
    end

    def automation_bookings
      safely(:automation_bookings) do
        Efficiency.automation_bookings(organization_id).where(:created_at.gte => range.first, :created_at.lt => range.last).count
      end.to_i
    end

    def blank_first_response
      %i[
        first_response_automation_seconds_sum first_response_automation_count
        first_response_human_seconds_sum first_response_human_count
        chats_with_human_touch chats_handled_by_automation
      ].index_with { 0 }
    end

    def safely(label)
      yield
    rescue StandardError => e
      Rails.logger.error(
        "[Insights::OperationalDailyDigest] #{label} falhou organização=#{organization_id} " \
        "período=#{range.first}: #{e.class}: #{e.message}"
      )
      nil
    end
  end
end
