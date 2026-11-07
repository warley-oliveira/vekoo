module Inbound
  # Webhook da WhatsApp Cloud API (Meta): `statuses` e `messages` de cada `entry`.
  class WhatsappCloudEvents < Base
    # O que foi processado, para diagnóstico: o webhook já respondeu 2xx faz tempo e não
    # há mais a quem devolver isto.
    attr_reader :diagnostics

    def initialize(payload, connector:)
      super
      @diagnostics = { processed: [], warnings: [], errors: [] }
    end

    def call
      Array(payload[:entry]).each do |entry|
        reroute_by_entry(entry)

        Array(entry[:changes]).each do |change|
          value = change[:value] || {}
          phone_number_id = value.dig(:metadata, :phone_number_id)

          Array(value[:statuses]).each { |status| process_status(status, phone_number_id) }
          Array(value[:messages]).each { |message| process_message(message, value, phone_number_id) }
        end
      end

      diagnostics
    end

    private

    # O webhook de aplicativo da Meta é um só: o `entry.id` diz de qual WABA é o evento. Se
    # veio pela URL de outro conector, vale o da WABA.
    def reroute_by_entry(entry)
      entry_id = entry[:id].to_i
      return if entry_id.zero? || [ connector.waba_id, connector.business_id ].include?(entry_id)

      other = Connector::WhatsappCloud.owner_of_entry(entry_id)
      @connector = other if other
    end

    def process_status(status, phone_number_id)
      result = WabaStatusUpdateService.new(connector, status, phone_number_id).call

      case result.code
      when :updated then diagnostics[:processed] << "status:#{result.mapped_status}:#{result.message_id}"
      when :missing_id then warn("status_missing_id")
      when :unknown_status then warn("unknown_status:#{result.waba_status}")
      when :not_found, :retry_scheduled then warn("status_no_message:#{result.message_id}")
      end
    end

    def process_message(message, value, phone_number_id)
      contact = Array(value[:contacts]).find { |candidate| candidate[:wa_id] == message[:from] }
      contact_name = contact&.dig(:profile, :name)

      case message[:type]
      when "text" then processed("text", message) { process_text(message, contact_name, phone_number_id) }
      when "button" then processed("button", message) { process_button(message, contact_name, phone_number_id) }
      when "audio" then processed("audio", message) { process_audio(message, contact_name, phone_number_id) }
      when "image" then processed("image", message) { process_image(message, contact_name, phone_number_id) }
      when "document" then processed("document", message) { process_document(message, contact_name, phone_number_id) }
      else
        warn("unsupported_type:#{message[:type]}")
        Rails.logger.warn("[WABA] Unsupported message type: #{message[:type].inspect}")
      end
    end

    def processed(kind, message)
      diagnostics[:processed] << "#{kind}:#{message[:id]}"
      yield
    end

    def warn(code)
      diagnostics[:warnings] << code
    end

    def locate_chat(message_from, user_name, phone_number_id)
      chat = Chats::Locator.find_or_create(
        connector: connector,
        phone: message_from,
        sender_phone_number_id: phone_number_id,
        attributes: { user_name: user_name, session_start_at: Time.now }
      )

      chat.set_default_session! unless chat.session_start_at
      chat.session_start_at = Time.now
      chat.sender_phone_number_id ||= phone_number_id
      chat.save if chat.changed?
      chat
    end

    # Botão de resposta rápida de template chega como `type: 'button'`, sem nó `text`. O
    # rótulo vira texto comum e segue o caminho normal.
    def process_button(message, user_name, phone_number_id)
      button = message[:button] || {}
      body = button[:text].presence || button[:payload].to_s

      process_text(message.merge(type: "text", text: { body: body }), user_name, phone_number_id)
    end

    def process_text(message, user_name, phone_number_id)
      return unless %i[id from type text].all? { |key| message.key?(key) }

      chat = locate_chat(message[:from], user_name, phone_number_id)
      return if already_persisted?(chat, message[:id])

      # Cartão do anúncio (se a mensagem chegou por um) antes da mensagem do contato.
      handle_ad_greeting(chat, message)

      body = message.dig(:text, :body).to_s
      return if Chats::InboundCommands.handle(chat: chat, connector: connector, text: body, to: message[:from], reactivate: false)

      first_message = first_message?(chat)
      history = create_text_message(
        chat, body,
        message_id: message[:id],
        reply_to_message_id: resolve_reply_to(chat, message.dig(:context, :id))
      )

      Chats::InboundFlow.call(chat: chat, message: history, text: body, first_message: first_message)
    end

    def process_audio(message, user_name, phone_number_id)
      chat = locate_chat(message[:from], user_name, phone_number_id)
      return if already_persisted?(chat, message[:id])

      handle_ad_greeting(chat, message)

      AudioMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, message.dig(:audio, :id), message[:id], false, user_name
      )
    end

    def process_image(message, user_name, phone_number_id)
      chat = locate_chat(message[:from], user_name, phone_number_id)
      return if already_persisted?(chat, message[:id])

      handle_ad_greeting(chat, message)

      image = message[:image] || {}
      ImageMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, image[:id], message[:id], false, image.to_h.to_json
      )
    end

    def process_document(message, user_name, phone_number_id)
      chat = locate_chat(message[:from], user_name, phone_number_id)
      return if already_persisted?(chat, message[:id])

      handle_ad_greeting(chat, message)

      document = message[:document] || {}
      properties = {
        mime_type: document[:mime_type],
        fileName: document[:filename],
        caption: document[:caption]
      }.compact
      ImageMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, document[:id], message[:id], false, properties.to_json
      )
    end

    # Anúncio Click-to-WhatsApp: quando o lead chega por um anúncio, a Meta anexa um bloco
    # `referral` na mensagem. Vira uma nota informativa (cartão do anúncio + saudação),
    # no mesmo formato do fluxo Z-API. Role 'base' mantém fora do contexto da IA.
    def handle_ad_greeting(chat, message)
      referral = message[:referral]
      return if referral.blank?

      normalized = normalized_referral(referral)

      # Idempotência: `ctwa_clid` é único por clique, e webhooks da Meta são reentregues.
      ctwa_clid = normalized[:ctwa_clid]
      if ctwa_clid.present? &&
         ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "instagram-ad-greeting", "external_ad_reply.ctwa_clid" => ctwa_clid).exists?
        warn("ad_greeting_duplicate:#{referral[:source_id]}")
        return
      end

      ChatMessage::Text.create(
        role: "base",
        role_base_type: "instagram-ad-greeting",
        content: referral.dig(:welcome_message, :text).presence ||
                 referral[:headline].presence ||
                 referral[:body].presence ||
                 I18n.t("connectors.notes.ad_greeting"),
        chat: chat,
        message_origin: "platform",
        # Logo antes da mensagem do contato, para o cartão aparecer acima dela.
        created_at: ad_greeting_created_at(message),
        external_ad_reply: normalized
      )

      diagnostics[:processed] << "ad_greeting:#{referral[:source_id]}"
    end

    # Subconjunto do `referral`, no mesmo formato que o fluxo Z-API grava em
    # `external_ad_reply`: a tela monta o cartão igual em qualquer canal.
    def normalized_referral(referral)
      {
        title: referral[:headline],
        body: referral[:body],
        source_type: referral[:source_type],
        source_url: referral[:source_url],
        source_id: referral[:source_id],
        media_url: referral[:video_url].presence || referral[:image_url].presence,
        media_type: referral[:media_type],
        thumbnail_url: referral[:thumbnail_url],
        original_image_url: referral[:image_url],
        greeting_message_body: referral.dig(:welcome_message, :text),
        ctwa_clid: referral[:ctwa_clid]
      }.compact
    end

    # O timestamp WABA vem como epoch em string. Menos 1s para ordenar acima da mensagem.
    def ad_greeting_created_at(message)
      timestamp = message[:timestamp]
      return nil if timestamp.blank?

      Time.zone.at(timestamp.to_i) - 1.second
    end
  end
end
