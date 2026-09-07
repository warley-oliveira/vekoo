# Uma imagem enviada pela pessoa, guardada de verdade.
#
# Antes a foto virava data URL dentro do documento e morava no localStorage —
# daí o teto apertado de 1,2 MB. Agora o arquivo fica no Active Storage e o
# documento guarda só `uploadId` e a URL.
class Upload < ApplicationRecord
  CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  MAX_BYTES = 10.megabytes

  belongs_to :organization
  belongs_to :account, optional: true

  has_one_attached :file do |attachable|
    # 1600 px e qualidade 82 são os mesmos números que o navegador usava antes
    # de mandar (`frontend/src/lib/image.ts`): a redução mudou de lugar, não de
    # valor. O Instagram publica em 1080, então isto ainda sobra.
    attachable.variant :display,
      resize_to_limit: [ 1600, 1600 ], format: :jpg, saver: { quality: 82 }
    attachable.variant :thumb,
      resize_to_limit: [ 400, 400 ], format: :jpg, saver: { quality: 75 }
  end

  validates :filename, presence: true
  validates :content_type, inclusion: { in: CONTENT_TYPES }
  validates :byte_size,
    numericality: { greater_than: 0, less_than_or_equal_to: MAX_BYTES }

  scope :recent_first, -> { order(created_at: :desc) }

  # Só o que o servidor consegue transformar. Recusar na entrada é melhor do
  # que descobrir na hora de gerar a variante, com o arquivo já no disco.
  def self.acceptable?(io)
    CONTENT_TYPES.include?(io.content_type) && io.size.to_i.between?(1, MAX_BYTES)
  end
end
