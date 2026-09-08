# Quanto do Brandcore está preenchido e o que falta para liberar a geração.
#
# Duas medidas diferentes de propósito:
#   - `percent`: o progresso que a barra mostra, por seção e ponderado;
#   - `required`: o conjunto mínimo obrigatório. Sem ele nada é gerado — e é
#     isso que a tela sinaliza como "mínimo para gerar", não o 100%.
class BrandCore::Completeness
  WEIGHTS = {
    "identity" => 20, "palette" => 20, "typography" => 15, "styles" => 10,
    "assets" => 10, "voice" => 15, "facts" => 10
  }.freeze

  REQUIRED = %w[
    identity.name identity.segment identity.concept
    palette.background palette.textPerBackground palette.accent
    typography.display typography.utility
    voice.essence voice.tones
  ].freeze

  def initialize(document, has_logo:)
    @doc = BrandCore::Schema.complete(document)
    @has_logo = has_logo
  end

  def sections
    {
      "identity" => ratio(identity_checks.values),
      "palette" => ratio(palette_rules.values),
      "typography" => ratio(typography_checks.values),
      "styles" => 100,
      "assets" => @has_logo ? 100 : 0,
      "voice" => ratio(voice_checks.values),
      "facts" => @doc["facts"]["items"].any? ? 100 : 0
    }
  end

  def percent
    total = WEIGHTS.values.sum
    (sections.sum { |section, value| value * WEIGHTS[section] }.fdiv(total)).round
  end

  def required
    checks = identity_checks.merge(palette_rules.transform_keys { |k| "palette.#{k}" })
      .merge(typography_checks).merge(voice_checks)
    REQUIRED.map { |key| { "key" => key, "met" => checks.fetch(key, false) } }
  end

  def minimum_met?
    required.all? { |item| item["met"] }
  end

  def pending_facts
    @doc["facts"]["items"].count { |item| item["status"] == "pending" }
  end

  def as_json
    {
      "percent" => percent,
      "sections" => sections,
      "required" => required,
      "minimumMet" => minimum_met?
    }
  end

  private

  def identity_checks
    identity = @doc["identity"]
    {
      "identity.name" => identity["name"].present?,
      "identity.segment" => identity["segment"].present?,
      "identity.concept" => identity["concept"].present?,
      "identity.positioning" => identity["positioning"].present?,
      "identity.instagram" => identity["instagram"].present?
    }
  end

  def palette_rules
    BrandCore::Schema.palette_rules(@doc["palette"])
  end

  def typography_checks
    BrandCore::Schema::FONT_ROLES.index_with { |role| @doc["typography"][role]["family"].present? }
      .transform_keys { |role| "typography.#{role}" }
  end

  def voice_checks
    voice = @doc["voice"]
    { "voice.essence" => voice["essence"].present?, "voice.tones" => voice["tones"].any? }
  end

  def ratio(values)
    return 100 if values.empty?

    (values.count(true) * 100 / values.length)
  end
end
