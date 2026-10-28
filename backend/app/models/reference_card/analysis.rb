# A análise de uma referência: o post real convertido em texto estruturado —
# como ele prende, como se organiza, como se vê, o que o texto **faz** (nunca o
# que ele diz), por que funciona, quanto custa repetir e como performou.
#
# A forma é um JSON Schema montado aqui, com os enums de `Taxonomy`. O mesmo
# schema valida o que a curadoria grava e, no modo estrito, é o contrato da
# saída do modelo que analisa a imagem. Dois modos porque são dois momentos:
#   - rascunho: tipos e limites conferidos, campo vazio permitido (a análise
#     ainda não rodou, ou a curadoria está no meio de uma edição);
#   - estrito (`strict: true`): tudo preenchido — é o que se exige para
#     publicar e o que o modelo tem que devolver.
#
# Chaves em camelCase, como o documento do Brandcore e o resto da API.
module ReferenceCard::Analysis
  SHORT = 160
  TEXT = 280
  PARAGRAPH = 600
  MAX_BEATS = 10

  # Os textos que a análise tem que ter para publicar, por caminho.
  TEXTS = {
    "hook" => { "description" => TEXT },
    "structure" => { "summary" => PARAGRAPH },
    "visual" => { "composition" => TEXT, "color" => TEXT, "typography" => TEXT, "imagery" => TEXT },
    "copy" => { "function" => PARAGRAPH, "tone" => SHORT, "cta" => SHORT },
    "replicability" => { "requirements" => TEXT }
  }.freeze

  METRICS = %w[likes comments baselineMedian relativeEngagement collectedAt].freeze

  # Erro do JSON Schema → o código que a tela e a API já conhecem.
  CODES = {
    "enum" => :inclusion, "required" => :blank, "minLength" => :blank, "minItems" => :blank,
    "maxLength" => :too_long, "maxItems" => :too_long, "minimum" => :invalid,
    "exclusiveMinimum" => :invalid, "type" => :invalid, "format" => :invalid,
    "additionalProperties" => :invalid
  }.freeze

  module_function

  # Nulo entra pela lista de tipos (ou do enum), não por `anyOf`: assim cada
  # campo inválido dá **um** erro, e não um por ramo.
  def schema(strict: false)
    choice = ->(values) { { "enum" => strict ? values : values + [ nil ] } }
    text = ->(max) { { "type" => "string", "maxLength" => max }.merge(strict ? { "minLength" => 1 } : {}) }
    number = ->(spec) { spec.merge("type" => [ spec["type"], "null" ]) }

    {
      "$schema" => "https://json-schema.org/draft/2020-12/schema",
      "type" => "object",
      "additionalProperties" => false,
      "required" => %w[hook structure visual copy whyItWorks replicability metrics],
      "properties" => {
        "hook" => object(
          "type" => choice.call(Taxonomy::HOOK_TYPES),
          "description" => text.call(TEXT)
        ),
        "structure" => object(
          "summary" => text.call(PARAGRAPH),
          "beats" => { "type" => "array", "maxItems" => MAX_BEATS, "items" => text.call(SHORT) }
            .merge(strict ? { "minItems" => 1 } : {})
        ),
        "visual" => object(TEXTS["visual"].transform_values { |max| text.call(max) }),
        "copy" => object(TEXTS["copy"].transform_values { |max| text.call(max) }),
        "whyItWorks" => text.call(PARAGRAPH),
        "replicability" => object(
          "score" => choice.call(Taxonomy::REPLICABILITY),
          "requirements" => text.call(TEXT)
        ),
        # Nunca obrigatórias: referência curada sem dado de desempenho é
        # legítima — só não ganha o ponto de engajamento na recuperação.
        "metrics" => object(
          "likes" => number.call({ "type" => "integer", "minimum" => 0 }),
          "comments" => number.call({ "type" => "integer", "minimum" => 0 }),
          "baselineMedian" => number.call({ "type" => "number", "exclusiveMinimum" => 0 }),
          "relativeEngagement" => number.call({ "type" => "number", "minimum" => 0 }),
          "collectedAt" => number.call({ "type" => "string", "format" => "date" })
        )
      }
    }
  end

  def object(properties)
    { "type" => "object", "additionalProperties" => false, "required" => properties.keys, "properties" => properties }
  end

  def schemer(strict: false)
    @schemers ||= {}
    @schemers[strict] ||= JSONSchemer.schema(schema(strict: strict), format: true)
  end

  # Vazio, com a forma inteira: é o que um card recém-cadastrado guarda.
  def blank
    normalize({})
  end

  # A forma conhecida a partir do que vier (modelo, curadoria): chave estranha
  # sai, texto é aparado e cortado no limite, número vira número. Enum fora da
  # lista **fica** — quem reclama é a validação, no campo certo.
  #
  # `relativeEngagement` nunca é digitado: é (curtidas + comentários) dividido
  # pela mediana de curtidas + comentários dos últimos 30 posts da mesma
  # conta (`baselineMedian`). Faltou qualquer um dos três, fica nulo.
  def normalize(raw)
    raw = raw.is_a?(Hash) ? raw.deep_stringify_keys : {}
    section = ->(key) { raw[key].is_a?(Hash) ? raw[key] : {} }

    analysis = TEXTS.to_h { |key, fields|
      [ key, fields.to_h { |field, max| [ field, text(section.call(key)[field], max) ] } ]
    }
    analysis["hook"] = { "type" => code(section.call("hook")["type"]) }.merge(analysis["hook"])
    analysis["structure"]["beats"] = Array(section.call("structure")["beats"]).filter_map { |beat|
      text(beat, SHORT).presence
    }.first(MAX_BEATS)
    analysis["whyItWorks"] = text(raw["whyItWorks"], PARAGRAPH)
    analysis["replicability"] = { "score" => score(section.call("replicability")["score"]) }.merge(analysis["replicability"])
    analysis["metrics"] = metrics(section.call("metrics"))

    analysis.slice("hook", "structure", "visual", "copy", "whyItWorks", "replicability", "metrics")
  end

  # Caminho → código, como `BrandCore::Schema.errors_for` (`hook.type`,
  # `structure.beats.2`, `metrics.likes`), mais o que a mensagem interpola —
  # o limite, no `too_long`.
  def errors_for(analysis, strict: false)
    schemer(strict: strict).validate(analysis).flat_map { |error|
      path = error["data_pointer"].delete_prefix("/").tr("/", ".")
      code = CODES.fetch(error["type"], :invalid)
      limit = error["schema"].is_a?(Hash) ? error["schema"].values_at("maxLength", "maxItems").compact.first : nil
      next [ [ path, code, code == :too_long ? { count: limit } : {} ] ] unless error["type"] == "required"

      Array(error.dig("details", "missing_keys")).map { |key| [ [ path.presence, key ].compact.join("."), code, {} ] }
    }.uniq(&:first)
  end

  def valid?(analysis, strict: false)
    schemer(strict: strict).valid?(analysis)
  end

  def text(value, max)
    value.is_a?(String) || value.is_a?(Numeric) ? value.to_s.squish.first(max) : ""
  end

  def code(value)
    value.is_a?(String) ? value.strip.presence : nil
  end

  # 1, "2", 3.0 → inteiro; o resto fica como veio para a validação apontar.
  def score(value)
    integer = Integer(value.to_s, exception: false) if value.is_a?(String) || value.is_a?(Integer)
    integer || (value.is_a?(Float) && value == value.to_i ? value.to_i : value)
  end

  def metrics(raw)
    likes = count(raw["likes"])
    comments = count(raw["comments"])
    baseline = positive(raw["baselineMedian"])
    relative = (likes + comments).fdiv(baseline).round(2) if likes && comments && baseline
    {
      "likes" => likes,
      "comments" => comments,
      "baselineMedian" => baseline,
      "relativeEngagement" => relative,
      "collectedAt" => date(raw["collectedAt"])
    }
  end

  def count(value)
    number = Integer(value.to_s, exception: false) if value.is_a?(Integer) || value.is_a?(String)
    number if number&.>=(0)
  end

  def positive(value)
    number = Float(value.to_s, exception: false) if value.is_a?(Numeric) || value.is_a?(String)
    number.to_i == number ? number.to_i : number.round(2) if number&.positive?
  end

  def date(value)
    Date.iso8601(value.to_s).iso8601
  rescue Date::Error
    nil
  end
end
