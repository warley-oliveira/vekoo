# Anexo escolhido pela pessoa: o arquivo que ela guarda para reusar no chat, nas mensagens
# rápidas e nas campanhas (origem: ChatAttachment). Na origem pertencia a um assistente;
# aqui, à organização. A mídia recebida de um provedor não é anexo: fica só na mensagem
# (ver Media::Storage). Quem de outro domínio cita anexo passa por Media::AttachmentLookup.
class Attachment < ApplicationRecord
  # O maior que os provedores aceitam em documento, e o teto do proxy de mídia.
  MAX_BYTES = 100.megabytes

  belongs_to :organization

  has_one_attached :file

  # Galeria: enviado por dentro de uma conversa (`private`) não aparece nela.
  scope :available, -> { where(private: false) }

  before_validation :inherit_name
  before_save :remember_file_name

  validates :name, presence: true
  validates :file, presence: true
  validate :file_within_limit

  # O anexo dono de uma URL gerada por #file_url: caminho do Active Storage, com ou sem host,
  # ou a chave do blob na ponta. Sem organização porque quem chega aqui já tem a URL gravada.
  #
  # @return [Attachment, nil]
  def self.from_file_url(url)
    blob = blob_from_url(url)
    return nil if blob.nil?

    ActiveStorage::Attachment.find_by(blob_id: blob.id, record_type: name, name: "file")&.record
  end

  def self.blob_from_url(url)
    path = URI.parse(url.to_s).path.to_s
    return nil if path.blank?

    if (signed_id = path[%r{/rails/active_storage/blobs/(?:redirect/|proxy/)?([^/]+)/}, 1])
      ActiveStorage::Blob.find_signed(signed_id)
    else
      ActiveStorage::Blob.find_by(key: File.basename(path))
    end
  rescue URI::InvalidURIError, ActiveSupport::MessageVerifier::InvalidSignature
    nil
  end
  private_class_method :blob_from_url

  # Caminho sem host: é o que fica guardado na mensagem, para continuar válido mesmo se o
  # domínio da API mudar (ver Media::Storage). `Media::Storage.public_url` monta o absoluto.
  def file_url
    Media::Storage.path_for(file.blob) if file.attached?
  end

  def media_type
    case File.extname(file.blob.filename.to_s.downcase)
    when *MessageHandling::IMAGE_FORMATS then "image"
    when *MessageHandling::VIDEO_FORMATS then "video"
    when *MessageHandling::AUDIO_FORMATS then "audio"
    else "document"
    end
  end

  private

  def inherit_name
    self.name = file.blob.filename.to_s if name.blank? && file.attached?
  end

  def remember_file_name
    self.file_name = file.blob.filename.to_s if file.attached?
  end

  def file_within_limit
    return unless file.attached? && file.blob.byte_size.to_i > MAX_BYTES

    errors.add(:file, :too_large)
  end
end
