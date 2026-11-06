module Widget
  module V1
    class MessagesController < Widget::BaseController
      MAX_PROACTIVE_LENGTH = 500

      before_action :authenticate_widget_session!
      before_action :throttle_per_visitor!, only: %i[create index]
      before_action :enforce_daily_message_cap!, only: :create

      # POST /widget/v1/messages
      # Corpo: { content, clientMessageId?, proactiveMessage?, visitorName?, context? }
      def create
        content = params[:content].to_s.strip
        return render_error(status: :bad_request, code: "contentRequired", field: "content") if content.blank?

        if content.length > WidgetThrottling::MAX_CONTENT_LENGTH
          return render_error(status: :unprocessable_entity, code: "contentTooLong", field: "content")
        end

        begin
          sanitized_context = ::Widget::ContextSanitizer.new(params[:context], connector: @widget_connector).perform
        rescue ::Widget::ContextSanitizer::ContextTooLargeError
          return render_error(status: :unprocessable_entity, code: "contextTooLarge")
        end

        chat = find_or_create_chat
        return if performed? # cota esgotada: a resposta já saiu
        return render_error(status: :too_many_requests, code: "rateLimited") if rate_limited?(chat)

        # Antes de gravar o cartão de contexto e a abordagem proativa, que não são a mensagem
        # do visitante: o widget manda o contexto da página já na primeira.
        first_message = !ChatMessage::Base.where(chat_id: chat.id, :role.in => ChatMessage::Base::REAL_ROLES).exists?

        apply_result = ::Widget::ContextStore.apply(chat, sanitized_context) if sanitized_context.present?
        # Registro no histórico quando o contexto mudou de fato: cartão de contexto no chat.
        ::Widget::ContextHistoryWriter.record(chat, apply_result.context) if apply_result&.changed?
        persist_proactive_message(chat)

        text_message = ChatMessage::Text.create!(
          role: "user",
          content: content,
          chat: chat,
          sender_name: chat.user_name,
          message_origin: "platform",
          message_id: params[:client_message_id].presence,
          context_message: sanitized_context&.slice("page", "product").presence
        )

        ActionCable.server.broadcast(
          @widget_connector.chat_stream(chat),
          {
            type: "message",
            role: "user",
            messageId: text_message.id.to_s,
            content: content,
            sentAt: text_message.created_at.iso8601,
            context: text_message.context_message
          }
        )

        Chats::InboundFlow.call(chat: chat, message: text_message, text: content, first_message: first_message)

        render json: {
          messageId: text_message.id.to_s,
          chatId: chat.id.to_s,
          status: "queued"
        }, status: :created
      end

      # GET /widget/v1/messages?since=<message_id>
      def index
        chat = find_chat
        return render(json: { messages: [] }) unless chat

        scope = ChatMessage::Base.where(chat_id: chat.id, :role.in => %w[user assistant])
        if params[:since].present?
          cutoff = ChatMessage::Base.where(chat_id: chat.id, id: params[:since].to_s).take
          scope = scope.where(:created_at.gt => cutoff.created_at) if cutoff
        end

        # Do fim para o começo com limite: as 100 mais RECENTES, em ordem cronológica.
        messages = scope.order_by(created_at: :desc).limit(100).to_a.reverse.map { |message| serialize_message(message) }
        render json: { messages: messages }
      end

      private

      # Um visitante não afoga um site inteiro mesmo abaixo do limite global por IP.
      def throttle_per_visitor!
        throttle_endpoint!(scope: "widget:messages:visitor", limit: 60, key: @visitor_id)
      end

      # Teto diário por widget. 0 é sem limite.
      def enforce_daily_message_cap!
        cap = @widget_connector.daily_message_cap.to_i
        return true if cap <= 0

        scope = "widget:messages:daily"
        key = @widget_connector.id.to_s
        if widget_quota_exceeded?(scope: scope, limit: cap, key: key)
          render_error(status: :too_many_requests, code: "dailyQuotaExceeded")
          return false
        end
        counter_increment(scope: scope, period: 1.day, key: key)
        true
      end

      # Guarda a abordagem proativa que o visitante respondeu, um segundo antes da resposta
      # dele. O widget só manda na primeira resposta depois da abordagem; a que ninguém
      # respondeu não vira histórico. O visitante já a viu, então não há transmissão.
      def persist_proactive_message(chat)
        content = params[:proactive_message].to_s.strip
        return if content.blank?

        content = truncate_field(content, MAX_PROACTIVE_LENGTH)
        # Só de retentativa: o mesmo texto repetido em pouco tempo (reenvio de rede) não
        # duplica. Fora dessa janela a página do cliente pode abordar de novo.
        return if ChatMessage::Base.where(
          chat_id: chat.id,
          message_origin: "widget_proactive",
          content: content,
          :created_at.gte => 1.minute.ago
        ).exists?

        message = ChatMessage::Text.new(
          role: "assistant",
          content: content,
          chat: chat,
          sender_name: @widget_connector.bot_display_name,
          message_origin: "widget_proactive",
          created_at: 1.second.ago
        )
        message.skip_chat_sync = true
        message.save
      end

      def find_or_create_chat
        chat = find_chat
        return chat if chat

        if new_visitor_quota_exceeded?
          render_error(status: :too_many_requests, code: "visitorQuotaExceeded")
          return nil
        end

        chat = build_chat(
          user_name: truncate_field(params[:visitor_name], WidgetThrottling::MAX_NAME_LENGTH).presence || "Visitante"
        )
        chat.save!

        counter_increment(scope: "widget:visitors:daily", period: 1.day, key: @widget_connector.id.to_s)

        ActionCable.server.broadcast(
          @widget_connector.visitor_stream(@visitor_id),
          { type: "chat_created", chatId: chat.id.to_s }
        )

        chat
      end

      def rate_limited?(chat)
        limit = @widget_connector.rate_limit_per_min.to_i
        return false if limit <= 0

        ChatMessage::Base.where(chat_id: chat.id, role: "user", :created_at.gte => 1.minute.ago).count >= limit
      end

      def serialize_message(message)
        {
          id: message.id.to_s,
          role: message.role,
          content: message.content,
          senderName: message.sender_name,
          createdAt: message.created_at.iso8601,
          context: message.context_message.presence
        }
      end
    end
  end
end
