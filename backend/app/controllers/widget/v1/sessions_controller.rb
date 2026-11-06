module Widget
  module V1
    class SessionsController < Widget::BaseController
      before_action :throttle_session_create!, only: :create
      before_action :throttle_session_show!, only: :show

      # POST /widget/v1/session
      # Corpo: { pk: "pk_widget_...", visitorId: "uuid" }
      def create
        visitor_id = params[:visitor_id].to_s.strip
        unless valid_visitor_id?(visitor_id)
          return render_error(status: :bad_request, code: "invalidVisitorId", field: "visitorId")
        end

        find_connector_by_public_token!(params[:pk].to_s)
        return if performed?

        # Teto por token público: um widget não vira fonte de JWT nem com muitos IPs (botnet).
        return unless throttle!(
          scope: "widget:session:pk",
          limit: 200,
          period: 1.minute,
          key: @widget_connector.public_token
        )

        render json: {
          visitorJwt: @widget_connector.issue_visitor_jwt(visitor_id),
          visitorId: visitor_id,
          config: WidgetConnectorSerializer.appearance(@widget_connector)
        }
      end

      # GET /widget/v1/config?pk=pk_widget_...
      # Leitura pública da aparência, sem JWT, para desenhar o botão antes de haver sessão.
      def show
        find_connector_by_public_token!(params[:pk].to_s)
        return if performed?

        render json: { config: WidgetConnectorSerializer.appearance(@widget_connector) }
      end

      private

      def throttle_session_create!
        throttle_endpoint!(scope: "widget:session:create:ip", limit: 30)
      end

      def throttle_session_show!
        throttle_endpoint!(scope: "widget:session:show:ip", limit: 60)
      end
    end
  end
end
