module Outreach
  # O que um destinatário recebe: qual mensagem ou modelo do rodízio, com as variáveis preenchidas.
  class MessageContent
    # @param position [Integer] a posição do destinatário no canal: é o que faz o rodízio. A origem
    #   usava a posição geral, e com dois canais e duas mensagens cada número só mandava uma delas.
    def initialize(campaign, recipient, position = 0)
      @campaign = campaign
      @recipient = recipient
      @position = position.to_i
    end

    def text
      interpolate(rotated(campaign.effective_messages))
    end

    # Só imagem e vídeo aceitam legenda.
    def media_caption
      return nil unless campaign.media_supports_caption?
      return nil if campaign.effective_messages.empty?

      text.presence
    end

    def template_id
      rotated(campaign.template_ids)
    end

    def phone_number_id_from_rotation
      rotated(campaign.normalized_phone_number_ids)
    end

    # Os parâmetros do corpo do modelo, no formato da Meta: o que a pessoa preencheu na campanha, com
    # as variáveis do destinatário. Sem valor preenchido, {{1}} é o nome.
    def template_components(template)
      body = Array(template.components).find { |component| component["type"]&.upcase == "BODY" }
      return [] unless body

      placeholders = body["text"].to_s.scan(/\{\{(\d+)\}\}/).flatten.map(&:to_i).sort
      return [] if placeholders.empty?

      defaults = campaign.template_params&.dig(template.id.to_s) || {}

      parameters = placeholders.map do |index|
        raw = defaults[index.to_s].to_s
        value = raw.present? ? interpolate(raw) : fallback_parameter(index)

        { "type" => "text", "text" => value.presence || "" }
      end

      [ { "type" => "body", "parameters" => parameters } ]
    end

    # Troca {{nome}}, {{telefone}} e as variáveis próprias do destinatário.
    def interpolate(body)
      return body if body.blank?

      result = body.dup
      result.gsub!("{{name}}", recipient.name.to_s)
      result.gsub!("{{nome}}", recipient.name.to_s)
      result.gsub!("{{phone}}", recipient.phone.to_s)
      result.gsub!("{{telefone}}", recipient.phone.to_s)

      recipient.custom_variables.to_h.each do |key, value|
        result.gsub!("{{#{key}}}", value.to_s)
      end

      result
    end

    private

    attr_reader :campaign, :recipient, :position

    def rotated(list)
      list = Array(list)
      list[position % [ list.size, 1 ].max]
    end

    def fallback_parameter(index)
      index == 1 ? recipient.name.to_s : recipient.custom_variables.to_h[index.to_s].to_s
    end
  end
end
