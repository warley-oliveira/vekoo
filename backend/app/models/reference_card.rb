# Um card do banco de referências: um post real (ou uma peça nossa que deu
# certo) analisado e guardado como **padrão** — gancho, estrutura, visual,
# função do copy, por que funciona —, nunca como cópia. O agente de criação
# consulta o banco na geração; o assinante nunca o vê: nenhuma rota, serializer
# ou canal fora de `Admin::` toca este modelo.
#
# É acervo da plataforma, como os layouts: não pertence a organização nem a
# marca. As listas (nicho, arquétipos, status…) são as de `Taxonomy`.
#
# A curadoria anda por `TRANSITIONS`; `archived` também é o "rejeitado" e
# sempre leva o motivo. `version` conta as revisões do conteúdo depois da
# primeira publicação — a peça que usou o card sabe de qual versão saiu.
class ReferenceCard < ApplicationRecord
  STATUSES = Taxonomy::STATUSES
  ORIGINS = Taxonomy::ORIGINS
  MAX_ARCHETYPES = 3
  # O andamento do job de análise, à parte da curadoria.
  ANALYSIS_STATUSES = %w[pending running done failed].freeze
  MAX_BANNED_TERMS = 20

  TRANSITIONS = {
    "draft" => %w[in_review archived],
    # De volta ao rascunho é a análise rodando de novo.
    "in_review" => %w[draft published archived],
    "published" => %w[in_review archived],
    "archived" => %w[in_review]
  }.freeze

  # O que muda o padrão em si. Status e procedência não contam como revisão.
  CONTENT = %w[niche size archetypes objective format suggested_layout_id analysis].freeze

  # O perfil de origem: o @ de Instagram ou TikTok.
  HANDLE = /\A@[a-z0-9._]{1,30}\z/

  belongs_to :curated_by, class_name: "Account", optional: true

  # As imagens do post: só até a análise terminar (depois são apagadas). A
  # miniatura fica, e só o painel da curadoria a serve.
  has_many_attached :originals
  has_one_attached :thumbnail

  # Cosseno: o vetor é normalizado na gravação.
  has_neighbors :embedding, normalize: true

  before_validation :normalize_content
  before_save :stamp_publication, :bump_version

  validates :status, inclusion: { in: STATUSES }
  validates :analysis_status, inclusion: { in: ANALYSIS_STATUSES }
  validates :origin, inclusion: { in: ORIGINS }
  validates :niche, inclusion: { in: Taxonomy::NICHES }, allow_nil: true
  validates :size, inclusion: { in: Taxonomy::SIZES }, allow_nil: true
  validates :objective, inclusion: { in: Taxonomy::OBJECTIVES }, allow_nil: true
  validates :format, inclusion: { in: Taxonomy::FORMATS }, allow_nil: true
  validates :version, numericality: { only_integer: true, greater_than: 0 }
  validates :archived_reason, presence: true, length: { maximum: 500 }, if: :archived?
  validate :archetypes_must_be_known
  validate :suggested_layout_must_fit
  validate :analysis_must_match_schema
  validate :source_must_be_well_formed
  validate :transition_must_be_allowed, if: -> { persisted? && will_save_change_to_status? }
  validate :must_be_complete_to_publish, if: :published?

  scope :published, -> { where(status: "published") }
  scope :recent_first, -> { order(created_at: :desc) }

  def draft? = status == "draft"
  def in_review? = status == "in_review"
  def published? = status == "published"
  def archived? = status == "archived"

  def can_transition_to?(target)
    TRANSITIONS.fetch(status, []).include?(target.to_s)
  end

  def analysis_failed? = analysis_status == "failed"
  def analyzing? = analysis_status.in?(%w[pending running])

  # O que impede (ou atrapalha) o card de ir para o agente: a análise cita a
  # fonte (`leak`), repete frase do post (`copied`) ou ficou sem vetor
  # (`noEmbedding`, o único que não barra a publicação — só tira a
  # similaridade da conta).
  def findings
    found = References::Leakage.findings(analysis, source).map { |finding| finding.merge("code" => "leak") }
    found += References::CopyGuard.copied_paths(analysis, copy_shingles).map { |path| { "code" => "copied", "path" => path } }
    found << { "code" => "noEmbedding" } if embedding.nil? && analysis_status == "done"
    found
  end

  def blocking_findings = findings.reject { |finding| finding["code"] == "noEmbedding" }

  # Os erros da análise e da fonte saem pelo caminho do campo
  # (`analysis.hook.type`, `source.url`); a mensagem de erro lê o valor dali.
  def read_attribute_for_validation(attribute)
    root, *path = attribute.to_s.split(".")
    return super if path.empty?

    path.reduce(public_send(root)) { |value, key|
      case value
      when Hash then value[key]
      when Array then value[key.to_i]
      end
    }
  end

  # O formato da peça → os formatos do Vekoo que este card serve.
  def piece_formats
    Taxonomy::PIECE_FORMATS.select { |_, reference| reference == format }.keys
  end

  private

  def normalize_content
    self.niche = niche.presence
    self.size = size.presence
    self.objective = objective.presence
    self.format = format.presence
    self.suggested_layout_id = suggested_layout_id.presence
    self.archetypes = Array(archetypes).map(&:to_s).compact_blank.uniq
    self.analysis = ReferenceCard::Analysis.normalize(analysis)
    self.source = normalize_source(source)

    # Colunas para a recuperação filtrar sem abrir o jsonb — sempre o reflexo
    # da análise, nunca digitadas.
    hook = analysis.dig("hook", "type")
    score = analysis.dig("replicability", "score")
    self.hook_type = Taxonomy::HOOK_TYPES.include?(hook) ? hook : nil
    self.replicability = Taxonomy::REPLICABILITY.include?(score) ? score : nil
    self.relative_engagement = analysis.dig("metrics", "relativeEngagement")
  end

  def normalize_source(raw)
    raw = raw.is_a?(Hash) ? raw.stringify_keys : {}
    channel = raw["channel"].to_s.strip.downcase.delete(" ")
    channel = "@#{channel}" if channel.present? && !channel.start_with?("@")
    terms = Array(raw["bannedTerms"]).filter_map { |term| term.to_s.squish.first(80).presence }.uniq.first(MAX_BANNED_TERMS)
    { "url" => raw["url"].to_s.strip.presence, "channel" => channel.presence, "bannedTerms" => terms.presence }.compact
  end

  def stamp_publication
    self.published_at ||= Time.current if published?
  end

  def bump_version
    return unless persisted? && published_at_was.present?
    return unless CONTENT.any? { |attribute| will_save_change_to_attribute?(attribute) }

    self.version = version_was + 1
  end

  def archetypes_must_be_known
    errors.add(:archetypes, :inclusion) if (archetypes - Taxonomy::ARCHETYPES).any?
    errors.add(:archetypes, :too_many_items) if archetypes.length > MAX_ARCHETYPES
  end

  # O layout sugerido existe e sai num formato de peça que este card serve.
  def suggested_layout_must_fit
    return if suggested_layout_id.nil?

    contract = Layouts::Registry.find(suggested_layout_id)
    return errors.add(:suggested_layout_id, :inclusion) unless contract
    return if format.nil?

    errors.add(:suggested_layout_id, :invalid) if piece_formats.none? { |piece_format| contract.supports?(piece_format) }
  end

  # O erro sai no caminho do campo (`analysis.hook.type`), como no Brandcore:
  # é nele que a tela de revisão põe o foco. Publicado, vale o modo estrito —
  # a análise inteira preenchida.
  def analysis_must_match_schema
    ReferenceCard::Analysis.errors_for(analysis, strict: published?).each do |path, code, options|
      errors.add(:"analysis.#{path}", code, **options)
    end
  end

  def source_must_be_well_formed
    errors.add(:"source.url", :invalid) if source["url"] && !source["url"].match?(%r{\Ahttps?://[^\s/$.?#].\S*\z}i)
    errors.add(:"source.channel", :invalid) if source["channel"] && !source["channel"].match?(HANDLE)
  end

  def transition_must_be_allowed
    return if TRANSITIONS.fetch(status_was, []).include?(status)

    errors.add(:status, :invalid_transition, from: status_was, to: status)
  end

  # Publicar é liberar para o agente: o encaixe na taxonomia, além da análise
  # inteira (conferida no modo estrito acima) — sem replicabilidade nem
  # formato o filtro duro da recuperação não decide.
  def must_be_complete_to_publish
    %i[niche objective format].each { |attribute| errors.add(attribute, :blank) if self[attribute].blank? }
    errors.add(:archetypes, :blank) if archetypes.empty?
    blocking_findings.each do |finding|
      errors.add(:"analysis.#{finding['path']}", finding["code"].to_sym, term: finding["match"])
    end
  end
end
