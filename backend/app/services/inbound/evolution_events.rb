module Inbound
  # Eventos da Evolution API v2 (e do provider AIVA, que fala o mesmo formato). Na origem
  # chegavam por RabbitMQ; aqui, pelo webhook `/inbound/evolution/:codename`.
  class EvolutionEvents < Base
    include PublicMediaUrl

    JID_SUFFIX = "@s.whatsapp.net".freeze
    MISSING_MESSAGE = "--MISSING-MESSAGE--".freeze

    # @return [Inbound::EvolutionEvents, nil] nil quando o nome não é de uma instância nossa
    def self.for_codename(payload, codename)
      return nil unless codename.to_s.start_with?(Connector::WhatsappWeb::PREFIX_INSTANCE)

      connector = Connector::WhatsappWeb.where(id: codename.to_s.delete_prefix(Connector::WhatsappWeb::PREFIX_INSTANCE)).take
      connector && new(payload, connector: connector)
    end

    def call
      case payload[:event]
      when "qrcode.updated" then qrcode_updated_event
      when "connection.update" then connection_update_event
      when "messages.upsert" then messages_upsert_event
      when "presence.update" then presence_update_event
      when "contacts.upsert", "contacts.update" then contacts_upsert_event
      else
        Rails.logger.debug { "[Inbound::EvolutionEvents] Unhandled event: #{payload[:event]}" }
      end
    end

    private

    # ========================================================================
    # qrcode.updated
    # ========================================================================

    def qrcode_updated_event
      data = payload[:data]
      status_code = data&.dig(:statusCode)
      qrcode_base64 = data&.dig(:qrcode, :base64)
      pair_code = data&.dig(:qrcode, :pairCode)

      if status_code != 500
        Rails.cache.write("qrcode.base64.#{connector.id}", qrcode_base64, expires_in: 15.minutes)
        Rails.cache.write("pair_code.#{connector.id}", pair_code, expires_in: 15.minutes) if pair_code

        connector.broadcast_connection(
          status: :qr_updated,
          base64: qrcode_base64,
          pairCode: pair_code || Rails.cache.read("pair_code.#{connector.id}")
        )
      else
        Rails.cache.delete("qrcode.base64.#{connector.id}")
        connector.status = :failed
        connector.save
        connector.broadcast_connection(status: :qr_timeout, base64: "")
      end
    end

    # ========================================================================
    # connection.update
    # ========================================================================

    def connection_update_event
      data = payload[:data]
      status_reason = data&.dig(:statusReason)
      state = data&.dig(:state)

      if status_reason == 403 && !connector.reject?
        Rails.logger.warn("[Evolution] Possível bloqueio: #{connector.number_formated} (conector #{connector.id})")
        connector.status = :reject
        connector.save
        Connectors::Alerts.disconnected(connector, message: I18n.t("connectors.disconnection.blocked", name: connector.display_name))
      elsif status_reason == 401
        connector.status = :closed
        connector.save
        Connectors::Alerts.disconnected(connector, message: I18n.t("connectors.disconnection.whatsapp", name: connector.display_name))
      elsif status_reason == 200 && state != "connecting"
        if connector.reject?
          Rails.logger.warn("[#{connector.number_id}|#{connector.id}] Connection Rejected")
          return
        end

        connector.status = :active
        connector.fetch_current_information(ignore_migration: true)
        connector.save
        connector.broadcast_connection(status: :success_scan, base64: "")
        Connectors::Alerts.reconnected(connector)
      end
    end

    # ========================================================================
    # messages.upsert
    # ========================================================================

    def messages_upsert_event
      data = payload[:data]
      return unless data

      key_data = data[:key]
      return unless key_data

      raw_jid = (key_data[:remoteJid] || "").include?("@lid") && (key_data[:remoteJidAlt] || "").include?(JID_SUFFIX) ? key_data[:remoteJidAlt] : key_data[:remoteJid]
      message_id = key_data[:id]
      from_me = key_data[:fromMe] == true

      return if raw_jid.blank? || !raw_jid.end_with?(JID_SUFFIX)

      # Só o telefone vai para o banco: o sufixo é descartado.
      remote_jid = raw_jid.delete_suffix(JID_SUFFIX)

      message_data = data[:message]
      push_name = data[:pushName]
      message_created_at = data[:messageTimestamp].present? ? Time.zone.at(data[:messageTimestamp]).in_time_zone("America/Sao_Paulo") : nil

      return if invalid_protocol_message?(message_data, remote_jid)

      stub_parameter = data.dig(:messageStubParameters, 0)
      if stub_parameter.present? && !stub_parameter.include?("Message absent from node")
        Rails.logger.warn("#{stub_parameter} - #{remote_jid}")
        return
      end

      if connector.paused?
        Rails.logger.info("[AUTOMATION PAUSED] Skipping message #{message_id}")
        return
      end

      context_message = message_data&.dig(:extendedTextMessage, :contextInfo) || {}

      chat = Chats::Locator.find_or_create(
        connector: connector,
        phone: remote_jid,
        attributes: {
          origin_entry_point: context_message[:entryPointConversionApp],
          profile_picture_url: Rails.cache.read("ppu-#{remote_jid}")
        }
      )

      message_cache_key = "id_performed.#{chat.id}.#{message_id}"
      return if Rails.cache.read(message_cache_key)

      Rails.cache.delete("presence.#{chat.id}")
      Rails.cache.write(message_cache_key, true, expires_in: 15.minutes)

      # Reação e figurinha saem antes de qualquer coisa que dependa de texto ou mídia.
      if message_data&.dig(:reactionMessage).present?
        return handle_reaction_message(chat, message_data[:reactionMessage], from_me, push_name)
      end

      if message_data&.dig(:stickerMessage).present?
        return handle_sticker_message(chat, message_data, message_id, from_me, message_created_at)
      end

      edited = message_data&.dig(:protocolMessage, :type) == "MESSAGE_EDIT"
      original_id = edited ? message_data&.dig(:protocolMessage, :key, :id) : message_id

      existing = ChatMessage::Base.where(chat_id: chat.id, message_id: original_id).take
      if existing && !existing.missing_message
        Rails.logger.warn("Message #{message_id} already exists")
        return
      end

      clear_context_if_inactive(chat)

      if (audio_url = audio_url_from(message_data))
        return enqueue_audio(chat, audio_url, message_id, from_me, push_name, data)
      end

      if (document_url = document_url_from(message_data))
        return enqueue_document(chat, document_url, message_id, from_me, message_data, data)
      end

      if (image_url = message_data&.dig(:imageMessage, :url))
        return enqueue_image(chat, image_url, message_id, from_me, message_data, data)
      end

      process_text(chat, text_from(message_data), message_data, message_id, from_me, push_name, context_message, message_created_at, existing)
    end

    def invalid_protocol_message?(message_data, remote_jid)
      return false unless message_data&.dig(:protocolMessage, :peerDataOperationRequestResponseMessage).present? ||
                          message_data&.dig(:protocolMessage, :type) == "EPHEMERAL_SYNC_RESPONSE"

      Rails.logger.warn("[ProtocolMessage] #{remote_jid} Not Valid Message")
      true
    end

    def text_from(message_data)
      message_data&.dig(:conversation) ||
        message_data&.dig(:extendedTextMessage, :text) ||
        message_data&.dig(:ephemeralMessage, :message, :extendedTextMessage, :text) ||
        message_data&.dig(:listResponseMessage, :title) ||
        message_data&.dig(:protocolMessage, :editedMessage, :conversation) ||
        message_data&.dig(:editedMessage, :message, :protocolMessage, :editedMessage, :conversation) ||
        MISSING_MESSAGE
    end

    def audio_url_from(message_data)
      return nil unless message_data&.dig(:audioMessage).present?

      message_data[:mediaUrl] || message_data.dig(:audioMessage, :url)
    end

    def document_url_from(message_data)
      message_data&.dig(:documentMessage, :url) ||
        message_data&.dig(:videoMessage, :url) ||
        message_data&.dig(:documentWithCaptionMessage, :message, :documentMessage, :url)
    end

    def raw_message(data)
      { key: data[:key], message: data[:message] }.to_json
    end

    def enqueue_audio(chat, audio_url, message_id, from_me, push_name, data)
      AudioMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, audio_url, message_id, from_me, push_name, raw_message(data)
      )
    end

    def enqueue_document(chat, document_url, message_id, from_me, message_data, data)
      properties = message_data[:documentMessage] ||
                   message_data[:videoMessage] ||
                   message_data.dig(:documentWithCaptionMessage, :message, :documentMessage)

      ImageMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, document_url, message_id, from_me, properties.to_json, raw_message(data)
      )
    end

    def enqueue_image(chat, image_url, message_id, from_me, message_data, data)
      properties = { mimetype: "image", caption: message_data.dig(:imageMessage, :caption) }

      ImageMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, image_url, message_id, from_me, properties.to_json, raw_message(data)
      )
    end

    def process_text(chat, message, message_data, message_id, from_me, push_name, context_message, created_at, existing)
      return Rails.logger.warn("Input message not supported") if message.blank?

      if Chats::InboundCommands.handle(chat: chat, connector: connector, text: message, to: chat.phone_number)
        return
      end

      # `message` nulo é o "Message absent from node": a mensagem ainda vai chegar. Com
      # outro conteúdo (tipo que não entendemos), não há o que guardar.
      if message.eql?(MISSING_MESSAGE) && (from_me || message_data.present?)
        return Rails.logger.warn("No valid message for #{chat.phone_number}")
      end

      missing_message = message.eql?(MISSING_MESSAGE)
      message = "." if missing_message

      chat.update(user_name: push_name) if !from_me && push_name.present? && chat.user_name != push_name

      first_message = existing ? !ChatMessage::Base.where(chat_id: chat.id, :id.ne => existing.id).exists? : first_message?(chat)

      existing&.update(content: message, missing_message: false)
      history = existing || create_text_message(
        chat, message,
        message_id: message_id,
        from_me: from_me,
        context_message: context_message,
        reply_to_message_id: resolve_reply_to(chat, context_message[:stanzaId]),
        missing_message: missing_message || nil,
        created_at: created_at
      )

      if missing_message
        ChatMessage::Text.create(
          role: "base",
          content: I18n.t("connectors.notes.waiting_message"),
          role_base_type: "context-fup",
          chat: chat
        )
      end

      Chats::InboundFlow.call(
        chat: chat,
        message: history,
        text: message,
        first_message: first_message,
        from_me: from_me,
        dispatch: !missing_message
      )
    end

    # ========================================================================
    # stickerMessage
    # ========================================================================

    # A figurinha entra no histórico como mídia `sticker` apontando direto para a URL do
    # bucket da Evolution, sem guardar arquivo aqui.
    #
    # `is_span: true` (com `has_span: false`) deixa a figurinha fora do default_scope, e
    # portanto do contexto da IA. O chat não é afetado porque consulta com
    # `unscoped.list_for_chat`, que aceita partes.
    def handle_sticker_message(chat, message_data, message_id, from_me, created_at)
      sticker_url = public_media_url(message_data[:mediaUrl])
      if sticker_url.blank?
        # `stickerMessage.url` aponta para o CDN da Meta (arquivo `.enc`, criptografado):
        # sem o `mediaUrl` do bucket não há o que exibir.
        Rails.logger.warn("[Evolution] Sticker sem mediaUrl utilizável em #{chat.id}: ignorado")
        return
      end

      return if already_persisted?(chat, message_id)

      role = from_me ? "assistant" : "user"
      ChatMessage::Media.create(
        sticker_attributes(message_data[:stickerMessage], sticker_url, role).merge(
          chat: chat,
          message_id: message_id,
          created_at: created_at
        )
      )

      sync_sticker_preview(chat, role, from_me)
      chat.pause_automation_for_human! if from_me
    end

    def sticker_attributes(sticker, sticker_url, role)
      {
        role: role,
        message_origin: role == "assistant" ? "user" : "platform",
        media_type: "sticker",
        media_url: sticker_url,
        content: "",
        caption: "",
        has_span: false,
        is_span: true,
        media_properties: {
          "mimetype" => sticker&.dig(:mimetype),
          "isAnimated" => sticker&.dig(:isAnimated)
        }.compact
      }
    end

    # O sync de last_message_* aborta em mensagens `is_span`, então a prévia da lista é
    # gravada aqui.
    def sync_sticker_preview(chat, role, from_me)
      chat.set(
        last_message_at: Time.now,
        last_message_type: "sticker",
        last_message_content: "",
        last_message_by: role,
        unread_messages: from_me ? 0 : chat.unread_messages.to_i + 1
      )
      chat.dispatch_event! unless chat.ignore_events
    end

    # ========================================================================
    # reactionMessage
    # ========================================================================

    # Reação não vira mensagem: ela atualiza a mensagem alvo.
    #
    # `reaction[:key][:id]` é o id externo da mensagem REAGIDA, e o `fromMe` de dentro dessa
    # chave descreve o alvo, não quem reagiu. Quem reagiu vem do `data.key.fromMe` externo.
    def handle_reaction_message(chat, reaction, from_me, push_name)
      target_message_id = reaction&.dig(:key, :id)
      if target_message_id.blank?
        Rails.logger.warn("[Evolution] Reação sem id da mensagem alvo: ignorada")
        return
      end

      target = ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: target_message_id).take
      if target.nil?
        Rails.logger.warn("[Evolution] Mensagem alvo #{target_message_id} da reação não encontrada")
        return
      end

      author = from_me ? "assistant" : "user"
      sender_name = push_name.presence unless from_me

      # O before_update da mensagem transmite quando `reactions` muda: é assim que a bolha
      # reage em tempo real.
      target.update(reactions: target.apply_reaction(reaction[:text].to_s, from: author, sender_name: sender_name))
    end

    # ========================================================================
    # presence.update
    # ========================================================================

    def presence_update_event
      data = payload[:data]
      raw_jid = data&.dig(:id)
      phone_number = data&.dig(:phoneNumber).presence || raw_jid&.delete_suffix(JID_SUFFIX)
      return if phone_number.blank?

      chat = Chats::Locator.find(connector: connector, phone: phone_number)
      return unless chat

      # `presences` é chaveado pelo JID completo: a chave original só serve para o lookup.
      presence = data&.dig(:presences, raw_jid, :lastKnownPresence)
      Rails.cache.write("presence.#{chat.id}", presence, expires_in: 10.seconds)
    end

    # ========================================================================
    # contacts.upsert / contacts.update
    # ========================================================================

    # A Evolution emite o contato em duas formas: um objeto, quando o evento nasce de uma
    # mensagem recebida, e um array, na sincronização em lote da agenda.
    def contacts_upsert_event
      Array.wrap(payload[:data]).each { |contact| update_contact(contact) }
    rescue StandardError => e
      Rails.logger.error("[Inbound::EvolutionEvents] #{e.full_message}")
    end

    def update_contact(contact)
      return unless contact.is_a?(Hash)

      # `remoteJid`/`profilePicUrl` são os nomes atuais; `id`/`profilePictureUrl`, os antigos.
      raw_jid = contact[:remoteJid].presence || contact[:id].presence
      return if raw_jid.blank?

      # Um @lid não é resolvível aqui: o fluxo da Evolution grava a conversa só com o telefone.
      return unless raw_jid.end_with?(JID_SUFFIX)

      phone_number = raw_jid.delete_suffix(JID_SUFFIX)
      push_name = contact[:pushName].presence
      photo_url = contact[:profilePicUrl].presence || contact[:profilePictureUrl].presence
      return if push_name.blank? && photo_url.blank?

      # Guarda a foto por telefone mesmo sem conversa: quem ainda não escreveu já entra com ela.
      Rails.cache.write("ppu-#{phone_number}", photo_url, expires_in: 1.hour) if photo_url

      updates = {}
      updates[:user_name] = push_name if push_name
      updates[:profile_picture_url] = photo_url if photo_url

      Chat.where(connector_id: connector.id, :external_id.in => BrPhoneVariants.call(phone_number)).update_all("$set" => updates)
    end
  end
end
