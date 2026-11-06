module Connectors
  # Avisos de conector na organização (queda, volta, erro de conta). Quem guarda e mostra
  # é o domínio access (`OrganizationAlertService`); enquanto ele não existe, ou se ele
  # falhar, o aviso só vai para o log: um aviso que falha nunca derruba o webhook ou a
  # ação que o disparou.
  #
  # Assinaturas esperadas (o recycle da origem chega nelas):
  #
  #   OrganizationAlertService.connector_disconnected(organization, connector, message:)
  #   OrganizationAlertService.connector_reconnected(organization, connector)
  #   OrganizationAlertService.connector_error(organization, connector, code:, message:, metadata:)
  module Alerts
    module_function

    def disconnected(connector, message: nil)
      deliver(connector) do |organization|
        OrganizationAlertService.connector_disconnected(organization, connector, message: message)
      end
    end

    def reconnected(connector)
      deliver(connector) do |organization|
        OrganizationAlertService.connector_reconnected(organization, connector)
      end
    end

    def error(connector, code:, message:, metadata: {})
      deliver(connector) do |organization|
        OrganizationAlertService.connector_error(organization, connector, code: code, message: message, metadata: metadata)
      end
    end

    def deliver(connector)
      organization = connector.organization
      return unless organization
      return Rails.logger.info("[Connectors::Alerts] sem serviço de avisos: conector #{connector.id}") unless defined?(::OrganizationAlertService)

      yield organization
    rescue StandardError => e
      Rails.logger.error("[Connectors::Alerts] #{e.class}: #{e.message}")
      nil
    end
    private_class_method :deliver
  end
end
