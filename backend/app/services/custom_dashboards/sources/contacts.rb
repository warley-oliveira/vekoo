module CustomDashboards
  module Sources
    # Contatos. Aqui contato é a conversa, como em `/contacts` (ver `Contact`): não há coleção própria,
    # e um número em dois canais conta duas vezes. Na origem era um stub num banco que ninguém escreve.
    module Contacts
      DEFINITION = {
        model_class: "Chat",
        orm: :mongoid,
        permission: :contacts,
        default_time_field: "created_at",
        scope: ->(account) { Chat.visible_to(account).valid_records },
        fields: [
          { key: "created_at", type: "date", index: Insights::ChatIndexes::BY_CREATION },
          { key: "last_message_at", type: "date", index: Insights::ChatIndexes::BY_ACTIVITY },
          { key: "user_name", type: "string" },
          { key: "display_name", type: "string" },
          { key: "external_id", type: "string" },
          { key: "audience_type", type: "string", labels: %w[whatsapp_api import_feature instagram facebook web] },
          { key: "contact_origin", type: "string" },
          { key: "assigned_account_id", type: "string", label_from: :accounts, options_from: :accounts },
          { key: "team_id", type: "string", label_from: :teams, options_from: :teams },
          { key: "tags", type: "array", column: "chat_tag_ids", relationship: :chat_tags, options_from: :chat_tag_names },
          { key: "custom_attributes", type: "custom_attribute" }
        ],
        allowed_metrics: %w[count],
        allowed_dimensions: %w[assigned_account_id team_id audience_type contact_origin created_at],
        related_dimensions: {
          "chat_tag_name" => { local_field: "chat_tag_ids", model: "ChatTag", display_field: "name", is_array: true }
        }
      }.freeze
    end
  end
end
