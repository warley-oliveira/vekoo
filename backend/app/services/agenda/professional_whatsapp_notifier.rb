module Agenda
  # Envia um aviso de agenda no WhatsApp do profissional. Ele não é um cliente, e não tem conversa
  # até o primeiro aviso: aqui ela é aberta (ou reencontrada) no mesmo canal, e o texto segue o rito
  # de sempre, gravado antes do envio e marcado `failed`, com a causa, se o canal recusar.
  #
  # Só canal não oficial entrega. A API oficial só aceita texto livre na janela de 24 horas aberta
  # por uma mensagem do destinatário, e o profissional nunca escreve primeiro.
  #
  #   Agenda::ProfessionalWhatsappNotifier.new(booking, template: text).call
  class ProfessionalWhatsappNotifier
    NON_OFFICIAL_CONNECTORS = [ Connector::WhatsappWeb, Connector::Zapi ].freeze

    def self.deliverable_connector?(connector)
      NON_OFFICIAL_CONNECTORS.any? { |type| connector.is_a?(type) } && connector.active?
    end

    def initialize(booking, template:, label: nil)
      @booking = booking
      @template = template
      @label = label || I18n.t("agenda.senders.calendar", locale: :"pt-BR")
    end

    # @return [ChatMessage::Text, nil] nil em qualquer aborto previsto
    def call
      return abort_with("agendamento sem profissional") if professional.blank?
      return abort_with("profissional sem telefone utilizável") unless professional.sendable_phone?
      return abort_with("nenhum canal de WhatsApp não oficial disponível") if connector.blank?
      return abort_with("o telefone do profissional é o mesmo do contato") if same_number_as_contact?

      text = BookingPlaceholders.render(template, booking)
      return abort_with("mensagem vazia depois de preencher as variáveis") if text.blank?

      deliver(text)
    rescue StandardError => e
      # `send_text_message` levanta depois de marcar a mensagem como `failed`: a falha já está
      # visível no chat. Um aviso que não saiu não pode derrubar quem pediu.
      Rails.logger.error("[Agenda::ProfessionalWhatsappNotifier] #{e.class}: #{e.message}")
      nil
    end

    private

    attr_reader :booking, :template, :label

    def professional
      @professional ||= booking.professional
    end

    def calendar
      @calendar ||= booking.calendar
    end

    # Primeiro o canal escolhido no calendário; depois o da conversa do agendamento, porque a
    # maioria das organizações tem um canal só. O seletor existe porque o cliente pode ter entrado
    # por um canal (WABA, Instagram, widget) que não serve para avisar o profissional.
    def connector
      return @connector if defined?(@connector)

      @connector = calendar&.professional_whatsapp_connector || chat_connector
    end

    def chat_connector
      candidate = booking.chat&.connector
      candidate if candidate && self.class.deliverable_connector?(candidate)
    end

    # O profissional que também é o contato (agendou para si, ou cadastrou o próprio número por
    # engano): sem esta guarda, o aviso interno seria escrito dentro da conversa do cliente.
    def same_number_as_contact?
      external_id = booking.chat&.external_id
      return false if external_id.blank?

      BrPhoneVariants.call(professional.phone).include?(external_id)
    end

    def deliver(text)
      chat = find_or_create_chat
      tag_as_professional(chat)

      # Remetente sempre explícito: é o que diz a quem atende por que aquela mensagem saiu.
      chat.send_text_message(text, sender_name, { message_origin: "platform" })
    end

    def sender_name
      "#{calendar&.organization&.name || calendar&.name} [#{label}]"
    end

    # Sem automação: um fluxo responderia ao profissional como se fosse um cliente.
    def find_or_create_chat
      Chats::Locator.find_or_create(
        connector: connector,
        phone: professional.phone,
        attributes: { user_name: professional.name, automation_enabled: false }
      )
    end

    # Etiqueta sempre: é idempotente, e conserta conversa aberta antes de a etiqueta existir. Não
    # mexe na automação de conversa que já existia: ela pode ser de um cliente com o mesmo número.
    def tag_as_professional(chat)
      tag = ChatTag.system_tag!(:professional, chat.organization_id)
      chat.add_to_set(chat_tag_ids: tag.id) unless chat.chat_tag_ids.include?(tag.id)
    rescue StandardError => e
      Rails.logger.warn("[Agenda::ProfessionalWhatsappNotifier] etiqueta: #{e.message}")
    end

    def abort_with(reason)
      Rails.logger.info("[Agenda::ProfessionalWhatsappNotifier] abortado (booking=#{booking.id}): #{reason}")
      nil
    end
  end
end
