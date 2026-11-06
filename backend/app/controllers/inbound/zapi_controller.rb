module Inbound
  # POST /inbound/zapi/:connector_id/...
  # https://developer.z-api.io/webhooks/on-message-received
  class ZapiController < BaseController
    before_action :set_connector

    def on_message_received
      enqueue("zapi", @connector.id, "on_message_received")
    end

    # Mensagem enviada: nada a fazer, o eco de quem envia pela instância vem em `received`.
    def on_message_send
      head :ok
    end

    def on_whatsapp_disconnected
      enqueue("zapi", @connector.id, "on_whatsapp_disconnected")
    end

    def on_whatsapp_connected
      enqueue("zapi", @connector.id, "on_whatsapp_connected")
    end

    private

    def set_connector
      @connector = Connector::Base.where(id: params[:connector_id], :_type.in => %w[Connector::WhatsappWeb Connector::Zapi]).take
      render_not_found unless @connector
    end
  end
end
