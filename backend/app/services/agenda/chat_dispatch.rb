module Agenda
  # Entrega o texto de um lembrete ou passo pelo canal da conversa, em partes quando precisa, com
  # o histórico gravado como em qualquer outra mensagem.
  #
  # Texto configurado por uma pessoa segue inteiro, como ela escreveu. Texto gerado quebra em
  # parágrafos e links, que é como ele fica natural no WhatsApp.
  class ChatDispatch
    # @param generated [Boolean] o texto veio do modelo
    # @raise [StandardError] quando o canal levanta: a mensagem já está `failed`, com a causa
    def self.call(chat:, text:, sender_name:, generated: false)
      new(chat, text, sender_name, generated).call
    end

    def initialize(chat, text, sender_name, generated)
      @chat = chat
      @text = text
      @sender_name = sender_name
      @generated = generated
    end

    def call
      parts = handled_parts
      @has_span = parts.size > 1

      if @has_span
        ChatMessage::Text.create(role: "assistant", content: text, chat: chat, has_span: true, sender_name: sender_name)
      end

      parts.each { |part| part.is_a?(MediaMessageDto) ? send_media(part) : send_text(part.to_s) }

      chat.update_last_message
      chat.save
    end

    private

    attr_reader :chat, :text, :sender_name, :generated

    def handled_parts
      options = generated ? {} : { min_line_breaks: 10, split_links: false }

      MessageHandling.new(chat.organization, **options).perform(text)
    rescue AttachmentNotFoundException => e
      Rails.logger.error("[Agenda::ChatDispatch] #{e.message}")
      [ text ]
    end

    def send_text(part)
      chat.send_text_message(part, sender_name, { is_span: @has_span, message_origin: "platform" })
    end

    def send_media(dto)
      Chats::SendMedia.call(chat: chat, media: dto, sender_name: sender_name, attributes: { is_span: @has_span })
    end
  end
end
