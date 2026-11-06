module WidgetCable
  # Authenticated entrypoint for the public widget cable. Same rejection
  # semantics as Api::Widget::BaseController: invalid token / inactive
  # connector / disallowed origin → reject_unauthorized_connection.
  #
  # Additional defenses on top of the JWT check:
  #
  #  - visitor_id must look like a UUID/url-safe id (no path traversal,
  #    whitespace or BSON injection markers in the cable identifier).
  #  - per-IP throttle on connect attempts: a single IP can't exhaust the
  #    cable worker pool by opening hundreds of WS handshakes per minute.
  class Connection < ActionCable::Connection::Base
    identified_by :visitor_id, :web_widget_connector_id

    CONNECT_LIMIT_PER_MINUTE = 60
    VISITOR_ID_REGEX = WidgetThrottling::VISITOR_ID_REGEX

    def connect
      throttle_connection!

      token = request.params[:token].to_s
      reject!('missing token') if token.blank?

      payload = peek_jwt(token)
      reject!('malformed jwt') unless payload

      # O id vem de um token ainda não verificado: `to_s` para nunca chegar operador do Mongo.
      connector = Connector::WebWidget.where(id: payload['connector_id'].to_s).take
      reject!("connector not found (id=#{payload['connector_id']})") unless connector
      reject!("connector inactive (id=#{connector.id})") unless connector.active?

      verified = connector.decode_visitor_jwt(token)
      reject!("jwt verification failed (id=#{connector.id})") unless verified
      reject!("missing visitor_id (id=#{connector.id})") unless verified['visitor_id'].present?
      reject!('visitor_id format invalid') unless VISITOR_ID_REGEX.match?(verified['visitor_id'])

      if connector.allowed_origins.present?
        origin = request.env['HTTP_ORIGIN']
        reject!("origin not allowed: #{origin.inspect}") unless connector.origin_allowed?(origin)
      end

      self.visitor_id = verified['visitor_id']
      self.web_widget_connector_id = connector.id.to_s
    end

    private

    def throttle_connection!
      return if Rails.env.test? && !ENV['WIDGET_THROTTLE_TESTS']

      ip = client_ip
      return if ip.blank?

      cache_key = "throttle:widget:cable:connect:#{ip}"
      count = Rails.cache.increment(cache_key, 1, expires_in: 1.minute, raw: true)
      if count.nil?
        Rails.cache.write(cache_key, 1, expires_in: 1.minute, raw: true)
        count = 1
      end

      reject!("rate limited (#{count}/#{CONNECT_LIMIT_PER_MINUTE} per min)") if count.to_i > CONNECT_LIMIT_PER_MINUTE
    end

    # Logs the concrete rejection reason before tearing down the connection.
    # All causes share the "[WidgetCable] rejected" prefix so they can be
    # grepped/segmented in the logs (expected noise like expired tokens vs.
    # misconfigured origins).
    def reject!(reason)
      Rails.logger.warn(
        "[WidgetCable] rejected — #{reason} (ip=#{client_ip}, origin=#{request.env['HTTP_ORIGIN'].inspect})"
      )
      reject_unauthorized_connection
    end

    def client_ip
      # `remote_ip` só confia nos proxies conhecidos. O primeiro X-Forwarded-For é o cliente
      # quem escreve, e trocá-lo escaparia do limite de conexões.
      request.remote_ip.presence || request.ip
    end

    # Decode without verification just to read connector_id; the actual signature
    # check happens via connector.decode_visitor_jwt with the per-connector secret.
    def peek_jwt(token)
      payload = JWT.decode(token, nil, false).first
      payload.is_a?(Hash) ? payload : nil
    rescue JWT::DecodeError
      nil
    end
  end
end
