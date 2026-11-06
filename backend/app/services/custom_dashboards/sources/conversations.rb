module CustomDashboards
  module Sources
    # Conversas. O escopo passa por `Chat.visible_to`: o que a pessoa não vê no chat, não conta aqui.
    module Conversations
      DEFINITION = {
        model_class: "Chat",
        orm: :mongoid,
        permission: :chat,
        default_time_field: "created_at",
        scope: ->(account) { Chat.visible_to(account).valid_records },
        fields: [
          { key: "status", type: "enum", enum_values: Chat::STATUSES, labels: %w[open closed] },
          { key: "assigned_account_id", type: "string", label_from: :accounts, options_from: :accounts },
          { key: "team_id", type: "string", label_from: :teams, options_from: :teams },
          { key: "connector_id", type: "string", cast: :object_id, label_from: :connectors, options_from: :connectors },
          { key: "created_at", type: "date" },
          { key: "updated_at", type: "date" },
          { key: "last_message_at", type: "date" },
          { key: "unread_messages", type: "number" },
          { key: "tags", type: "array", column: "chat_tag_ids", relationship: :chat_tags, options_from: :chat_tag_names },
          { key: "audience_type", type: "string", labels: %w[whatsapp_api import_feature instagram facebook web] },
          { key: "automation_enabled", type: "boolean", labels: { "true" => "yes", "false" => "no" } },
          { key: "red_flag_count", type: "number" },
          { key: "user_name", type: "string" },
          { key: "custom_attributes", type: "custom_attribute" }
        ],
        allowed_metrics: %w[count sum avg min max],
        allowed_dimensions: %w[status assigned_account_id audience_type team_id connector_id created_at],
        related_dimensions: {
          "chat_tag_name" => { local_field: "chat_tag_ids", model: "ChatTag", display_field: "name", is_array: true }
        },
        # Só filtro: vira `_id $in [...]`, resolvido em CustomDashboards::DocumentIdResolvers.
        document_id_filters: {
          "booking_attendance" => { resolver: :booking_attendance_ids, permission: :calendar, options: %w[show no_show] }
        }
      }.freeze
    end
  end
end
