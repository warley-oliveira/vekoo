module Inbound
  # Onde o webhook de provedor é processado de verdade: o controlador só valida o conector,
  # responde 2xx e enfileira. O corpo viaja como JSON cru para qualquer payload caber no
  # argumento do job, sem depender do que o ActiveJob sabe serializar.
  class ProcessWebhookJob < ApplicationJob
    queue_as :critical

    # Os provedores não reentregam (a resposta já foi 2xx), então a nova tentativa é nossa.
    # Teto baixo: cada tentativa refaz tudo, e o pior caso é justamente o que nunca vai dar
    # certo. Os processadores são idempotentes pelo id externo da mensagem.
    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Inbound::ProcessWebhookJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    def perform(provider, body, connector_id = nil, event = nil)
      payload = parse(body)

      case provider
      when "whatsapp_cloud"
        connector = Connector::WhatsappCloud.where(id: connector_id).take
        WhatsappCloudEvents.new(payload, connector: connector).call if connector
      when "zapi"
        connector = zapi_connector(connector_id)
        ZapiEvents.new(payload, connector: connector).public_send(event) if connector
      when "evolution"
        EvolutionEvents.for_codename(payload, connector_id)&.call
      when "meta_messaging"
        MetaMessagingEvents.new(payload).call
      when "lead_chat"
        connector = Connector::LeadChat.where(id: connector_id).take
        LeadChatEvents.new(payload, connector: connector).call if connector
      else
        Rails.logger.warn("[Inbound::ProcessWebhookJob] Provedor desconhecido: #{provider}")
      end
    end

    private

    def parse(body)
      parsed = JSON.parse(body.presence || "{}")
      parsed.is_a?(Hash) ? parsed.with_indifferent_access : {}.with_indifferent_access
    end

    def zapi_connector(connector_id)
      Connector::Base.where(id: connector_id, :_type.in => %w[Connector::WhatsappWeb Connector::Zapi]).take
    end
  end
end
