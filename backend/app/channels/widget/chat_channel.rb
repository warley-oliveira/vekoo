module Widget
  # Tempo real do visitante no widget do site. Conecta pelo cable próprio (/widget-cable).
  class ChatChannel < ApplicationCable::Channel
    def subscribed
      connector = Connector::WebWidget.where(id: web_widget_connector_id).take
      return reject unless connector&.active?

      stream_from connector.visitor_stream(visitor_id)
    end

    def unsubscribed
      stop_all_streams
    end
  end
end
