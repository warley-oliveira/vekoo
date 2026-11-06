module Inbound
  # Webhooks da Z-API: mensagem recebida, desconexão e conexão da instância.
  # https://developer.z-api.io/webhooks/on-message-received
  class ZapiEvents < Base
    DISCONNECTION_ERROR_TRANSLATIONS = {
      "the number was disconnected by a possible whatsapp number blocking" => "number_blocked",
      "it was not possible to restore a session with the current token, please login again" => "session_expired"
    }.freeze

    def on_message_received
      return if skip_message?
      return unless acquire_message_lock

      find_or_create_chat
      return if message_already_processed?

      process_message
    rescue StandardError
      # O job vai tentar de novo: as travas não podem barrar a própria retentativa.
      release_message_locks
      raise
    end

    def on_whatsapp_disconnected
      connector.update(status: :closed)
      log_disconnection_event
      Connectors::Alerts.disconnected(connector, message: disconnection_reason || default_disconnection_message)
    end

    def on_whatsapp_connected
      if connector.pending?
        connector.broadcast_connection(status: :success_scan, base64: "")
        connector.status = :active
        connector.tolerate_profile_failure = true
        connector.number_id = payload[:phone] if payload[:phone].present?
        connector.save!
        sign_instance
        connector.migrate_chats
      end
      Connectors::Alerts.reconnected(connector)
    end

    private

    attr_reader :chat

    def sign_instance
      connector.sign_zapi_instance
    rescue ZapiClient::Error => e
      Rails.logger.error("[ZApi] Instance not signed: #{e.message}")
    end

    def skip_message?
      payload[:isGroup] || payload[:isNewsletter] || payload[:notification].present?
    end

    # ========================================================================
    # Dados do payload
    # ========================================================================

    def phone_number
      raw = payload[:phone]
      raw.present? && !raw.to_s.end_with?("@lid") ? raw : nil
    end

    def chat_lid
      explicit_lid = payload[:chatLid]
      return explicit_lid if explicit_lid.present?

      # phone pode vir com @lid (ex: "206317981536394@lid")
      raw = payload[:phone]
      raw.present? && raw.to_s.end_with?("@lid") ? raw : nil
    end

    def message_id
      payload[:messageId]
    end

    def from_me?
      payload[:fromMe] == true
    end

    def sender_name
      normalize_name(from_me? ? payload[:chatName] : payload[:senderName])
    end

    def sender_photo
      payload[:senderPhoto] || payload[:photo]
    end

    def message_timestamp
      payload[:momment] ? Time.zone.at(payload[:momment] / 1000).in_time_zone("America/Sao_Paulo") : nil
    end

    def text_content
      payload.dig(:text, :message)
    end

    def message_type
      return :text if text_content.present?
      return :image if payload[:image].present?
      return :audio if payload[:audio].present?
      return :video if payload[:video].present?
      return :document if payload[:document].present?
      return :sticker if payload[:sticker].present?
      return :location if payload[:location].present?
      return :contact if payload[:contact].present?
      return :waiting if payload[:waitingMessage]

      :unknown
    end

    # ========================================================================
    # Conversa
    # ========================================================================

    # Pelo telefone (com as variantes do 9º dígito) ou pelo @lid, inclusive os registros em
    # que o @lid foi salvo em external_id.
    def find_or_create_chat
      @chat = find_chat || create_chat
      update_chat_context
    end

    def find_chat
      found = Chats::Locator.find(connector: connector, phone: phone_number) if phone_number.present?
      return found if found || chat_lid.blank?

      Chat.where(connector_id: connector.id, external_lid: chat_lid).take ||
        Chat.where(connector_id: connector.id, :external_id.in => [ chat_lid, "#{chat_lid}@s.whatsapp.net" ]).take
    end

    def create_chat
      attributes = {
        external_lid: chat_lid,
        profile_picture_url: sender_photo,
        user_name: from_me? ? payload[:chatName] : payload[:senderName]
      }

      if phone_number.present?
        Chats::Locator.find_or_create(connector: connector, phone: phone_number, attributes: attributes)
      else
        Chats::Locator.create_once("#{connector.id}.#{chat_lid}", find: -> { find_chat }) do
          Chat.create!(
            connector: connector,
            organization_id: connector.organization_id,
            external_id: chat_lid,
            automation_enabled: organization.default_automation_enabled,
            **attributes
          )
        end
      end
    end

    def update_chat_context
      Rails.cache.delete("presence.#{chat.id}")

      clear_context_if_inactive(chat)

      # Registros antigos: leva o @lid do external_id para external_lid.
      if chat.external_id.to_s.end_with?("@lid", "@lid@s.whatsapp.net")
        lid_value = chat.external_id.to_s.sub(/@s\.whatsapp\.net\z/, "")
        chat.external_lid = lid_value if chat.external_lid.blank?
        chat.external_id = lid_value
      end

      chat.external_lid = chat_lid if chat_lid.present? && chat.external_lid.blank?

      # Chegou o telefone de verdade e o campo está vazio ou com @lid.
      if phone_number.present? && (chat.external_id.blank? || chat.external_id.to_s.end_with?("@lid"))
        chat.external_id = phone_number
      end

      chat.update({ last_message_at: Time.current, profile_picture_url: sender_photo, user_name: sender_name }.compact)
    end

    # ========================================================================
    # Mensagem
    # ========================================================================

    def acquire_message_lock
      return true if message_id.blank?

      Rails.cache.write("zapi.lock.#{message_id}", true, expires_in: 15.seconds, unless_exist: true)
    end

    def message_already_processed?
      return true if payload[:fromApi]

      cache_key = "zapi.id_performed.#{chat.id}.#{message_id}"
      return true if Rails.cache.read(cache_key)

      Rails.cache.write(cache_key, true, expires_in: 5.minutes)
      already_persisted?(chat, message_id)
    end

    def release_message_locks
      Rails.cache.delete("zapi.lock.#{message_id}")
      Rails.cache.delete("zapi.id_performed.#{chat.id}.#{message_id}") if chat
    end

    def process_message
      # Anúncio Click-to-WhatsApp: registra o cartão de saudação e segue o fluxo normal.
      handle_ad_greeting if payload[:externalAdReply].present?

      case message_type
      when :text then process_text_message
      when :audio then process_audio_message
      when :image then process_image_message
      when :video, :document then process_document_message
      when :waiting then process_waiting_message
      else
        Rails.logger.warn("[ZApi] Unsupported message type: #{message_type}")
      end
    end

    def process_text_message
      message = text_content
      return if message.blank?
      return if Chats::InboundCommands.handle(chat: chat, connector: connector, text: message, to: phone_number || chat_lid)

      first_message = first_message?(chat)
      history = create_text_message(
        chat, message,
        message_id: message_id,
        from_me: from_me?,
        reply_to_message_id: resolve_reply_to(chat, payload[:referenceMessageId].presence),
        created_at: message_timestamp
      )

      Chats::InboundFlow.call(chat: chat, message: history, text: message, first_message: first_message, from_me: from_me?)
    end

    def process_audio_message
      audio_url = payload.dig(:audio, :audioUrl)
      return if audio_url.blank?

      AudioMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, audio_url, message_id, from_me?, sender_name, message_object.to_json
      )
    end

    def process_image_message
      image_url = payload.dig(:image, :imageUrl)
      return if image_url.blank?

      properties = { mimetype: payload.dig(:image, :mimeType) || "image", caption: payload.dig(:image, :caption) }

      ImageMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, image_url, message_id, from_me?, properties.to_json, message_object.to_json
      )
    end

    def process_document_message
      content = payload[:document] || payload[:video]
      document_url = content[:documentUrl] || content[:videoUrl]
      return if document_url.blank?

      properties = {
        mimetype: content[:mimeType],
        fileName: content[:fileName],
        title: content[:title],
        caption: content[:caption]
      }

      ImageMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, document_url, message_id, from_me?, properties.to_json, message_object.to_json
      )
    end

    # A mensagem ainda não chegou inteira: fica a nota até a Z-API entregar o conteúdo.
    def process_waiting_message
      Rails.logger.warn("[ZApi] Waiting message for #{phone_number}")

      # O conteúdo chega depois, com este mesmo id: as travas não podem barrá-lo.
      release_message_locks
      return unless Rails.cache.write("zapi.waiting.#{chat.id}.#{message_id}", true, expires_in: 5.minutes, unless_exist: true)

      ChatMessage::Text.create(
        role: "base",
        content: ".",
        role_base_type: "waiting-message",
        chat: chat,
        missing_message: true
      )
    end

    def message_object
      {
        phone: phone_number,
        messageId: message_id,
        fromMe: from_me?,
        senderName: sender_name,
        momment: payload[:momment],
        type: message_type.to_s,
        message_type.to_s => payload[message_type]
      }
    end

    # Bloco enviado quando o lead chega por anúncio Click-to-WhatsApp. Role 'base' fica
    # fora do contexto da IA e do default_scope.
    def handle_ad_greeting
      ad = payload[:externalAdReply]

      # `ctwaClid` é único por clique, e a nova tentativa do job passa por aqui de novo.
      return if ad[:ctwaClid].present? &&
                ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "instagram-ad-greeting", "external_ad_reply.ctwa_clid" => ad[:ctwaClid]).exists?

      ChatMessage::Text.create(
        role: "base",
        role_base_type: "instagram-ad-greeting",
        content: ad[:greetingMessageBody].presence || ad[:title].presence || I18n.t("connectors.notes.ad_greeting"),
        chat: chat,
        message_origin: "platform",
        # Logo antes da mensagem do contato, para o cartão aparecer acima dela.
        created_at: message_timestamp ? message_timestamp - 1.second : nil,
        external_ad_reply: normalized_external_ad_reply(ad)
      )
    end

    def normalized_external_ad_reply(ad_reply)
      {
        title: ad_reply[:title],
        body: ad_reply[:body],
        source_app: ad_reply[:sourceApp],
        source_type: ad_reply[:sourceType],
        source_url: ad_reply[:sourceUrl],
        source_id: ad_reply[:sourceId],
        media_url: ad_reply[:mediaUrl],
        media_type: ad_reply[:mediaType],
        thumbnail_url: ad_reply[:thumbnailUrl],
        original_image_url: ad_reply[:originalImageUrl],
        greeting_message_body: ad_reply[:greetingMessageBody],
        automated_greeting_message_shown: ad_reply[:automatedGreetingMessageShown],
        ctwa_clid: ad_reply[:ctwaClid]
      }.compact
    end

    # ========================================================================
    # Desconexão
    # ========================================================================

    def disconnection_reason
      error_message = payload[:error].presence
      return nil if error_message.blank?

      key = DISCONNECTION_ERROR_TRANSLATIONS[error_message.downcase.strip]
      key ? I18n.t("connectors.disconnection.#{key}") : error_message
    end

    def default_disconnection_message
      I18n.t("connectors.disconnection.whatsapp", name: connector.display_name)
    end

    def log_disconnection_event
      Connector::DisconnectionLog.record!(
        connector: connector,
        raw_error: payload[:error].presence,
        translated_reason: disconnection_reason,
        payload: payload
      )
    end
  end
end
