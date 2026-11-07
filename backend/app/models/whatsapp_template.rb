class WhatsappTemplate
  include Mongoid::Document
  include Mongoid::Timestamps
  include StringEnum
  include PublicMediaUrl

  CATEGORIES = %w[UTILITY MARKETING AUTHENTICATION].freeze

  # Status possíveis. Os primeiros são os reportados pela Meta; `removed` é
  # nosso — marca o template que sumiu da WABA (ver Connector::WhatsappCloud#sync_templates).
  STATUSES = %w[
    PENDING_DELETION APPROVED PENDING REJECTED PAUSED DISABLED
    IN_APPEAL LIMIT_EXCEEDED ARCHIVED DELETED REMOVED
  ].freeze
  LANGUAGES = %w[en_US pt_BR].freeze

  # Header formats supported by WhatsApp Business API
  HEADER_FORMATS = %w[TEXT IMAGE VIDEO DOCUMENT LOCATION].freeze

  # Button types supported by WhatsApp Business API
  BUTTON_TYPES = %w[PHONE_NUMBER URL QUICK_REPLY COPY_CODE].freeze

  # Supported media MIME types
  SUPPORTED_IMAGE_TYPES = %w[image/jpeg image/png].freeze
  SUPPORTED_VIDEO_TYPES = %w[video/mp4 video/3gpp].freeze
  SUPPORTED_DOCUMENT_TYPES = %w[
    application/pdf
    application/msword
    application/vnd.openxmlformats-officedocument.wordprocessingml.document
    application/vnd.ms-excel
    application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    application/vnd.ms-powerpoint
    application/vnd.openxmlformats-officedocument.presentationml.presentation
  ].freeze

  attr_accessor :sync_update

  field :name, type: String
  field :template_id, type: String
  field :category, type: String

  # `removed` é interno (não existe na Meta): o template deixou de ser listado
  # pela WABA. Não apagamos o documento porque campanhas e webhooks guardam o
  # id do template (ver Outreach::SendRecipientService), e o registro morto
  # serve de alerta nesses relacionamentos.
  string_enum :status, %i[
    pending_deletion approved pending rejected paused disabled
    in_appeal limit_exceeded archived deleted removed
  ]
  field :components, type: Array, default: []
  field :language, type: String

  # Campos espelhados da Meta que antes eram descartados no sync
  field :sub_category, type: String
  field :previous_category, type: String
  field :correct_category, type: String
  field :rejected_reason, type: String
  field :quality_score, type: Hash, default: {}
  field :parameter_format, type: String
  field :message_send_ttl_seconds, type: Integer
  field :library_template_name, type: String
  field :cta_url_link_tracking_opted_out, type: Boolean

  # Rastreamento do sync
  field :last_synced_at, type: Time
  field :removed_at, type: Time

  # Origem da mídia do header (IMAGE/VIDEO/DOCUMENT), guardada FORA de
  # `components`. O sync sobrescreve `components` com o payload da Meta, que
  # devolve em `example.header_handle` uma URL assinada do CDN interno
  # (scontent.whatsapp.net). Essa URL abre no browser logado, mas o downloader
  # da Meta recebe 403 no envio — erro 131053, "Media upload error". A URL
  # pública de verdade (o Attachment escolhido no formulário) precisa
  # sobreviver ao sync, por isso mora aqui.
  field :header_attachment_id, type: String
  field :header_media_url, type: String

  scope :available, -> { where(:status_cd.ne => "removed") }

  index({ connector_id: 1, template_id: 1 })
  index({ connector_id: 1, status_cd: 1 })

  validates_uniqueness_of :name, scope: %i[connector_id language]

  validates :name, presence: true
  # validates :category, inclusion: { in: CATEGORIES }
  # validates :language, inclusion: { in: LANGUAGES }

  belongs_to :connector, class_name: "Connector::WhatsappCloud", inverse_of: :whatsapp_templates

  before_save :capture_header_media_source

  validate on: :create do
    self.name = name.to_s.parameterize.underscore
    # Quem reclama da falta do conector é o `belongs_to`.
    next if connector.nil?

    original_status = status.clone
    bid = connector.waba_id.present? ? connector.waba_id : connector.business_id
    self.status = :pending unless original_status
    if errors.blank? && original_status.blank?
      # Convert header_url to header_handle for media templates
      components_for_api = convert_header_url_to_handle(components)

      data = connector.templates_obj.create(
        business_id: bid,
        name: name,
        language: language,
        category: category,
        components_json: components_for_api,
        allow_category_change: true
      )

      if data.error.present?
        Rails.logger.error("WhatsApp Template Creation Error: #{data.error.raw_data_response}")
        errors.add(:base, data.error.raw_data_response["error_user_msg"] || data.error.raw_data_response["message"])
      else
        self.template_id = data.data.template.id
      end
    end
  end

  # Antes de gravar: se a Meta recusar, o que está guardado continua igual ao que está lá.
  before_update do
    next unless sync_update

    Rails.logger.info("Syncing WhatsApp Template Update: #{components}")

    result = connector.templates_obj.update(
      template_id: template_id,
      components_json: components
    )
    next unless result.error?

    Rails.logger.error("WhatsApp Template Update Error: #{result.error.raw_data_response}")
    errors.add(:base, result.error.raw_data_response["error_user_msg"] || result.error.raw_data_response["message"])
    throw :abort
  end

  # Aplica o payload cru do endpoint /{waba-id}/message_templates.
  # A Meta é a fonte da verdade: todos os campos que ela devolve são espelhados
  # aqui, e não só nome/idioma/categoria/status/componentes como antes.
  #
  # @param payload [Hash] item do array `data` da Graph API
  # @return [Boolean] true se algum atributo mudou
  def assign_meta_attributes(payload)
    self.name = payload["name"] if payload["name"].present?
    self.language = payload["language"] if payload["language"].present?
    self.category = payload["category"]
    self.sub_category = payload["sub_category"]
    self.previous_category = payload["previous_category"]
    self.correct_category = payload["correct_category"]
    self.rejected_reason = payload["rejected_reason"]
    self.quality_score = payload["quality_score"].presence || {}
    self.parameter_format = payload["parameter_format"]
    self.message_send_ttl_seconds = payload["message_send_ttl_seconds"]
    self.library_template_name = payload["library_template_name"]
    self.cta_url_link_tracking_opted_out = payload["cta_url_link_tracking_opted_out"]
    self.components = payload["components"] || []
    assign_meta_status(payload["status"])

    # O template voltou a existir na WABA: limpa a marca de removido
    self.removed_at = nil

    changed?
  end

  # Converte o status da Meta para o enum local. Status novos ou desconhecidos
  # (PAUSED, DISABLED, IN_APPEAL...) não podem virar nil silenciosamente — isso
  # mascarava templates inutilizáveis como se estivessem ok.
  def assign_meta_status(raw_status)
    normalized = raw_status.to_s.downcase.presence
    return if normalized.nil?

    if self.class.statuses.include?(normalized)
      self.status = normalized
    else
      Rails.logger.warn("[WhatsappTemplate] Status desconhecido vindo da Meta: #{raw_status.inspect} (#{template_id})")
      self.status = :paused
    end
  end

  # Marca como removido preservando o documento — campanhas e webhooks guardam
  # o id deste template e precisam continuar resolvendo o registro.
  def mark_as_removed!
    return false if removed?

    set(status_cd: "removed", removed_at: Time.current)
    true
  end

  def render_message_text(frontend_components = [])
    return "" if components.blank?

    rendered_parts = []

    components.each do |component|
      case component["type"]&.upcase
      when "HEADER"
        # case component['format']&.upcase
        # when 'TEXT'
        #   rendered_parts << "📋 #{component['text']}" if component['text'].present?
        # when 'IMAGE'
        #   rendered_parts << '🖼️ [Imagem]'
        # when 'VIDEO'
        #   rendered_parts << '🎬 [Vídeo]'
        # when 'DOCUMENT'
        #   rendered_parts << '📄 [Documento]'
        # when 'LOCATION'
        #   rendered_parts << '📍 [Localização]'
        # else
        #   rendered_parts << "📋 #{component['text']}" if component['text'].present?
        # end
        if component["text"].present?
          rendered_parts << "*#{interpolate_parameters(component['text'], frontend_components, 'header')}*"
        end
      when "BODY"
        if component["text"].present?
          body_text = interpolate_parameters(component["text"], frontend_components)
          rendered_parts << body_text
        end
      when "FOOTER"
        rendered_parts << (component["text"]).to_s if component["text"].present?
      when "BUTTONS"
        buttons = component["buttons"] || []
        if buttons.any?
          button_texts = buttons.map do |btn|
            case btn["type"]&.upcase
            when "PHONE_NUMBER"
              "📞 #{btn['text']}"
            when "URL"
              "🔗 #{btn['text']}"
            when "QUICK_REPLY"
              "💬 #{btn['text']}"
            when "COPY_CODE"
              "📋 #{btn['text']}"
            else
              btn["text"]
            end
          end
          rendered_parts << button_texts.join(" | ")
        end
      end
    end

    rendered_parts.join("\n\n")
  end

  # Extract header format from components
  def header_format
    header = components&.find { |c| c["type"]&.upcase == "HEADER" }
    header&.dig("format")&.upcase || "TEXT"
  end

  # Check if template has media header
  def has_media_header?
    %w[IMAGE VIDEO DOCUMENT].include?(header_format)
  end

  # Check if template has location header
  def has_location_header?
    header_format == "LOCATION"
  end

  # Attachment escolhido como mídia do header, quando ainda existe.
  def header_attachment
    return @header_attachment if defined?(@header_attachment)

    @header_attachment = Media::AttachmentLookup.find(header_attachment_id)
  end

  # URL pública da mídia do header, pronta para o parâmetro `link` do envio.
  #
  # A resposta canônica é sempre o `Attachment#file_url`, o link persistente que foi registrado
  # na Meta na aprovação do template. Por isso o attachment vem primeiro e,
  # quando só resta uma URL solta, tentamos resolvê-la de volta para o
  # attachment antes de usá-la crua (o que foi capturado pode ser uma URL
  # antiga ou a de desenvolvimento).
  #
  # URLs do CDN da Meta são descartadas em qualquer posição: elas falham com
  # 403 no download feito pela própria Meta.
  #
  # @return [String, nil]
  def resolved_header_media_url
    return public_media_url(header_attachment.file_url) if header_attachment

    candidate = public_media_url(header_media_url) || example_header_media_url
    return nil if candidate.blank?

    attachment = Media::AttachmentLookup.from_file_url(candidate)
    attachment ? public_media_url(attachment.file_url) : candidate
  end

  # Origem da mídia ainda presente em `components`. Só existe entre a criação
  # do template e o primeiro sync — depois a Meta substitui pelo header_handle.
  def example_header_media_url
    header = components&.find { |c| c["type"]&.upcase == "HEADER" }
    return nil if header.blank?

    urls = Array(header.dig("example", "header_url")) + Array(header.dig("example", "header_handle"))
    urls.filter_map { |url| public_media_url(url) }.first
  end

  # Check if any component has parameters (e.g. {{1}}, {{name}})
  def has_parameters?
    return false if components.blank?

    components.any? { |c| c["text"]&.match?(/\{\{.+?\}\}/) }
  end

  # Get buttons from template
  def buttons
    buttons_component = components&.find { |c| c["type"]&.upcase == "BUTTONS" }
    buttons_component&.dig("buttons") || []
  end

  private

  def interpolate_parameters(text, frontend_components, type = "body")
    return text if frontend_components.blank?

    # Encontrar o componente nos componentes do frontend
    component = frontend_components.find { |comp| comp["type"]&.downcase == type }
    return text unless component&.dig("parameters")

    interpolated_text = text.dup

    # Interpolar cada parâmetro
    component["parameters"].each_with_index do |param, index|
      # Formato com nome: a Meta chama de `parameter_name`; `param_name` é o que a origem mandava.
      name = param["parameter_name"].presence || param["param_name"]
      if name.present? && param["text"].present?
        placeholder = "{{#{name}}}"
        interpolated_text.gsub!(placeholder, param["text"])
      end

      # Formato com índices numéricos (body_text) - {{1}}, {{2}}, etc.
      if param["text"].present?
        placeholder = "{{#{index + 1}}}"
        interpolated_text.gsub!(placeholder, param["text"])
      end
    end

    interpolated_text
  end

  # Validate header media example if present
  def validate_header_media_example
    header = components&.find { |c| c["type"]&.upcase == "HEADER" }
    return true unless header

    format = header["format"]&.upcase
    return true if format == "TEXT" || format.blank?

    example = header.dig("example", "header_handle") || header.dig("example", "header_url")

    if %w[IMAGE VIDEO DOCUMENT].include?(format) && example.blank?
      errors.add(:components, "Header #{format.downcase} requires an example URL or handle")
      return false
    end

    true
  end

  # Converts header_url to header_handle for media templates.
  # The WhatsApp Business API requires a header_handle (obtained via Resumable Upload API)
  # instead of a direct URL when creating templates with media headers.
  #
  # @param components_array [Array] The components array from the template
  # @return [Array] The components array with header_url converted to header_handle
  def convert_header_url_to_handle(components_array)
    return components_array if components_array.blank?

    components_array.map do |component|
      next component unless component["type"]&.upcase == "HEADER"

      format = component["format"]&.upcase
      next component unless %w[IMAGE VIDEO DOCUMENT].include?(format)

      header_url = component.dig("example", "header_url")&.first
      next component if header_url.blank?

      # Already has a header_handle, skip conversion
      next component if component.dig("example", "header_handle").present?

      Rails.logger.info "[convert_header_url_to_handle] Converting URL to handle: #{header_url}"

      # Upload the file and get the header_handle
      header_handle = connector.upload_media_for_template(header_url)

      if header_handle.blank?
        Rails.logger.error "[convert_header_url_to_handle] Failed to upload media, keeping original URL"
        next component
      end

      # Create a new component with header_handle instead of header_url
      new_component = component.deep_dup
      new_component["example"] = { "header_handle" => [ header_handle ] }

      Rails.logger.info "[convert_header_url_to_handle] Successfully converted to header_handle"
      new_component
    end
  end

  # Guarda a origem pública da mídia fora de `components`, que é sobrescrito a
  # cada sync com o payload da Meta. Só grava quando encontra uma URL
  # utilizável: o payload da Meta traz apenas o link do CDN, e apagar o que já
  # foi capturado deixaria o template sem mídia nenhuma para enviar.
  def capture_header_media_source
    return unless components_changed?

    candidate = example_header_media_url
    return if candidate.blank? || candidate == header_media_url

    self.header_media_url = candidate
    self.header_attachment_id = Media::AttachmentLookup.from_file_url(candidate)&.id
  end
end
