module Flows
  # Implementado pelo domínio automation.
  #
  # É o único ponto de automação no caminho da mensagem recebida: quem chama é
  # `Chats::InboundFlow`, depois de a mensagem estar persistida e transmitida, e só
  # quando a automação pode rodar (conversa com automação ligada, conector ativo, dentro
  # da janela de atendimento).
  #
  #   chat:       [Chat] a conversa
  #   text:       [String] o texto recebido (legenda ou transcrição, nas mídias)
  #   event:      [String] 'first_message' ou 'message_received'
  #   message_id: [String, nil] id da mensagem no provedor
  class InboundDispatcher
    def self.call(chat:, text:, event: "message_received", message_id: nil); end
  end
end
