# O Brandcore: a marca da organização como dado estruturado. É a peça de que
# toda geração depende — sem ele preenchido no mínimo e publicado, nada sai.
#
# Dois documentos moram aqui:
#   - `document`: o rascunho, salvo etapa a etapa pelo formulário;
#   - `published_document`: a última publicação, a única que a geração lê.
# A forma dos dois é a de `BrandCore::Schema` (espelhada em
# `frontend/src/lib/brand-core.ts`).
class BrandCore < ApplicationRecord
  STATUSES = %w[draft published].freeze

  belongs_to :organization
  has_many :assets, class_name: "BrandAsset", dependent: :destroy
  has_many :versions, -> { order(number: :desc) }, class_name: "BrandCoreVersion", dependent: :destroy

  validates :status, inclusion: { in: STATUSES }
  validates :organization_id, uniqueness: true
  validate :document_must_be_a_hash

  # Um por organização, criado na primeira visita ao formulário.
  def self.for(organization)
    organization.brand_core || organization.create_brand_core!
  end

  def published?
    status == "published"
  end

  # Substitui uma seção inteira pelo que veio da tela (já normalizado).
  # Devolve os erros de validação da seção, por caminho — vazio quando salvou.
  def assign_section(section, raw)
    normalized = BrandCore::Schema.normalize_section(section, raw)
    errors = BrandCore::Schema.errors_for(section, normalized)
    return errors if errors.any?

    self.document = full_document.merge(section => normalized)
    []
  end

  def full_document
    BrandCore::Schema.complete(document)
  end

  def completeness
    BrandCore::Completeness.new(document, has_logo: logo?)
  end

  def published_completeness
    return nil unless published?

    BrandCore::Completeness.new(published_document, has_logo: logo?)
  end

  def logo?
    assets.any? { |asset| asset.kind == "logo" }
  end

  def visited_steps
    Array(progress["visitedSteps"]) & BrandCore::Schema::STEPS
  end

  def last_step
    step = progress["lastStep"]
    BrandCore::Schema::STEPS.include?(step) ? step : nil
  end

  def track_progress(visited: nil, last_step: nil)
    steps = visited_steps
    steps |= (Array(visited) & BrandCore::Schema::STEPS)
    steps |= [ last_step ] if BrandCore::Schema::STEPS.include?(last_step)
    self.progress = {
      "visitedSteps" => BrandCore::Schema::STEPS & steps,
      "lastStep" => BrandCore::Schema::STEPS.include?(last_step) ? last_step : self.last_step
    }
  end

  def unpublished_changes?
    published? && full_document != BrandCore::Schema.complete(published_document)
  end

  # Contrato para o módulo de geração: ele lê daqui, nunca do rascunho.
  # `blockers` vazio é o sinal verde; fato pendente não bloqueia tudo — só as
  # gerações que dependerem dele (o "portão dos pendentes", item a item).
  def generation_contract
    blockers = []
    blockers << "notPublished" unless published?
    blockers << "minimumNotMet" if published? && !published_completeness.minimum_met?
    {
      ready: blockers.empty?,
      blockers: blockers,
      document: published? ? BrandCore::Schema.complete(published_document) : nil,
      pendingFactIds: pending_fact_ids
    }
  end

  def pending_fact_ids
    source = published? ? published_document : document
    Array(BrandCore::Schema.complete(source).dig("facts", "items"))
      .select { |item| item["status"] == "pending" }.map { |item| item["id"] }
  end

  private

  def document_must_be_a_hash
    errors.add(:document, :invalid) unless document.is_a?(Hash)
  end
end
