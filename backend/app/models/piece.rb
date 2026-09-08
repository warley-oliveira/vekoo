# Uma peça: a saída de um motor sobre a versão publicada do Brandcore.
#
# O ciclo é queued → rendering → ready | failed (a renderização é um job).
# `provenance` guarda de que versão da marca a peça saiu e que fatos (refs)
# consumiu, com valor — é isso que permite detectar peça desatualizada
# quando um preço muda, e oferecer a regeneração.
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

  # Refs cuja fonte mudou desde a geração: fato sumiu, voltou a pendente ou
  # o valor de hoje não é o que está impresso na peça.
  def stale_refs
    return [] unless ready? && brand_core.published?

    published = BrandCore::Schema.complete(brand_core.published_document)
    facts = published.dig("facts", "items")
    Array(provenance["refs"]).filter_map do |ref|
      current = facts.find { |fact| fact["id"] == ref["factId"] }
      current_value = current && current["status"] == "confirmed" ? Engines::Refs.format_fact(current) : nil
      next if current_value == ref["value"]

      {
        "field" => ref["field"], "factId" => ref["factId"], "label" => ref["label"],
        "previous" => ref["value"], "current" => current_value,
        "reason" => current.nil? ? "missing" : current["status"] == "pending" ? "pending" : "changed"
      }
    end
  end

  def stale?
    stale_refs.any?
  end

  # Saiu de uma versão anterior da marca. Não quer dizer que esteja errada —
  # só as refs dizem isso —, mas a tela mostra.
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
