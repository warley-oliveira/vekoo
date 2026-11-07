module Inbound
  # POST /inbound/evolution/:codename, onde `codename` é o nome da instância (`IWA-<id>`).
  # Na origem estes eventos vinham por RabbitMQ, e o provider AIVA já entregava neste formato.
  class EvolutionController < BaseController
    def receive
      codename = params[:codename].to_s
      prefix = Connector::WhatsappWeb::PREFIX_INSTANCE
      connector = codename.start_with?(prefix) ? Connector::WhatsappWeb.where(id: codename.delete_prefix(prefix)).take : nil
      return render_not_found unless authenticated_connector(connector)

      enqueue("evolution", codename)
    end
  end
end
