module Widget
  # API pública do widget de chat nos sites dos clientes. Sem sessão da plataforma: o
  # visitante se identifica por um JWT assinado com o segredo do conector.
  class BaseController < ApplicationController
    include CamelParams
    include WidgetThrottling

    # Dados da página do cliente: as chaves não são nossas e passam intactas.
    self.opaque_params += %w[context]

    # Teto global: 120 chamadas por minuto por IP em todos os endpoints. Pega o cliente
    # barulhento antes dos limites mais específicos de cada endpoint.
    before_action :throttle_per_ip!

    private

    def throttle_per_ip!
      return if request.method == "OPTIONS" # preflight de CORS nunca conta

      throttle!(scope: "widget:any:ip", limit: 120, period: 1.minute, key: client_ip)
    end

    def throttle_endpoint!(scope:, limit:, period: 1.minute, key: nil)
      throttle!(scope: scope, limit: limit, period: period, key: key || client_ip)
    end

    def client_ip
      request.remote_ip.presence || request.ip
    end

    # Endpoints que exigem sessão de visitante: define @widget_connector e @visitor_id a
    # partir do JWT no Authorization.
    def authenticate_widget_session!
      token = bearer_token
      return render_unauthorized if token.blank?

      payload = peek_widget_jwt(token)
      return render_unauthorized unless payload

      connector = Connector::WebWidget.where(id: payload["connector_id"]).take
      return render_unauthorized unless connector&.active?

      verified = connector.decode_visitor_jwt(token)
      return render_unauthorized unless verified && verified["visitor_id"].present?
      return render_unauthorized unless valid_visitor_id?(verified["visitor_id"])
      return render_origin_not_allowed unless origin_accepted?(connector)

      @widget_connector = connector
      @visitor_id = verified["visitor_id"]
    end

    def find_connector_by_public_token!(token)
      return render_unauthorized unless valid_public_token?(token)

      connector = Connector::WebWidget.where(public_token: token).take
      return render_unauthorized unless connector
      return render_error(status: :forbidden, code: "connectorInactive") unless connector.active?
      return render_origin_not_allowed unless origin_accepted?(connector)

      @widget_connector = connector
    end

    def origin_accepted?(connector)
      connector.allowed_origins.blank? || connector.origin_allowed?(request.headers["Origin"])
    end

    def render_origin_not_allowed
      render_error(status: :forbidden, code: "originNotAllowed")
    end

    def widget_quota_exceeded?(scope:, limit:, key:)
      return false if limit.to_i <= 0

      counter_read(scope: scope, key: key) >= limit.to_i
    end

    def bearer_token
      header = request.headers["Authorization"].to_s
      header.start_with?("Bearer ") ? header.split(" ", 2).last : nil
    end

    # Só para saber qual conector é: a assinatura é conferida em `decode_visitor_jwt`, com o
    # segredo daquele conector.
    def peek_widget_jwt(token)
      JWT.decode(token, nil, false).first
    rescue JWT::DecodeError
      nil
    end

    def find_chat
      Chat.where(connector_id: @widget_connector.id, external_id: @visitor_id).take
    end

    def new_visitor_quota_exceeded?
      widget_quota_exceeded?(
        scope: "widget:visitors:daily",
        limit: @widget_connector.daily_visitor_cap,
        key: @widget_connector.id.to_s
      )
    end

    def build_chat(attributes = {})
      organization = @widget_connector.organization

      Chat.new(
        connector_id: @widget_connector.id,
        organization_id: @widget_connector.organization_id,
        external_id: @visitor_id,
        audience_type: "web",
        automation_enabled: organization ? organization.default_automation_enabled : true,
        **attributes
      )
    end
  end
end
