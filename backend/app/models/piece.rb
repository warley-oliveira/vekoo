# Uma peça: a saída de um motor sobre a versão publicada do Brandcore.
#
# O ciclo é queued → rendering → ready | failed (a renderização é um job).
# `provenance` guarda de que versão da marca a peça saiu — é isso que permite
# dizer "a marca mudou desde então" e oferecer a regeneração.
class Piece < ApplicationRecord
  STATUSES = %w[queued rendering ready failed].freeze

  belongs_to :organization
  belongs_to :brand_core
  belongs_to :brand_core_version, optional: true
  belongs_to :account, optional: true

  has_many_attached :images

  normalizes :title, with: ->(title) { title.squish }

  validates :title, presence: true, length: { maximum: 120 }
  validates :status, inclusion: { in: STATUSES }
  validates :format, inclusion: { in: Engines::Manifest::FORMATS }
  validate :engine_must_exist
  validate :format_must_be_supported

  scope :recent_first, -> { order(created_at: :desc) }
  scope :for_engine, ->(id) { where(engine_id: id) }

  def entry
    Engines::Registry.find(engine_id)
  end

  def manifest
    entry&.manifest
  end

  def ready? = status == "ready"
  def failed? = status == "failed"
  def pending? = %w[queued rendering].include?(status)

  # Saiu de uma versão anterior da marca: as cores, as fontes ou a voz de hoje
  # não são as que estão impressas. A tela oferece gerar de novo.
  def outdated?
    version = provenance["brandCoreVersion"]
    version.present? && version != brand_core.current_version
  end

  def reset_for_render!
    update!(status: "queued", error: nil)
  end

  private

  def engine_must_exist
    errors.add(:engine_id, :inclusion) unless entry
  end

  def format_must_be_supported
    return unless entry && format.present?

    errors.add(:format, :inclusion) unless manifest.supports?(format)
  end
end
