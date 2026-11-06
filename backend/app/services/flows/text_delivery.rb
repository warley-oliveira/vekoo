module Flows
  # O texto que a automação manda ao contato, em partes quando precisa: anexo citado vira mídia, e a resposta do modelo quebra em
  # parágrafos e links. É o caminho do chat (`Chats::SendOperatorMessage`) e dos lembretes (`Agenda::ChatDispatch`).
  #
  # O que alguém escreveu no editor vai como está (`verbatim`): a limpeza de `MessageHandling` é para texto de modelo, e tirava
  # aspas e til de quem digitou. Só o bloco de IA passa `generated: true`.
  #
  # Anexo citado que sumiu não levanta nem chega ao cliente como código: o resto segue, e o motivo volta em `missing_attachments`,
  # para quem escreveu ficar sabendo.
  class TextDelivery
    VERBATIM_OPTIONS = { min_line_breaks: 10, split_links: false, verbatim: true }.freeze
    # O que a limpeza de `MessageHandling` entende como citação de anexo, na ordem dela: o que está dentro de um link é link.
    # Em texto de modelo, citar o que não existe levanta.
    GENERATED_REFERENCE = %r{https?://[^\s]+|attachment_id_[\w-]+|attachment_[^\s]*}

    Result = Data.define(:messages, :missing_attachments) do
      # O que vale registrar no log do bloco. Sem nada de errado, não acrescenta nada.
      def to_log
        failed = messages.select { |message| message.status == "failed" }.map { |message| message.status_message.to_s }
        { missing_attachments: missing_attachments, failed_parts: failed }.compact_blank
      end
    end

    # @param chat [Chat]
    # @param text [String]
    # @param sender_name [String, nil] sem nome, é o da organização
    # @param generated [Boolean] o texto veio do modelo
    # @param attributes [Hash] campos extras de cada mensagem (ex.: `flow_id:`)
    # @param usage [Hash] os tokens da resposta (`usage_*`), que ficam numa mensagem só
    # @return [Result] levanta quando o canal levanta, como `Chat#send_text_message`
    def self.call(chat:, text:, sender_name: nil, generated: false, attributes: {}, usage: {})
      new(chat.organization, text, generated: generated).deliver(chat, sender_name, attributes, usage)
    end

    # O que iria para o canal, sem enviar nem baixar anexo: é o que o teste do editor mostra.
    # @return [Array(Array<String, MediaMessageDto>, Array<String>)] as partes e os anexos que ficaram de fora
    def self.preview(organization, text, generated: false)
      delivery = new(organization, text, generated: generated, record_only: true)
      [ delivery.parts, delivery.missing_attachments ]
    end

    attr_reader :missing_attachments

    def initialize(organization, text, generated:, record_only: false)
      @organization = organization
      @text = text.to_s
      @generated = generated
      @record_only = record_only
      @missing_attachments = []
    end

    def parts
      @parts ||= generated ? generated_parts : verbatim_parts
    end

    def deliver(chat, sender_name, attributes = {}, usage = {})
      name = sender_name.presence || organization.name
      has_span = parts.size > 1
      # A original fica para o histórico e para o modelo, e a lista da conversa mostra as partes. As métricas contam a original,
      # e por isso os tokens ficam nela.
      ChatMessage::Text.create(role: "assistant", content: text, chat: chat, has_span: true, sender_name: name, **attributes, **usage) if has_span

      part_attributes = { is_span: has_span, **attributes, **(has_span ? {} : usage) }
      messages = parts.map { |part| send_part(chat, part, name, part_attributes) }
      chat.update_last_message! if has_span

      Result.new(messages: messages, missing_attachments: missing_attachments)
    ensure
      discard_downloads
    end

    private

    attr_reader :organization, :text, :generated, :record_only

    def verbatim_parts
      handling = handling_with(**VERBATIM_OPTIONS)
      handling.perform(text).tap { missing_attachments.concat(handling.missing_attachments) }
    end

    def generated_parts
      handling_with.perform(without_missing_references(text))
    end

    def handling_with(**options)
      MessageHandling.new(organization, attachment_record_only: record_only, **options)
    end

    # O modelo pode citar anexo que não existe, e `MessageHandling` levantaria. Sai só a citação: o resto da resposta segue.
    def without_missing_references(content)
      cleaned = content.gsub(GENERATED_REFERENCE) do |reference|
        next reference if reference.start_with?("http")

        MessageHandling.new(organization, attachment_record_only: true).perform(reference)
        reference
      rescue AttachmentNotFoundException => e
        missing_attachments << e.message
        ""
      end

      missing_attachments.empty? ? cleaned : cleaned.gsub(/ {2,}/, " ")
    end

    def send_part(chat, part, name, attributes)
      return chat.send_text_message(part.to_s, name, { message_origin: "platform", **attributes }) unless part.is_a?(MediaMessageDto)

      Chats::SendMedia.call(chat: chat, media: part, sender_name: name, attributes: attributes)
    end

    # `MessageHandling` baixa o anexo para um temporário, e depois do envio ninguém mais precisa dele.
    def discard_downloads
      Array(@parts).grep(MediaMessageDto).each(&:discard_download)
    end
  end
end
