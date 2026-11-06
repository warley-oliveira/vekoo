module Connectors
  # O envio de texto devolve o id externo pronto em todo conector. Já o de mídia devolve a
  # resposta crua de cada provedor: esta é a tradução única para o id da mensagem.
  module ExternalId
    module_function

    # @return [String, nil]
    def from(response)
      return response if response.is_a?(String)

      # SDK da Meta (WhatsApp Cloud)
      wamid = response.try(:data).try(:messages)&.first.try(:id)
      return wamid if wamid

      body = response.respond_to?(:parsed_response) ? response.parsed_response : response
      return nil unless body.is_a?(Hash)

      # Evolution e AIVA em `key.id`; Z-API em `messageId`; Messenger e Instagram em `message_id`;
      # LeadChat em `id`, no corpo com chaves em símbolo que o cliente dele devolve.
      body.dig("key", "id") || body["messageId"] || body["message_id"] || body[:id]&.to_s
    end
  end
end
