# Quebra o texto de uma mensagem nas partes que vão para o canal: trechos de texto,
# links de imagem e anexos citados (`attachment_id_<id>`, `attachment_<nome>`). Cada parte
# é uma String ou um MediaMessageDto.
#
# O áudio sintetizado (`<audio>...</audio>`) era da resposta do assistente: aqui o texto
# entre as marcas segue como texto.
class MessageHandling
  IMAGE_FORMATS = %w[.jpg .jpeg .gif .png .gif .bmp .tiff .tif .svg .webp].freeze
  VIDEO_FORMATS = %w[.mp4 .mkv].freeze
  AUDIO_FORMATS = %w[.mp3 .wav .aac .ogg .opus].freeze
  DEFAULT_MIN_LINE_BREAKS = 2
  ATTACHMENT_NAME_SIMILARITY = 0.8

  # @param organization [Organization] dona dos anexos citados
  # @param min_line_breaks [Integer] quantas quebras de linha seguidas separam partes
  # @param split_links [Boolean] se cada link vira uma parte
  def initialize(organization, attachment_record_only: false, min_line_breaks: DEFAULT_MIN_LINE_BREAKS, split_links: true)
    @organization = organization
    @attachment_record_only = attachment_record_only
    @min_line_breaks = [ min_line_breaks.to_i, DEFAULT_MIN_LINE_BREAKS ].max
    @split_links = split_links
  end

  # @param message [String] o texto a processar
  # @return [Array<String, MediaMessageDto>]
  # @raise [AttachmentNotFoundException] quando cita um anexo que não existe
  def perform(message)
    split_handling(message.dup)
  end

  private

  attr_reader :attachment_record_only, :organization

  def split_regex
    @split_regex ||= Regexp.new(
      [
        (@split_links ? '(https?://[^\s]+)' : nil),
        '(attachment_id_[\w-]+)',
        '(attachment_[^\s]*)',
        '(attach_url_[^\s]*)',
        "(\\n{#{@min_line_breaks},})",
        "(<audio>.*?</audio>)"
      ].compact.join("|")
    )
  end

  def split_handling(message)
    clean_message!(message)

    message.split(split_regex).reject(&:blank?).map { |match| handle_part(match) }.reject(&:blank?).uniq
  end

  def handle_part(match)
    if match.start_with?("attachment_id_")
      attachment_by_id_handling(trim_reference(match.remove("attachment_id_")))
    elsif match.start_with?("attachment_")
      attachment_handling(trim_reference(match.remove("attachment_")))
    elsif match.start_with?("http") && !match.match?(/\s/)
      # Sem `split_links` a parte pode ser uma frase que só começa com um link: com a checagem
      # de espaço ela segue como texto, em vez de virar uma imagem de URL quebrada.
      link_handling(match)
    elsif match.start_with?("<audio>")
      match.remove("<audio>", "</audio>")
    else
      match.strip.remove(/\[|\]|<|>|`|"|'|~/)
    end
  end

  def trim_reference(reference)
    reference = reference.strip.remove("]")
    reference.end_with?(".") ? reference[0..-2] : reference
  end

  def link_handling(match)
    if IMAGE_FORMATS.any? { |format| File.extname(match).include?(format) }
      MediaMessageDto.new("image", nil, media_url: match)
    else
      match.end_with?(".") ? match[0..-2] : match
    end
  end

  def clean_message!(message)
    message.gsub!(%r{\[(https?://[^\s]+)\]}) { Regexp.last_match[1] }

    message.gsub!("![", "[")
    message.gsub!("**", "*")
    message.gsub!(/\[score:(.*?)\]/, "")
    message.gsub!(/\[.*?\]\((.*?)\)/, '\1')
    message.gsub!("\r", "")
  end

  def attachment_handling(attach_name)
    attach_name = attach_name.gsub(/\(|\)|\[|\]|<|>|`|"|'/, "").strip
    flat_attach_name = attach_name.sub(/\.([^.]*)$/, "").strip
    best = { similarity: 0, record: nil }

    Media::AttachmentLookup.available_for(organization.id).each do |attachment|
      [ attachment_file_name(attachment), attachment.name.to_s.parameterize.underscore ].compact_blank.each do |name|
        similarity = ContentProcessing::ContentAnalyzer.similarity(flat_attach_name, name)
        best = { similarity: similarity, record: attachment } if similarity > best[:similarity] && similarity > ATTACHMENT_NAME_SIMILARITY
      end
    end

    record = best[:record]
    raise AttachmentNotFoundException, I18n.t("connectors.messages.attachment_not_found", name: attach_name) unless record
    raise AttachmentNotFoundException, I18n.t("connectors.messages.attachment_blank", name: attach_name) if record.file.blank?

    attachment_record_only ? MediaMessageDto.new(nil, nil, nil, record.id) : build_attachment_dto(record, attach_name)
  end

  def attachment_by_id_handling(attach_id)
    record = Media::AttachmentLookup.find(attach_id, organization_id: organization.id)

    raise AttachmentNotFoundException, I18n.t("connectors.messages.attachment_not_found", name: attach_id) unless record
    raise AttachmentNotFoundException, I18n.t("connectors.messages.attachment_blank", name: attach_id) if record.file.blank?

    attachment_record_only ? MediaMessageDto.new(nil, nil, nil, record.id) : build_attachment_dto(record, "attachment_id_#{attach_id}")
  end

  def attachment_file_name(attachment)
    attachment.file.blob.filename.to_s.downcase
  rescue StandardError
    nil
  end

  def build_attachment_dto(record, attach_name)
    media_type =
      case File.extname(record.file.blob.filename.to_s.downcase)
      when *IMAGE_FORMATS then "image"
      when *VIDEO_FORMATS then "video"
      when *AUDIO_FORMATS then "audio"
      else "document"
      end

    file_path = nil
    if media_type != "audio"
      file_path = Rails.root.join("tmp", "#{SecureRandom.hex}-#{attach_name.downcase.parameterize}")
      File.binwrite(file_path, record.file.download)
    end
    MediaMessageDto.new(media_type, attach_name, file_path, record.id, media_url: record.file_url)
  end
end
