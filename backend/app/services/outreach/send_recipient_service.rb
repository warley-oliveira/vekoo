module Outreach
  # Envia a um destinatário já tomado, pela API de envio do núcleo (`docs/migration/api/connectors.md`).
  # Origem: Campaigns::SendRecipientService. Aqui não se fala com provedor nenhum.
  #
  # Nunca reenvia. Toda falha do canal vira `failed` e a campanha segue: repetir arriscaria mandar
  # duas vezes para a mesma pessoa. Só erro de infraestrutura sobe, e a recuperação resolve.
  class SendRecipientService
    WHATSAPP_ERROR = "whatsappError".freeze
    NUMBER_NOT_FOUND = "numberNotFound".freeze
    NO_PHONE_NUMBER = "noPhoneNumber".freeze
    MEDIA_UNSUPPORTED = "mediaUnsupported".freeze
    MEDIA_UNAVAILABLE = "mediaUnavailable".freeze
    TEMPLATE_UNAVAILABLE = "templateUnavailable".freeze
    # Quando não é para subir na lista, a conversa vai para o fim, como `send_text_message_without_event`.
    LOWERED_BY = 6.months

    class SendRefused < StandardError
      attr_reader :code

      def initialize(code)
        @code = code
        super
      end
    end

    def initialize(recipient:, campaign:, batch:, connector:)
      @recipient = recipient
      @campaign = campaign
      @batch = batch
      @connector = connector
    end

    def call
      if campaign.template_mode?
        send_template
      elsif campaign.media_message?
        send_media
      else
        send_text
      end
    rescue SendRefused => e
      fail_recipient(e.code)
    rescue WhatsappNumberNotFoundError => e
      Rails.logger.info("[Outreach::SendRecipient] #{recipient.id}: #{e.message}")
      fail_recipient(NUMBER_NOT_FOUND)
    rescue StandardError => e
      Rails.logger.error("[Outreach::SendRecipient] #{recipient.id}: #{e.class}: #{e.message}")
      fail_recipient(WHATSAPP_ERROR)
    end

    private

    attr_reader :recipient, :campaign, :batch, :connector

    def chats
      @chats ||= RecipientChat.new(recipient: recipient, campaign: campaign, connector: connector)
    end

    def content
      @content ||= MessageContent.new(campaign, recipient, batch.position_of(recipient))
    end

    def message_attributes
      { campaign_id: campaign.id.to_s }
    end

    def send_text
      text = content.text
      chat = chats.resolved
      return unless begin_dispatch(chat)

      if campaign.raise_chats
        finish_with(chat.send_text_message(text, campaign.name, message_attributes))
      else
        external_id = chat.send_text_message_without_event(text, campaign.name, false, message_attributes)
        external_id ? recipient.finish_sent!(external_id) : fail_recipient(WHATSAPP_ERROR, chat.connector.try(:last_send_error))
      end
    end

    # A mídia só sai pelo WhatsApp Web: fora da janela de 24 horas, a WABA só aceita modelo.
    def send_media
      raise SendRefused, MEDIA_UNSUPPORTED unless connector.is_a?(Connector::WhatsappWeb)

      media_url = campaign.resolved_media_url
      raise SendRefused, MEDIA_UNAVAILABLE if media_url.blank?

      chat = chats.resolved
      caption = content.media_caption
      dto = MediaMessageDto.new(campaign.media_kind, campaign.media_file_name, nil, campaign.attachment_id, caption, media_url: media_url)
      return unless begin_dispatch(chat)

      finish_with(Chats::SendMedia.call(chat: chat, media: dto, sender_name: campaign.name, attributes: message_attributes))
      lower_in_list(chat)
    end

    def send_template
      phone_number_id = template_phone_number_id
      raise SendRefused, NO_PHONE_NUMBER if phone_number_id.blank?

      template = connector.whatsapp_templates.where(id: content.template_id).take
      raise SendRefused, TEMPLATE_UNAVAILABLE if template.nil?

      chat = chats.for_sender(phone_number_id)
      components = content.template_components(template)
      return unless begin_dispatch(chat)

      finish_with(Chats::SendTemplate.call(chat: chat, template: template, components: components, sender_name: campaign.name, attributes: message_attributes))
      lower_in_list(chat)
    end

    # Em ordem: o lote, o que foi gravado no destinatário e, por fim, o rodízio da campanha.
    def template_phone_number_id
      batch.phone_number_id.presence ||
        recipient.phone_number_id.presence ||
        recipient.custom_variables.to_h["phone_number_id"].presence ||
        content.phone_number_id_from_rotation.to_s.presence
    end

    # A linha que separa "nada saiu" de "pode ter saído". Se a recuperação já devolveu este
    # destinatário, outra execução é quem envia.
    def begin_dispatch(chat)
      recipient.mark_dispatched!(chat.id)
    end

    def finish_with(message)
      return recipient.finish_sent!(message.message_id) if message.message_id.present?

      # 2xx sem id: a mensagem saiu, só não sabemos o id. A falha vem com `failed`.
      return recipient.finish_sent!(nil) if message.status != "failed"

      if message.status_message == WhatsappNumberNotFoundError.new.message
        fail_recipient(NUMBER_NOT_FOUND)
      else
        fail_recipient(WHATSAPP_ERROR, message.status_message)
      end
    end

    def fail_recipient(code, detail = nil)
      recipient.finish_failed!(code, detail: detail)
    end

    def lower_in_list(chat)
      chat.set(last_message_at: Time.current - LOWERED_BY) unless campaign.raise_chats
    end
  end
end
