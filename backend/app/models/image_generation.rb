# Um pedido de imagem: do texto da pessoa às fotos que entraram na marca.
#
# O crédito é reservado no pedido (por imagem) e o que não sair volta — como
# no agente de criação. O custo real fica aqui (`cost_micro_usd`) e entra no
# teto mensal de OPEX da Vekoo.
class ImageGeneration < ApplicationRecord
  STATUSES = %w[queued running done failed].freeze
  # `agent`: o agente de criação chamou a ferramenta no meio de um pedido.
  ORIGINS = %w[studio editor agent].freeze
  # As proporções que a peça usa (e que o gerador aceita).
  ASPECT_RATIOS = { "feed_portrait" => "4:5", "feed_square" => "1:1", "story" => "9:16", "carousel" => "4:5" }.freeze
  RATIOS = ASPECT_RATIOS.values.uniq.freeze
  COUNTS = (1..4)
  PROMPT_MAX = 1_000

  belongs_to :organization
  belongs_to :brand_core
  belongs_to :account, optional: true
  belongs_to :agent_turn, optional: true

  validates :status, inclusion: { in: STATUSES }
  validates :origin, inclusion: { in: ORIGINS }
  validates :aspect_ratio, inclusion: { in: RATIOS }
  validates :count, inclusion: { in: COUNTS }
  validates :prompt, presence: true, length: { maximum: PROMPT_MAX }

  scope :recent_first, -> { order(created_at: :desc) }

  def pending? = status.in?(%w[queued running])

  def assets
    brand_core.assets.where(id: asset_ids)
  end

  def self.cost_micro_usd_since(organization, since)
    where(organization: organization).where(created_at: since..).sum(:cost_micro_usd)
  end
end
