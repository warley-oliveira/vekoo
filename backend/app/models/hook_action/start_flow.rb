module HookAction
  # "Iniciar fluxo" (origem: AssignAutomation, que colocava a conversa num assistente). Liga a conversa a um canal,
  # liga a automação, envia a mensagem configurada e começa o fluxo escolhido. Sem `flow_id`, só envia.
  #
  #   send_mode                 simple (`message_text`) ou advanced (`message_blocks`)
  #   whatsapp_template_id      na WABA, envia o modelo com `whatsapp_template_params`
  #   phone_number_id           na WABA, de qual número da conta sai
  class StartFlow < Base
    BLOCK_TYPES = %w[text image video document audio].freeze

    store_accessor :config, :connector_id, :flow_id, :message_text, :whatsapp_template_id, :whatsapp_template_params,
                   :phone_number_id, :send_mode, :message_blocks

    validate :references_belong_to_organization, if: :hook

    # @param request [Hash, nil] o corpo e a query originais, que o fluxo lê em `{{vars.webhook.body.x}}`
    def perform(payload, chat = nil, request: nil)
      raise Hooks::ActionFailed, I18n.t("automation.hooks.errors.no_chat") unless chat

      connector = Connector::Base.scoped(organization_id, connector_id)
      raise Hooks::ActionFailed, I18n.t("automation.hooks.errors.connector_not_found") unless connector

      @current_chat = attach_to_connector(chat, connector)
      enable_automation(connector)
      deliver(payload, connector)
      start_flow(request)
      @current_chat
    end

    private

    def attach_to_connector(chat, connector)
      found = Chats::Locator.find(connector: connector, phone: chat.external_id, sender_phone_number_id: phone_number_id)
      return found if found

      if chat.connector_id.nil?
        chat.update(connector: connector)
        chat
      else
        Chats::Locator.find_or_create(
          connector: connector,
          phone: chat.external_id,
          sender_phone_number_id: phone_number_id,
          attributes: { user_name: chat.user_name }
        )
      end
    end

    def enable_automation(connector)
      attributes = { automation_enabled: true }
      attributes[:sender_phone_number_id] = phone_number_id.to_i if phone_number_id.present? && connector.is_a?(Connector::WhatsappCloud)
      @current_chat.update(attributes)
    end

    def deliver(payload, connector)
      return send_whatsapp_template(payload, connector) if whatsapp_template_id.present? && connector.is_a?(Connector::WhatsappCloud)
      # A WABA não aceita texto livre fora da janela de 24 horas: sem modelo, não há o que tentar.
      return if connector.is_a?(Connector::WhatsappCloud) && message_text.blank?
      return send_blocks(payload) if send_mode == "advanced" && message_blocks.is_a?(Array) && message_blocks.any?

      text = replace_template_variables(message_text, payload)
      send_text(text) if text.present?
    end

    def sender_name
      "#{organization.name} [WH]"
    end

    # O texto foi escrito por alguém e vai como está. Anexo citado que sumiu: o resto segue, e o alerta diz o que faltou.
    def send_text(text)
      delivery = Flows::TextDelivery.call(chat: @current_chat, text: text, sender_name: sender_name)
      delivery.messages.each { |message| report_failed(message) }
      delivery.missing_attachments.each { |reason| report_error(reason) }
    rescue StandardError => e
      report_error(e.message)
    end

    def send_whatsapp_template(payload, connector)
      template = connector.whatsapp_templates.where(template_id: whatsapp_template_id).take
      return report_error(I18n.t("automation.hooks.errors.template_not_found")) unless template

      message = Chats::SendTemplate.call(
        chat: @current_chat,
        template: template,
        components: template_components(payload),
        sender_name: sender_name
      )
      report_failed(message)
    end

    def template_components(payload)
      params = Array(whatsapp_template_params).map { |param| replace_template_variables(param, payload) }
      return [] if params.empty?

      [ { "type" => "body", "parameters" => params.map { |param| { "type" => "text", "text" => param } } } ]
    end

    def send_blocks(payload)
      message_blocks.each do |block|
        block = block.to_h.with_indifferent_access
        next send_text_block(block, payload) if block[:type].to_s == "text"
        next unless BLOCK_TYPES.include?(block[:type].to_s)

        send_media_block(block, payload)
      end
    end

    def send_text_block(block, payload)
      text = replace_template_variables(block[:content], payload)
      send_text(text) if text.present?
    end

    def send_media_block(block, payload)
      media = media_dto(block, payload)
      return unless media

      report_failed(Chats::SendMedia.call(chat: @current_chat, media: media, sender_name: sender_name))
    end

    def media_dto(block, payload)
      caption = replace_template_variables(block[:caption], payload).presence

      if block[:media_source].to_s == "attachment" && block[:attachment_id].present?
        attachment = Media::AttachmentLookup.find(block[:attachment_id], organization_id: organization_id)
        return report_error(I18n.t("automation.hooks.errors.attachment_not_found")) unless attachment

        MediaMessageDto.new(block[:type].to_s, attachment.file_name || attachment.name, nil, attachment.id, caption, media_url: attachment.file_url)
      else
        url = replace_template_variables(block[:media_url], payload)
        return nil if url.blank?

        name = replace_template_variables(block[:file_name], payload).presence || File.basename(URI.parse(url).path.to_s).presence || "arquivo"
        MediaMessageDto.new(block[:type].to_s, name, nil, nil, caption, media_url: url)
      end
    rescue URI::InvalidURIError
      report_error(I18n.t("automation.hooks.errors.invalid_media_url"))
    end

    def start_flow(request)
      return if flow_id.blank?

      flow = Flow.scoped(organization_id, flow_id)
      return report_error(I18n.t("automation.hooks.errors.flow_not_found")) unless flow&.published?
      # O interruptor da organização desliga todo disparo de fluxo.
      return unless organization.automation_enabled?

      variables = request.present? ? { "webhook" => request } : {}
      Flows::StartExecutionJob.perform_later(flow.id, organization_id.to_s, @current_chat.id.to_s, { "variables_json" => variables.to_json, "event" => "webhook" })
    end

    # Falha de envio não derruba as ações seguintes. A pessoa fica sabendo pelo alerta do webhook.
    def report_failed(message)
      report_error(message.status_message.presence || I18n.t("automation.hooks.errors.send_failed")) if message&.status == "failed"
    end

    def report_error(text)
      hook.alert_failure!(text)
      nil
    end

    def references_belong_to_organization
      if connector_id.present? && Connector::Base.scoped(organization_id, connector_id).nil?
        errors.add(:base, I18n.t("automation.hooks.errors.connector_not_found"))
      end
      return if flow_id.blank? || Flow.scoped(organization_id, flow_id)

      errors.add(:base, I18n.t("automation.hooks.errors.flow_not_found"))
    end
  end
end
