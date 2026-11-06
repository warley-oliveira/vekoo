module Agenda
  # O que o modelo pode fazer ao gerar um passo de sequência: ver horários livres, ler e gravar
  # campos do contato e mexer nas etiquetas. Na simulação (`preview: true`) nada é gravado.
  #
  #   executor = Agenda::SequenceToolExecutor.new(chat, booking, preview: false)
  #   executor.definitions
  #   executor.execute("add_tag", { "name" => "quente" })
  class SequenceToolExecutor
    DEFAULT_DAYS_AHEAD = 7

    def initialize(chat, booking, preview: false)
      @chat = chat
      @booking = booking
      @preview = preview
    end

    def definitions
      [
        tool("check_availability",
             "Verifica se há horários disponíveis na agenda (para remarcar) e lista alguns. Use antes de oferecer horários.",
             { days_ahead: { type: "integer", description: "Quantos dias à frente buscar (padrão 7)." } }),
        tool("list_contact_fields", "Lista os campos personalizados do contato, com os valores atuais.", {}),
        tool("set_contact_field", "Cria ou atualiza um campo personalizado do contato.",
             { field: { type: "string", description: "Nome do campo." }, value: { type: "string", description: "Valor." } },
             %w[field value]),
        tool("remove_contact_field", "Remove um campo personalizado do contato.",
             { field: { type: "string", description: "Nome do campo." } }, %w[field]),
        tool("list_tags", "Lista as etiquetas da conversa.", {}),
        tool("add_tag", "Adiciona uma etiqueta à conversa.",
             { name: { type: "string", description: "Nome da etiqueta." } }, %w[name]),
        tool("remove_tag", "Remove uma etiqueta da conversa.",
             { name: { type: "string", description: "Nome da etiqueta." } }, %w[name])
      ]
    end

    def execute(name, args = {})
      args = (args || {}).to_h.transform_keys(&:to_s)

      case name.to_s
      when "check_availability" then check_availability(args)
      when "list_contact_fields" then list_contact_fields
      when "set_contact_field" then set_contact_field(args)
      when "remove_contact_field" then remove_contact_field(args)
      when "list_tags" then list_tags
      when "add_tag" then add_tag(args)
      when "remove_tag" then remove_tag(args)
      else { error: "Ferramenta desconhecida: #{name}" }
      end
    rescue StandardError => e
      Rails.logger.error("[Agenda::SequenceToolExecutor] #{name}: #{e.class}: #{e.message}")
      { error: "Falha ao executar a ferramenta." }
    end

    private

    attr_reader :chat, :booking, :preview

    def tool(name, description, properties, required = [])
      { name: name, description: description, input_schema: { type: "object", properties: properties, required: required } }
    end

    def check_availability(args)
      service_name = booking.service_name
      return { error: "Agendamento sem serviço: não dá para verificar horários." } if service_name.blank?

      days_ahead = args["days_ahead"].to_i
      days_ahead = DEFAULT_DAYS_AHEAD unless days_ahead.positive?
      today = Time.current.in_time_zone(booking.zone).to_date

      result = BookingService.new(booking.calendar, chat: chat).available_slots(
        service_name: service_name,
        date_start: today,
        date_end: today + days_ahead,
        employee_name: booking.employee_name
      )
      return result if result[:error].present?

      slots = result[:available_slots] || {}
      { has_slots: slots.any? { |_day, times| times.present? }, slots: slots }
    end

    def list_contact_fields
      attributes = chat.custom_attributes || {}
      return { fields: [] } if attributes.blank?

      labels = CustomFieldLabels.for(chat.organization_id, attributes.keys)
      { fields: attributes.map { |key, value| { name: labels[key] || key, key: key, value: value } } }
    end

    def set_contact_field(args)
      key = field_key(args)
      return { error: "Campo inválido." } if key.blank?
      return { success: true, key: key, value: args["value"], preview: true } if preview

      chat.custom_attributes = (chat.custom_attributes || {}).merge(key => args["value"])
      chat.save!
      { success: true, key: key, value: args["value"] }
    end

    def remove_contact_field(args)
      key = field_key(args)
      return { error: "Campo inválido." } if key.blank?
      return { success: true, key: key, preview: true } if preview

      attributes = (chat.custom_attributes || {}).dup
      removed = attributes.delete(key)
      chat.custom_attributes = attributes
      chat.save!
      { success: !removed.nil?, key: key }
    end

    def list_tags
      { tags: ChatTag.where(organization_id: chat.organization_id, :id.in => chat.chat_tag_ids).map { |tag|
        { name: tag.name, description: tag.description, color: tag.color }
      } }
    end

    def add_tag(args)
      name = tag_name(args)
      return { error: "Etiqueta inválida." } if name.blank?
      return { success: true, name: name, preview: true } if preview

      chat.add_tag!(name)
      { success: true, name: name }
    end

    def remove_tag(args)
      name = tag_name(args)
      return { error: "Etiqueta inválida." } if name.blank?
      return { success: true, name: name, preview: true } if preview

      tag = ChatTag.where(name: name, organization_id: chat.organization_id).take
      chat.pull(chat_tag_ids: tag.id) if tag
      { success: !tag.nil?, name: name }
    end

    def field_key(args)
      args["field"].to_s.parameterize.underscore
    end

    def tag_name(args)
      args["name"].to_s.parameterize.dasherize
    end
  end
end
