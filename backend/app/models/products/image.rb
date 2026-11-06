module Products
  # Imagem de um item.
  #
  # O arquivo fica no Active Storage quando nós o hospedamos (upload pela tela ou
  # espelhamento na importação). Sem arquivo, é uma URL externa que o cliente importou
  # e optou por não espelhar, e `source_url` é tudo o que existe dela.
  class Image < ApplicationRecord
    # Ponto único de verdade dos formatos aceitos — usado no upload pela tela e no
    # espelhamento de URL externa na importação.
    EXTENSION_BY_CONTENT_TYPE = {
      "image/jpeg" => "jpg",
      "image/png" => "png",
      "image/webp" => "webp",
      "image/gif" => "gif"
    }.freeze

    ALLOWED_CONTENT_TYPES = EXTENSION_BY_CONTENT_TYPE.keys.freeze
    DEFAULT_EXTENSION = "jpg"
    MAX_BYTES = 10.megabytes

    belongs_to :item, class_name: "Products::Item", foreign_key: :product_item_id, inverse_of: :images

    has_one_attached :file do |attachable|
      # WebP e não JPEG: foto de produto com fundo transparente é comum, e o JPEG
      # chapa a transparência em preto.
      attachable.variant :thumb,
        resize_to_limit: [ 400, 400 ], format: :webp, saver: { quality: 75 }
    end

    validates :source_url, presence: true, unless: :hosted?
    validate :source_url_is_web
    validate :file_acceptable, if: :hosted?

    # `created_at` no desempate: com UUID, o `id` sozinho não preserva a ordem de envio.
    scope :ordered, -> { order(position: :asc, created_at: :asc, id: :asc) }
    scope :external, -> { where.missing(:file_attachment) }

    # A extensão não é cosmética: quem entrega mídia (WhatsApp) decide o tipo pelo nome
    # do arquivo. Sem ela a foto chegaria ao cliente como documento, não como imagem.
    def self.extension_for(content_type)
      EXTENSION_BY_CONTENT_TYPE.fetch(content_type.to_s.split(";").first.to_s.strip, DEFAULT_EXTENSION)
    end

    def self.filename_for(item_id, content_type)
      "product-#{item_id}-#{SecureRandom.hex(4)}.#{extension_for(content_type)}"
    end

    def hosted?
      file.attached?
    end

    # Caminho relativo: o host da API não é o do front, e uma URL absoluta amarraria a
    # resposta ao domínio de hoje. É a rota proxy, que não expira nem quebra o CORS.
    def public_url
      return source_url unless hosted?

      url_helpers.rails_storage_proxy_url(file, only_path: true)
    end

    def thumb_url
      return source_url unless hosted?

      url_helpers.rails_storage_proxy_url(file.variant(:thumb), only_path: true)
    end

    # URL absoluta para entregar a imagem fora do painel (WhatsApp, bloco de fluxo). A
    # hospedada leva a extensão no nome do arquivo; a externa já vem do CSV do cliente.
    # Em produção o host vem de `routes.default_url_options` (BACKEND_URL).
    def delivery_url(host: nil)
      return source_url unless hosted?

      url_helpers.rails_storage_proxy_url(file, host: host || default_host)
    end

    private

    def url_helpers
      Rails.application.routes.url_helpers
    end

    def default_host
      Rails.application.routes.default_url_options[:host] || "localhost:#{ENV.fetch("RAILS_PORT", 3000)}"
    end

    def source_url_is_web
      return if source_url.blank? || Products.web_url?(source_url)

      errors.add(:source_url, :invalid)
    end

    # Vale o tipo que o Active Storage detectou no conteúdo, não o que o navegador
    # declarou, e por isso a checagem mora no modelo: é o mesmo portão para o upload da
    # tela e para o espelhamento.
    def file_acceptable
      blob = file.blob
      errors.add(:file, :unsupported_type) unless ALLOWED_CONTENT_TYPES.include?(blob.content_type)
      errors.add(:file, :too_large, max: MAX_BYTES / 1.megabyte) if blob.byte_size > MAX_BYTES
    end
  end
end
