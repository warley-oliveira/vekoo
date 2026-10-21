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
  # Todo conteúdo nasce dentro da marca — e vai embora com ela.
  has_many :carousels, dependent: :destroy
  has_many :folders, dependent: :destroy
  has_many :pieces, dependent: :destroy
  has_many :agent_conversations, dependent: :destroy

  validates :status, inclusion: { in: STATUSES }
  validate :document_must_be_a_hash

  scope :ordered, -> { order(:created_at) }

  # O nome que a tela mostra no seletor: o da identidade, mesmo em rascunho.
  def name
    full_document.dig("identity", "name").presence
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
    # Mescla, não substitui: o estado do onboarding mora no mesmo jsonb, e
    # salvar uma etapa do wizard de edição não pode apagá-lo.
    self.progress = progress.merge(
      "visitedSteps" => BrandCore::Schema::STEPS & steps,
      "lastStep" => BrandCore::Schema::STEPS.include?(last_step) ? last_step : self.last_step
    )
  end

  # --------------------------------------------------------------- onboarding
  #
  # O onboarding por conversa é outra porta para este mesmo documento. O
  # estado dele mora no `progress` porque é exatamente isso — progresso —, e
  # ficar numa tabela à parte obrigaria dois lugares a concordar sobre onde a
  # pessoa parou. A conversa em si (o que foi dito) mora na
  # `AgentConversation` de propósito `onboarding`.

  def onboarding_state
    state = progress["onboarding"]
    state.is_a?(Hash) ? state : {}
  end

  # Marca publicada terminou o cadastro, por definição — inclusive as que
  # nasceram antes de o onboarding existir. É o que evita uma migração de
  # dados só para não mandar uma marca pronta de volta à primeira pergunta.
  def onboarding_done?
    onboarding_state["done"] == true || published?
  end

  # Nunca começou o onboarding **nem** o wizard de edição: marca recém-criada.
  def onboarding_pending?
    !onboarding_done? && visited_steps.empty?
  end

  # Os temas fechados. Inclui os passos do onboarding de telas, para quem
  # parou no meio dele retomar a conversa sem responder de novo.
  def onboarding_closed
    legacy = BrandCore::Onboarding.from_legacy(Array(onboarding_state["answered"]) | Array(onboarding_state["skipped"]))
    BrandCore::Onboarding::TOPICS & (Array(onboarding_state["topics"]) | legacy)
  end

  # Onde a conversa está: o primeiro tema aberto, ou o resumo.
  def onboarding_topic
    BrandCore::Onboarding::TOPICS.find { |topic| !onboarding_closed.include?(topic) } ||
      BrandCore::Onboarding::SUMMARY
  end

  # Temas em que o agente já gastou o seguimento ("dá pra ser mais
  # específico?"). Um por tema: depois disso ele segue em frente.
  def onboarding_follow_ups
    BrandCore::Onboarding::TOPICS & Array(onboarding_state["followUps"])
  end

  # O código do ramo. `identity.segment` guarda o texto que a pessoa usou; o
  # código fica aqui porque é o que as propostas curadas usam para escolher.
  def onboarding_segment
    onboarding_state["segment"].to_s.presence
  end

  # A pessoa pediu "cria pra mim" na logo. A intenção fica guardada porque o
  # desenho só acontece no fim: o logotipo usa a tipografia, e a tipografia é
  # escolhida **depois** da pergunta da logo.
  def wants_wordmark?
    onboarding_state["wantsWordmark"] == true
  end

  # A fonte que a pessoa pediu e o catálogo não tem — o "cria pra mim" da
  # fonte propõe as que chegam perto dela.
  def onboarding_wanted_font
    onboarding_state["wantedFont"].to_s.presence
  end

  def track_onboarding(close: nil, follow_up: nil, segment: nil, done: nil, wants_wordmark: nil, wanted_font: nil)
    state = onboarding_state.dup
    state["startedAt"] ||= (Time.current.to_f * 1000).round

    closing = Array(close) & BrandCore::Onboarding::TOPICS
    state["topics"] = BrandCore::Onboarding::TOPICS & (onboarding_closed | closing) if closing.any?
    if BrandCore::Onboarding.topic?(follow_up)
      state["followUps"] = BrandCore::Onboarding::TOPICS & (onboarding_follow_ups | [ follow_up.to_s ])
    end

    state["segment"] = segment if BrandCore::Onboarding::SEGMENTS.include?(segment.to_s)
    state["wantsWordmark"] = wants_wordmark unless wants_wordmark.nil?
    state["wantedFont"] = wanted_font.presence unless wanted_font.nil?
    state["done"] = done unless done.nil?
    self.progress = progress.merge("onboarding" => state)
  end

  # O mínimo do onboarding: marca, paleta e fonte fechadas. Voz e o resto são
  # opcionais — a voz que falta é preenchida no fechamento, e a pessoa a vê no
  # resumo antes de publicar.
  def onboarding_ready_to_finish?
    BrandCore::Onboarding::REQUIRED.all? { |topic| onboarding_closed.include?(topic) }
  end

  def onboarding_conversation
    agent_conversations.onboarding.first
  end

  def unpublished_changes?
    published? && full_document != BrandCore::Schema.complete(published_document)
  end

  # Contrato para o módulo de geração: ele lê daqui, nunca do rascunho.
  # `blockers` vazio é o sinal verde.
  def generation_contract
    blockers = []
    blockers << "notPublished" unless published?
    blockers << "minimumNotMet" if published? && !published_completeness.minimum_met?
    {
      ready: blockers.empty?,
      blockers: blockers,
      document: published? ? BrandCore::Schema.complete(published_document) : nil
    }
  end

  # O tema do editor de carrossel derivado dos papéis da paleta: o carrossel
  # continua guardando cores relativas (`ink`, `accent`), e é este mapa que
  # as traduz para a marca. Lê a publicação quando há; senão, o rascunho —
  # um carrossel novo não deveria nascer cinza só porque a marca ainda não
  # foi publicada.
  def carousel_theme
    doc = BrandCore::Schema.complete(published? ? published_document : document)
    colors = doc["palette"]["colors"].select { |c| c["hex"].to_s.match?(BrandCore::Schema::HEX) }
    pick = ->(role) { colors.find { |c| c["role"] == role }&.fetch("hex") }
    bg = pick.call("darkBackground") || pick.call("lightBackground")
    return nil unless bg

    ink = pick.call(BrandCore::Schema::BACKGROUND_ROLES.fetch(colors.find { |c| c["hex"] == bg }["role"])) ||
      (BrandCore::Colors.luminance(bg) > 0.4 ? "#1c1a24" : "#f6f3ee")
    accent = pick.call("accent") || ink
    candidates = [ pick.call("textOnDark"), pick.call("textOnLight"), bg, ink ].compact
    accent_ink = candidates.max_by { |c| BrandCore::Colors.contrast(accent, c) }
    {
      "bg" => bg,
      "surface" => BrandCore::Colors.mix(bg, ink, 0.08),
      "ink" => ink,
      "accent" => accent,
      "accentInk" => accent_ink
    }
  end

  private

  def document_must_be_a_hash
    errors.add(:document, :invalid) unless document.is_a?(Hash)
  end
end
