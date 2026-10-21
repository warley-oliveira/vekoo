# Um evento do funil de onboarding.
#
# Só escrita e leitura agregada: nada no produto depende de um evento
# específico. Por isso não tem `updated_at` — evento não muda.
class OnboardingEvent < ApplicationRecord
  ACTIONS = %w[viewed answered skipped suggested followed_up finished].freeze
  # Os temas da conversa e o resumo. Os passos do onboarding de telas ficam
  # válidos porque os eventos antigos continuam no banco.
  STEPS = (BrandCore::Onboarding::TOPICS + [ BrandCore::Onboarding::SUMMARY ] +
    BrandCore::Onboarding::LEGACY_STEPS).uniq.freeze

  belongs_to :organization
  belongs_to :brand_core, optional: true
  belongs_to :account, optional: true

  validates :step, inclusion: { in: STEPS }
  validates :action, inclusion: { in: ACTIONS }

  scope :since, ->(time) { where(created_at: time..) }
  # A chave primária é UUID: `last` sem ordem devolve linha arbitrária, não a
  # mais recente. Quem quiser a última usa isto.
  scope :ordered, -> { order(:created_at) }

  # O funil: quantas marcas chegaram a cada tema, quantas responderam,
  # quantas pularam, quantas precisaram de seguimento e quantas pediram ajuda
  # à IA. O resumo entra no fim: é onde se publica.
  #
  # "Chegou" é ter **qualquer** evento na etapa, e não só o `viewed`: quem
  # respondeu obviamente chegou, e contar só a visita subestimaria o alcance
  # sempre que um cliente não mandar o evento de abertura.
  def self.funnel(since: 90.days.ago)
    rows = since(since).group(:step, :action).distinct.count(:brand_core_id)
    reached = since(since).group(:step).distinct.count(:brand_core_id)
    steps = BrandCore::Onboarding::TOPICS + [ BrandCore::Onboarding::SUMMARY ]
    base = reached[steps.first].to_i

    steps.map do |step|
      arrived = reached[step].to_i
      {
        "step" => step,
        "reached" => arrived,
        # Da primeira pergunta (`brand`) até aqui.
        "reachPercent" => base.positive? ? (arrived * 100.0 / base).round : 0,
        "answered" => rows[[ step, "answered" ]].to_i,
        "skipped" => rows[[ step, "skipped" ]].to_i,
        "suggested" => rows[[ step, "suggested" ]].to_i,
        "followedUp" => rows[[ step, "followed_up" ]].to_i,
        "finished" => rows[[ step, "finished" ]].to_i
      }
    end
  end

  # Quanto custou, de IA, criar cada marca — a média é o número que interessa
  # para o plano.
  def self.cost_per_brand(since: 90.days.ago)
    totals = since(since).where.not(brand_core_id: nil).group(:brand_core_id).sum(:cost_micro_usd)
    return { brands: 0, averageMicroUsd: 0, totalMicroUsd: 0 } if totals.empty?

    { brands: totals.size, averageMicroUsd: (totals.values.sum / totals.size), totalMicroUsd: totals.values.sum }
  end
end
