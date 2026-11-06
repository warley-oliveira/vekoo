module Inbound
  # Webhook de Messenger e Instagram Direct. Um endpoint só: `object` diz a rede e o
  # `entry.id` diz qual conector.
  class MetaMessagingEvents < Base
    def call
      Array(payload[:entry]).each do |entry|
        next unless connector_for_entry(entry)

        Array(entry[:messaging]).each { |event| process_event(event) }
      end
    end

    private

    def connector_for_entry(entry)
      entry_id = entry[:id].to_s

      @connector =
        case payload[:object]
        when "page"
          @audience_type = "facebook"
          Connector::FacebookMessenger.where(page_id: entry_id).take
        when "instagram"
          @audience_type = "instagram"
          Connector::InstagramDirect.where(instagram_account_id: entry_id).take
        end

      Rails.logger.warn("[MetaMessaging] Connector not found for #{payload[:object]} entry #{entry_id}") unless @connector
      @connector
    end

    def process_event(event)
      if event[:message].present?
        process_message(event)
      elsif event[:delivery].present?
        process_delivery(event)
      elsif event[:read].present?
        process_read(event)
      elsif event[:postback].present?
        process_postback(event)
      elsif event[:reaction].present?
        Rails.logger.info("[MetaMessaging] Reaction event received: ignoring")
      else
        Rails.logger.warn("[MetaMessaging] Unknown event type: #{event.keys}")
      end
    end

    def process_message(event)
      sender_id = event.dig(:sender, :id)
      message = event[:message]
      return if message[:is_echo]

      chat = find_or_create_chat(sender_id)

      if message[:text].present?
        process_text_message(chat, sender_id, message[:text], message[:mid])
      elsif message[:attachments].present?
        message[:attachments].each_with_index do |attachment, index|
          # Várias mídias numa mensagem só dividem o `mid`: o índice mantém cada uma distinta.
          process_attachment(chat, sender_id, attachment, index.zero? ? message[:mid] : "#{message[:mid]}-#{index}")
        end
      end
    end

    def process_text_message(chat, sender_id, text, message_id)
      return if already_persisted?(chat, message_id)
      return if Chats::InboundCommands.handle(chat: chat, connector: connector, text: text, to: sender_id, reactivate: false)

      first_message = first_message?(chat)
      history = create_text_message(chat, text, message_id: message_id)

      Chats::InboundFlow.call(chat: chat, message: history, text: text, first_message: first_message)
    end

    def process_attachment(chat, sender_id, attachment, message_id)
      type = attachment[:type]
      attachment_payload = attachment[:payload] || {}
      url = attachment_payload[:url]

      case type
      when "image" then enqueue_media(chat, url, message_id, mimetype: "image")
      when "audio" then enqueue_audio(chat, url, message_id)
      when "video", "reel", "ig_reel" then enqueue_media(chat, url, message_id, mimetype: type, extension: "mp4", **media_info(attachment_payload))
      when "file" then enqueue_media(chat, url, message_id, mimetype: "file", extension: attachment_payload[:name]&.split(".")&.last || "bin", **media_info(attachment_payload))
      when "fallback" then process_fallback(chat, sender_id, attachment, attachment_payload, message_id)
      else
        Rails.logger.warn("[MetaMessaging] Unsupported attachment type: #{type}")
      end
    end

    def media_info(attachment_payload)
      { fileName: attachment_payload[:name], fileLength: attachment_payload[:size] }.compact
    end

    def process_fallback(chat, sender_id, attachment, attachment_payload, message_id)
      url = attachment_payload[:url] || attachment[:url] || ""
      text = [ attachment_payload[:title], url ].compact_blank.join(" — ")
      process_text_message(chat, sender_id, text, message_id) if text.present?
    end

    def enqueue_media(chat, url, message_id, **properties)
      return unless url
      return if already_persisted?(chat, message_id)

      ImageMessageJob.perform_later(chat.id.to_s, chat.organization_id, url, message_id, false, properties.to_json)
    end

    def enqueue_audio(chat, url, message_id)
      return unless url
      return if already_persisted?(chat, message_id)

      AudioMessageJob.perform_later(chat.id.to_s, chat.organization_id, url, message_id, false)
    end

    # O remetente do evento de entrega é o contato: o escopo é a conversa dele, e não todas
    # as conversas do conector, como na origem.
    def process_delivery(event)
      mids = event.dig(:delivery, :mids)
      return if mids.blank?

      chat = Chat.where(connector_id: connector.id, external_id: event.dig(:sender, :id)).take
      return unless chat

      ChatMessage::Base.unscoped.where(chat_id: chat.id, :message_id.in => mids).each do |message|
        message.update(status: "delivery_ack") unless message.status == "read"
      end
    end

    def process_read(event)
      watermark = event.dig(:read, :watermark)
      return if watermark.blank?

      chat = Chat.where(connector_id: connector.id, external_id: event.dig(:sender, :id)).take
      return unless chat

      ChatMessage::Base.where(
        chat_id: chat.id,
        role: "assistant",
        :created_at.lte => Time.at(watermark / 1000.0),
        :status.ne => "read"
      ).update_all(status: "read")
    end

    def process_postback(event)
      sender_id = event.dig(:sender, :id)
      postback = event[:postback]
      text = postback[:title] || postback[:payload] || ""
      return if text.blank?

      chat = find_or_create_chat(sender_id)
      process_text_message(chat, sender_id, text, "postback_#{event[:timestamp] || Time.now.to_i}")
    end

    # O remetente aqui é um id da rede (PSID/IGSID), não um telefone: sem variantes.
    def find_or_create_chat(sender_id)
      chat = Chat.where(connector_id: connector.id, external_id: sender_id).take || create_chat(sender_id)

      chat.set_default_session! unless chat.session_start_at
      chat.session_start_at = Time.now
      chat.save if chat.changed?
      chat
    end

    def create_chat(sender_id)
      attributes = {
        connector: connector,
        organization_id: connector.organization_id,
        external_id: sender_id,
        automation_enabled: organization.default_automation_enabled,
        status: "open",
        audience_type: @audience_type
      }

      if connector.is_a?(Connector::InstagramDirect)
        profile = connector.fetch_instagram_sender_profile(sender_id)
        if profile
          attributes[:user_name] = profile["name"] || profile["username"]
          attributes[:profile_picture_url] = profile["profile_pic"]
          attributes[:audience_user_name] = profile["username"]
        end
      end

      Chat.create!(attributes)
    end
  end
end
