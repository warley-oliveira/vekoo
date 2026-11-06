module Inbound
  # Webhook do LeadChat: `MESSAGE_RECEIVED` e `MESSAGE_SENT`. Os dados do contato não vêm
  # no evento, é preciso ler a sessão na API deles.
  class LeadChatEvents < Base
    CLEAR_COMMAND = "--X-CLEAR-CONTEXT-X--".freeze

    def call
      return if payload.dig(:content, :origin).eql?("API")

      session = LeadChatApi::Message.new(client).get_session(session_id, %w[ContactDetails ChannelDetails AgentDetails])
      contact = session[:contactDetails]
      phone_number = contact[:phonenumber]&.remove(/\+|\|/) || contact[:instagram] || contact[:id]

      if phone_number.blank?
        Rails.logger.warn("[LeadChat] Contato sem telefone na sessão #{session_id}")
        return
      end

      message_cache_key = "id_performed.#{content_id}"
      return if Rails.cache.read(message_cache_key)

      Rails.cache.write(message_cache_key, true, expires_in: 15.minutes)

      chat = locate_chat(phone_number, contact, session)
      return if already_persisted?(chat, content_id)

      case payload.dig(:content, :type)
      when "TEXT" then process_text(chat, contact, session)
      when "AUDIO" then process_audio(chat, phone_number, contact)
      else
        Rails.logger.warn("[LeadChat] Unsupported type: #{payload.dig(:content, :type)}")
      end
    end

    private

    def client
      LeadChatApi::Client.new(connector.access_token)
    end

    def session_id
      payload.dig(:content, :sessionId)
    end

    def content_id
      payload.dig(:content, :id)
    end

    def from_me?
      payload[:eventType] == "MESSAGE_SENT"
    end

    def origin_phone_number(session)
      number = session.dig(:channelDetails, :humanId)&.remove(/\(|\)|-| /)
      number ? "55#{number}" : nil
    end

    def locate_chat(phone_number, contact, session)
      Chats::Locator.find_or_create(
        connector: connector,
        phone: phone_number,
        attributes: {
          external_id: phone_number,
          user_name: contact[:name],
          origin_phone_number: origin_phone_number(session)
        }
      )
    end

    def process_text(chat, contact, session)
      message = payload.dig(:content, :text).to_s
      chat.update(external_fields: { session_id: session_id, contact_id: contact[:id] })

      return if Chats::InboundCommands.handle(
        chat: chat, connector: connector, text: message, to: nil, clear_commands: [ CLEAR_COMMAND ], reactivate: false
      )

      first_message = first_message?(chat)
      history = create_text_message(
        chat, message,
        message_id: content_id,
        from_me: from_me?,
        sender_name: from_me? ? "#{format_number(chat.origin_phone_number)} - #{session.dig(:agentDetails, :name) || 'LeadChat'}" : contact[:name]
      )

      chat.update(
        user_name: contact[:name],
        profile_picture_url: contact[:pictureUrl],
        origin_phone_number: origin_phone_number(session),
        contact_origin: session.dig(:channelDetails, :platform)
      )

      Chats::InboundFlow.call(chat: chat, message: history, text: message, first_message: first_message, from_me: from_me?)
    end

    def process_audio(chat, _phone_number, contact)
      chat.update(external_fields: { session_id: session_id, contact_id: contact[:id] })

      AudioMessageJob.perform_later(
        chat.id.to_s, chat.organization_id, payload.dig(:content, :details, :file, :publicUrl), content_id, from_me?, contact[:name]
      )
    end

    def format_number(number)
      return number if number.blank?

      digits = number.gsub(/\D/, "")
      return number unless digits.start_with?("55")

      national_number = digits[2..]

      case national_number.length
      when 10 then national_number.gsub(/(\d{2})(\d{4})(\d{4})/, '(\1) \2-\3')
      when 11 then national_number.gsub(/(\d{2})(\d{1})(\d{4})(\d{4})/, '(\1) \2\3-\4')
      else number
      end
    end
  end
end
