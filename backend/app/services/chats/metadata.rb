module Chats
  # O que a tela da conversa precisa saber além da própria conversa. Sai em `GET /chats/:id` e na
  # primeira página do histórico, que é o que a tela abre primeiro.
  module Metadata
    module_function

    def attribute_list(organization)
      organization.custom_fields.order_by(created_at: :asc).map do |field|
        {
          name: field.name,
          key: field.key,
          description: field.description,
          valueType: field.value_type,
          optionValues: field.option_values
        }
      end
    end

    # O que a tela usa para liberar recursos por provedor: `evolution_api`, `aiva_api`, `zapi`,
    # `whatsapp_cloud`, `instagram_direct`... `reactionsSupported` e `deleteForEveryoneSupported`
    # vêm no próprio conector, em /chats/self-filter.
    def connector_provider(chat)
      connector = chat.connector
      return nil if connector.blank?

      connector.is_a?(Connector::WhatsappWeb) ? connector.provider_api.to_s : connector.connector_type
    end
  end
end
