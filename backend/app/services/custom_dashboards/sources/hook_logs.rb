module CustomDashboards
  module Sources
    # O que os webhooks receberam (`webhook_logs` na origem, e `webhook_name` era `hook_name`). O que veio na requisição não sai:
    # dashboard conta, e quem lê o corpo é a tela de logs. Os logs somem em 90 dias (`HookLog::RETENTION`), e cada webhook guarda
    # até 10 mil: é o teto do que dá para somar aqui.
    module HookLogs
      DEFINITION = {
        model_class: "HookLog",
        orm: :mongoid,
        permission: :core_settings,
        default_time_field: "created_at",
        scope: ->(account) { HookLog.for_organization(account.organization_id) },
        fields: [
          { key: "status", type: "enum", enum_values: HookLog::STATUSES, labels: HookLog::STATUSES },
          { key: "status_code", type: "number" },
          { key: "processing_time_ms", type: "number" },
          { key: "hook_name", type: "string" },
          { key: "hook_status", type: "enum", enum_values: Hook::STATUSES, labels: Hook::STATUSES },
          { key: "created_at", type: "date", index: Insights::ChatIndexes::BY_CREATION }
        ],
        allowed_metrics: %w[count sum avg min max],
        allowed_dimensions: %w[status hook_name hook_status created_at]
      }.freeze
    end
  end
end
