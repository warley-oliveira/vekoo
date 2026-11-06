module CustomDashboards
  module Sources
    # Campanhas. Os enums de `Outreach::Campaign` moram em `<nome>_cd`: `column` faz a tradução, e a tela
    # só conhece o nome da API.
    module Campaigns
      STATUSES = %w[draft scheduled running paused completed cancelled].freeze

      DEFINITION = {
        model_class: "Outreach::Campaign",
        orm: :mongoid,
        permission: :campaigns,
        default_time_field: "created_at",
        scope: ->(account) { Outreach::Campaign.for_organization(account.organization_id) },
        fields: [
          { key: "name", type: "string" },
          { key: "status", type: "enum", column: "status_cd", enum_values: STATUSES, labels: STATUSES },
          { key: "campaign_mode", type: "enum", column: "campaign_mode_cd", enum_values: %w[text template], labels: %w[text template] },
          { key: "message_type", type: "enum", column: "message_type_cd", enum_values: %w[text media], labels: %w[text media] },
          { key: "created_by_account_id", type: "string", label_from: :accounts, options_from: :accounts },
          { key: "recipients_count", type: "number" },
          { key: "sent_count", type: "number" },
          { key: "delivered_count", type: "number" },
          { key: "read_count", type: "number" },
          { key: "failed_count", type: "number" },
          { key: "created_at", type: "date" },
          { key: "scheduled_at", type: "date" },
          { key: "started_at", type: "date" },
          { key: "completed_at", type: "date" }
        ],
        allowed_metrics: %w[count sum avg min max],
        allowed_dimensions: %w[status campaign_mode message_type created_by_account_id created_at started_at]
      }.freeze
    end
  end
end
