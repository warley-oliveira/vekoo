module Outreach
  # Envia a um destinatário já tomado, pela API de envio do núcleo (`docs/migration/api/connectors.md`).
  # Origem: Campaigns::SendRecipientService. Aqui não se fala com provedor nenhum.
  #
  # Nunca reenvia: depois de despachar, toda falha do canal vira `failed`, porque repetir arriscaria
  # mandar duas vezes para a mesma pessoa. Quem decide parar o canal é o passo do lote. Só erro de
  # banco sobe, e a recuperação resolve pelo que ficou gravado.
  class SendRecipientService
    WHATSAPP_ERROR = "whatsappError".freeze
    NUMBER_NOT_FOUND = "numberNotFound".freeze
    NO_PHONE_NUMBER = "noPhoneNumber".freeze
    MEDIA_UNSUPPORTED = "mediaUnsupported".freeze
    MEDIA_UNAVAILABLE = "mediaUnavailable".freeze
    TEMPLATE_UNAVAILABLE = "templateUnavailable".freeze
    # `Chats::SendMedia` guarda a exceção do provedor como texto: é o único jeito de reconhecê-la.
    NUMBER_NOT_FOUND_TEXT = /\ANumber not on WhatsApp|\A#{Regexp.escape(WhatsappNumberNotFoundError.new.message)}/
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
    rescue RecipientChat::ChannelUnavailable => e
      # Nada saiu e o destinatário não tem culpa: volta para a fila. Quem conta quantas vezes isso
      # aconteceu seguidas é o passo do lote, que para o canal antes de gastar a lista.
      Rails.logger.warn("[Outreach::SendRecipient] #{recipient.id}: #{e.message}")
      @channel_trouble = true
      recipient.release_claim!
    rescue SendRefused => e
      fail_recipient(e.code)
    rescue WhatsappNumberNotFoundError => e
      Rails.logger.info("[Outreach::SendRecipient] #{recipient.id}: #{e.message}")
      fail_recipient(NUMBER_NOT_FOUND)
    rescue Mongo::Error
      # Infraestrutura: sobe para o job, e a recuperação decide pelo que ficou gravado.
      raise
    rescue StandardError => e
      Rails.logger.error("[Outreach::SendRecipient] #{recipient.id}: #{e.class}: #{e.message}")
      fail_recipient(WHATSAPP_ERROR)
    end

    # Este envio não funcionou por um motivo que não é do destinatário. Número que não existe não
    # conta: uma lista suja é outra conversa, e a consulta respondeu.
    def channel_trouble?
      @channel_trouble.present?
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
        finish_with(once { chat.send_text_message(text, campaign.name, message_attributes) })
      else
        external_id = once { chat.send_text_message_without_event(text, campaign.name, false, message_attributes) }
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

      # Sem o motivo: aqui ele é o corpo cru da resposta do provedor.
      finish_with(once { Chats::SendMedia.call(chat: chat, media: dto, sender_name: campaign.name, attributes: message_attributes) }, show_reason: false)
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

      finish_with(once { Chats::SendTemplate.call(chat: chat, template: template, components: components, sender_name: campaign.name, attributes: message_attributes) })
      lower_in_list(chat)
    end

    # Em ordem: o lote, o que foi gravado no destinatário e, por fim, o rodízio da campanha.
    def template_phone_number_id
      batch.phone_number_id.presence ||
        recipient.phone_number_id.presence ||
        recipient.custom_variables.to_h["phone_number_id"].presence ||
        content.phone_number_id_from_rotation.to_s.presence
    end

    # O provedor repetiria um POST que deu timeout de leitura, e ele pode ter saído. Aqui vale no máximo
    # uma vez: se falhar, o destinatário fica como falho, e a pessoa vê.
    def once(&block)
      Connector::WhatsappWeb::Providers::Base.send_once(&block)
    end

    # A linha que separa "nada saiu" de "pode ter saído". A consulta do número pode ter levado minutos:
    # a campanha é conferida de novo, para nada sair depois de a pessoa pausar. E se a recuperação já
    # devolveu este destinatário, outra execução é quem envia.
    def begin_dispatch(chat)
      token, status = Campaign.where(_id: campaign.id).pick(:run_token, :status_cd)

      if token != campaign.run_token
        recipient.release_claim!(status == "cancelled" ? "skipped" : "pending")
        return false
      end

      recipient.mark_dispatched!(chat.id)
    end

    def finish_with(message, show_reason: true)
      return recipient.finish_sent!(message.message_id) if message.message_id.present?

      # 2xx sem id: a mensagem saiu, só não sabemos o id. A falha vem com `failed`.
      return recipient.finish_sent!(nil) if message.status != "failed"
      return fail_recipient(NUMBER_NOT_FOUND) if message.status_message.to_s.match?(NUMBER_NOT_FOUND_TEXT)

      fail_recipient(WHATSAPP_ERROR, show_reason ? message.status_message : nil)
    end

    def fail_recipient(code, detail = nil)
      @channel_trouble = code != NUMBER_NOT_FOUND
      recipient.finish_failed!(code, detail: detail)
    end

    def lower_in_list(chat)
      chat.set(last_message_at: Time.current - LOWERED_BY) unless campaign.raise_chats
    end
  end
end
