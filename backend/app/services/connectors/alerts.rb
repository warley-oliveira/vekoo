module Connectors
  # Avisos de conector na organização (queda, volta, erro de conta). Quem guarda e mostra
  # é o domínio access (`OrganizationAlertService`). Se ele falhar, o erro só vai para o log:
  # um aviso que falha nunca derruba o webhook ou a ação que o disparou.
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

      yield organization
    rescue StandardError => e
      Rails.logger.error("[Connectors::Alerts] #{e.class}: #{e.message}")
      nil
    end
    private_class_method :deliver
  end
end
