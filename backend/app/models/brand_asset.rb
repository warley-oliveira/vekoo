# Um ativo oficial da marca: logo, glifo, foto ou arquivo de fonte. Entra por
# arquivo e nunca é recriado por aproximação — por isso o original fica
# guardado como veio (o proxy do Active Storage serve o blob, não uma variante:
# uma variante em JPEG mataria a transparência do PNG).
class BrandAsset < ApplicationRecord
  KINDS = %w[logo glyph photo font].freeze
  VARIANTS = {
    "logo" => %w[light dark],
    "glyph" => %w[light dark],
    "photo" => [],
    "font" => %w[display utility]
  }.freeze

  IMAGE_TYPES = %w[image/png image/svg+xml].freeze
  # Aceitos em logo e glifo, mas guardados como PNG (`RasterToPng`).
  CONVERTED_TYPES = %w[image/jpeg image/webp].freeze
  PHOTO_TYPES = %w[image/jpeg image/png image/webp].freeze
  FONT_TYPES = %w[font/ttf font/otf font/woff2].freeze
  FONT_EXTENSIONS = { ".ttf" => "font/ttf", ".otf" => "font/otf", ".woff2" => "font/woff2" }.freeze
  # Assinaturas dos arquivos de fonte: o navegador costuma mandar fonte como
  # `application/octet-stream`, então o que decide é o começo do arquivo.
  FONT_MAGIC = {
    "\x00\x01\x00\x00".b => "font/ttf", "true".b => "font/ttf",
    "OTTO".b => "font/otf", "wOF2".b => "font/woff2"
  }.freeze

  MAX_IMAGE_BYTES = 10.megabytes
  # Logo é traço, não foto: 5 MB sobram para SVG e PNG em 2048 px.
  MAX_LOGO_BYTES = 5.megabytes
  MAX_FONT_BYTES = 5.megabytes

  belongs_to :brand_core
  belongs_to :organization
  belongs_to :account, optional: true

  has_one_attached :file
  # SVG não aparece na tela pelo `file`: o Active Storage serve SVG como
  # download (`application/octet-stream`), porque SVG pode carregar script.
  # A tela mostra este PNG, rasterizado no upload (`AnalyzeBrandAsset`); o
  # SVG original continua sendo o que se baixa.
  has_one_attached :preview

  # Toda logo pertence a um grupo (`BrandCore::Logos`). Quem não disse qual
  # é uma logo sozinha — nunca um arquivo invisível.
  before_validation { self.logo_id ||= SecureRandom.uuid if kind == "logo" }

  validates :kind, inclusion: { in: KINDS }
  validates :filename, presence: true
  validates :content_type, presence: true
  validates :byte_size, numericality: { greater_than: 0 }
  validate :variant_must_fit_kind

  scope :ordered, -> { order(:kind, :created_at) }

  # O que vai para a tela e para o render no navegador: o PNG do SVG, ou o
  # próprio arquivo.
  def display_file
    preview.attached? ? preview : file
  end

  # Largura e altura do que a tela mostra — o layout precisa da proporção
  # antes de a imagem carregar. SVG não tem medida própria; o PNG dele tem.
  def display_size
    return [ width, height ] if width || !preview.attached?

    preview.metadata.values_at("width", "height")
  end

  def self.accepted_types(kind)
    case kind
    when "logo", "glyph" then IMAGE_TYPES + CONVERTED_TYPES
    when "photo" then PHOTO_TYPES
    when "font" then FONT_TYPES
    else []
    end
  end

  def self.max_bytes(kind)
    case kind
    when "font" then MAX_FONT_BYTES
    when "logo" then MAX_LOGO_BYTES
    else MAX_IMAGE_BYTES
    end
  end

  # Tipo real do arquivo enviado, para o `kind` pedido — nil quando não serve.
  def self.detect_type(kind, io)
    return nil unless KINDS.include?(kind)
    return nil unless io.size.to_i.between?(1, max_bytes(kind))

    if kind == "font"
      detect_font_type(io)
    else
      type = io.content_type.to_s
      accepted_types(kind).include?(type) ? type : nil
    end
  end

  def self.detect_font_type(io)
    io.rewind
    head = io.read(4).to_s.b
    io.rewind
    FONT_MAGIC[head] || FONT_EXTENSIONS[File.extname(io.original_filename.to_s).downcase]
  end

  def image?
    content_type.start_with?("image/")
  end

  # O que as descrições de foto (`DescribeBrandAsset`) custaram — entra no teto
  # de OPEX junto com o agente e o gerador.
  def self.description_cost_micro_usd_since(organization, since)
    where(organization: organization).where(described_at: since..).sum(:description_cost_micro_usd)
  end

  private

  def variant_must_fit_kind
    allowed = VARIANTS.fetch(kind, [])
    if allowed.empty?
      errors.add(:variant, :invalid) if variant.present?
    else
      errors.add(:variant, :inclusion) unless allowed.include?(variant)
    end
  end
end
