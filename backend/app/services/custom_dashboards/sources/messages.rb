module CustomDashboards
  module Sources
    # Mensagens. Mensagem não tem `organization_id`: a consulta parte das conversas da pessoa e chega nas
    # mensagens por `$lookup`, no índice { chat_id: 1, created_at: -1, _id: -1 }. A origem fazia `pluck` de
    # TODOS os ids de conversa da conta para um `$in`, que numa conta grande nem cabe numa consulta.
    #
    # `via_chats` faz o construtor montar esse caminho. O período é obrigatório e tem teto próprio.
    # Texto da mensagem não sai: dashboard conta, quem lê conversa é o chat.
    module Messages
      KINDS = { "ChatMessage::Text" => "text", "ChatMessage::Image" => "image", "ChatMessage::Audio" => "audio", "ChatMessage::Media" => "media" }.freeze

      DEFINITION = {
        model_class: "ChatMessage::Base",
        orm: :mongoid,
        via_chats: true,
        permission: :chat,
        default_time_field: "created_at",
        scope: ->(account) { Chat.visible_to(account).valid_records },
        fields: [
          { key: "created_at", type: "date" },
          { key: "_type", type: "string", labels: KINDS },
          { key: "chat_id", type: "string", cast: :object_id },
          { key: "role", type: "string", labels: %w[user assistant] },
          { key: "message_origin", type: "string", labels: %w[platform frontend user] },
          { key: "sender_name", type: "string" },
          { key: "account_id", type: "string", label_from: :accounts, options_from: :accounts }
        ],
        allowed_metrics: %w[count],
        allowed_dimensions: %w[_type created_at role message_origin sender_name account_id]
      }.freeze
    end
  end
end
