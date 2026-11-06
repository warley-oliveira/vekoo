module Widget
  module V1
    class VisitorController < Widget::BaseController
      before_action :authenticate_widget_session!
      before_action :throttle_visitor_endpoint!

      # GET /widget/v1/visitor
      # O perfil guardado do visitante (vazio se ainda não há conversa).
      def show
        render json: { profile: serialize_profile(find_chat) }
      end

      # POST /widget/v1/visitor
      # Corpo: { name, phone, email }. Cria a conversa se preciso, para o formulário de
      # antes do chat ser capturado mesmo antes da primeira mensagem.
      def create
        name = truncate_field(params[:name].to_s.strip, WidgetThrottling::MAX_NAME_LENGTH)
        phone = truncate_field(params[:phone].to_s.strip, WidgetThrottling::MAX_PHONE_LENGTH)
        email = truncate_field(params[:email].to_s.strip, WidgetThrottling::MAX_EMAIL_LENGTH)

        required = required_fields_for(@widget_connector.pre_chat_fields)
        missing = required.select { |field| { "name" => name, "phone" => phone, "email" => email }[field].blank? }
        if missing.any?
          return render_error(status: :bad_request, code: "missingFields", details: { fields: missing.map { |field| field.camelize(:lower) } })
        end

        if email.present? && email !~ URI::MailTo::EMAIL_REGEXP
          return render_error(status: :unprocessable_entity, code: "invalidEmail", field: "email")
        end

        existing = find_chat
        return render_error(status: :too_many_requests, code: "visitorQuotaExceeded") if existing.nil? && new_visitor_quota_exceeded?

        chat = existing || build_chat
        chat.user_name = name if name.present?
        chat.custom_attributes = (chat.custom_attributes || {}).merge(
          "phone" => phone.presence,
          "email" => email.presence
        ).compact

        if chat.save && existing.nil?
          counter_increment(scope: "widget:visitors:daily", period: 1.day, key: @widget_connector.id.to_s)
        end

        render json: { profile: serialize_profile(chat) }
      end

      private

      def throttle_visitor_endpoint!
        throttle_endpoint!(scope: "widget:visitor:ip", limit: 30)
      end

      def required_fields_for(pre_chat)
        case pre_chat
        when "name" then %w[name]
        when "name_phone" then %w[name phone]
        when "name_phone_email" then %w[name phone email]
        else []
        end
      end

      def serialize_profile(chat)
        return { name: nil, phone: nil, email: nil, captured: false } unless chat

        attrs = chat.custom_attributes || {}
        {
          name: chat.user_name,
          phone: attrs["phone"],
          email: attrs["email"],
          captured: profile_captured?(chat)
        }
      end

      def profile_captured?(chat)
        required = required_fields_for(@widget_connector.pre_chat_fields)
        return true if required.empty?

        attrs = chat.custom_attributes || {}
        required.all? do |field|
          field == "name" ? chat.user_name.present? : attrs[field].present?
        end
      end
    end
  end
end
