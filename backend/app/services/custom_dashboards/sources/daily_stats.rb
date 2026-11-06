module CustomDashboards
  module Sources
    # O rollup do dashboard, no Postgres. APENAS chaves escalares: o construtor gera
    # SUM((metrics->>'campo')::float), e o cast quebra em objeto JSON, então as chaves-hash
    # (Insights::OperationalDailyDigest::HASH_KEYS) não podem entrar aqui.
    #
    # `first_response_*_seconds_sum` são somas, não médias: `avg` sobre eles dá a média das somas diárias.
    # O tempo médio ponderado sai em `GET /dashboard`.
    module DailyStats
      METRIC_KEYS = %w[
        chats_started active_chats automation_chats
        messages_inbound messages_sent_by_automation messages_sent_by_campaign messages_sent_by_human
        out_of_hours_messages hours_saved messages_avoided automation_bookings
        chats_with_human_touch chats_handled_by_automation
        first_response_automation_count first_response_human_count
        first_response_automation_seconds_sum first_response_human_seconds_sum
      ].freeze

      DEFINITION = {
        model_class: "DailyChatStat",
        orm: :active_record,
        permission: :dashboard,
        default_time_field: "day",
        scope: ->(account) { DailyChatStat.unscoped.where(organization_id: account.organization_id) },
        fields: [
          { key: "day", type: "date" },
          *METRIC_KEYS.map { |key| { key: key, type: "number", jsonb: "metrics" } }
        ],
        allowed_metrics: %w[count sum avg min max],
        allowed_dimensions: %w[day]
      }.freeze
    end
  end
end
