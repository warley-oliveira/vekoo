# A forma do documento do Brandcore — a fonte única de verdade do lado do
# servidor. O espelho em TypeScript é `frontend/src/lib/brand-core.ts`: as duas
# listas de enum abaixo têm que bater com as de lá (a tela traduz os códigos).
#
# O documento é um hash de **seções**; a tela salva uma seção inteira por vez
# (uma etapa do formulário = uma seção). `normalize` recebe o que vier da
# requisição e devolve só o que a forma conhece, com tipos coerentes;
# `errors_for` diz o que está inválido, por caminho (`palette.colors.2.hex`).
module BrandCore::Schema
  SECTIONS = %w[identity palette typography styles voice offers notes assets].freeze

  # Etapas do formulário, na ordem. Os **arquivos** moram em `brand_assets`;
  # a seção `assets` do documento guarda só a escolha — qual logo é a
  # principal —, e é por isso que trocar a logo passa por rascunho, histórico
  # e publicação como qualquer outra mudança da marca.
  STEPS = %w[identity colors typography styles assets voice offers notes].freeze

  COLOR_ROLES = %w[
    darkBackground lightBackground textOnDark textOnLight muted accent campaign
  ].freeze
  BACKGROUND_ROLES = { "darkBackground" => "textOnDark", "lightBackground" => "textOnLight" }.freeze
  HEX = /\A#[0-9a-fA-F]{6}\z/

  FONT_ROLES = %w[display utility].freeze
  FONT_SOURCES = %w[catalog file system].freeze
  FONT_WEIGHTS = [ 100, 200, 300, 400, 500, 600, 700, 800, 900 ].freeze

  STYLE_KEYS = %w[kicker title lede body number item footer].freeze
  STYLE_TRANSFORMS = %w[none uppercase].freeze

  TONES = %w[direct warm playful technical inspiring sober bold educational].freeze
  QUALITY_RULES = %w[
    maxOneAntithesis alwaysConcreteData noEmojiRendered noGenericClaims noStackedExclamation
  ].freeze

  NETWORKS = %w[instagram tiktok youtube facebook linkedin whatsapp site other].freeze

  # Quantos produtos a marca guarda. O limite é do prompt do agente: a lista
  # inteira viaja em toda geração, e uma lista sem fim viraria conta de token.
  MAX_OFFERS = 40

  # Limites de texto — os mesmos do zod da tela.
  SHORT = 80
  LINE = 160
  PARAGRAPH = 600
  NOTES = 2000
  MAX_LIST = 60

  module_function

  # Estilos com defaults inteligentes: a pessoa ajusta, não cria do zero.
  def default_styles
    [
      style("kicker", font: "utility", size: 14, weight: 600, transform: "uppercase",
        on_dark: "accent", on_light: "accent"),
      style("title", font: "display", size: 44, weight: 700),
      style("lede", font: "display", size: 24, weight: 500),
      style("body", font: "utility", size: 18, weight: 400),
      style("number", font: "display", size: 64, weight: 700, on_dark: "accent", on_light: "accent"),
      style("item", font: "utility", size: 18, weight: 500),
      style("footer", font: "utility", size: 13, weight: 400, on_dark: "muted", on_light: "muted")
    ]
  end

  def style(key, font:, size:, weight:, transform: "none", on_dark: "textOnDark", on_light: "textOnLight")
    {
      "key" => key, "font" => font, "size" => size, "weight" => weight,
      "transform" => transform, "colorOnDark" => on_dark, "colorOnLight" => on_light
    }
  end

  def default_document
    {
      "identity" => {
        "name" => "", "segment" => "", "concept" => "", "audience" => "", "positioning" => "",
        "characters" => [], "address" => "", "instagram" => "", "networks" => [],
        "niche" => "", "archetypes" => { "primary" => "", "secondary" => "" }
      },
      "palette" => { "colors" => [] },
      "typography" => {
        "display" => default_font, "utility" => default_font, "rules" => []
      },
      "styles" => { "roles" => default_styles },
      "voice" => {
        "essence" => "", "tones" => [], "toneNote" => "", "bannedWords" => [],
        "qualityRules" => QUALITY_RULES.index_with { |rule| rule != "noGenericClaims" },
        "examples" => []
      },
      # Produtos e ofertas: o que a marca vende, por quanto e quando vale.
      # É **conhecimento**, não burocracia — o agente lê para escrever com
      # precisão (e para nunca inventar preço). Sem status, sem vínculo com
      # peça, sem bloquear publicação.
      "offers" => { "items" => [] },
      # Anotações da operação: horário, endereço, o que não coube em oferta —
      # texto livre e opcional. Era uma lista de fatos com status, que barrava
      # geração; virou o que sempre foi na prática, uma nota de contexto.
      "notes" => { "text" => "" },
      # A logo principal: o `logo_id` de um grupo de `brand_assets`. Vazio é
      # "a de sempre" — a enviada mais recente, senão o nosso logotipo
      # (`BrandCore::Logos#primary`).
      "assets" => { "primaryLogoId" => "" }
    }
  end

  def default_font
    { "family" => "", "source" => "catalog", "weights" => [ 400, 700 ], "usage" => "", "assetId" => nil }
  end

  # Documento completo a partir do que está no banco: seções que faltam ganham
  # o default, para a tela nunca receber `undefined` no meio de um formulário.
  def complete(document)
    document = (document || {}).deep_stringify_keys
    default_document.merge(document.slice(*SECTIONS)) { |_key, default, given|
      default.merge(given.is_a?(Hash) ? given : {})
    }
  end

  # ---------------------------------------------------------------------------
  # Normalização: o que entra vira a forma conhecida, sem chaves estranhas.

  def normalize_section(section, raw)
    raw = (raw || {}).deep_stringify_keys
    case section
    when "identity" then normalize_identity(raw)
    when "palette" then normalize_palette(raw)
    when "typography" then normalize_typography(raw)
    when "styles" then normalize_styles(raw)
    when "voice" then normalize_voice(raw)
    when "offers" then normalize_offers(raw)
    when "notes" then normalize_notes(raw)
    when "assets" then normalize_assets(raw)
    end
  end

  def normalize_identity(raw)
    {
      "name" => text(raw["name"], SHORT),
      "segment" => text(raw["segment"], SHORT),
      "concept" => text(raw["concept"], LINE),
      # Pra quem a marca escreve. Separado de `positioning` (o que faz alguém
      # escolher esta marca e não a do lado) porque o agente precisa dos dois,
      # e misturados no mesmo parágrafo ele não sabe qual é qual.
      "audience" => text(raw["audience"], PARAGRAPH),
      "positioning" => text(raw["positioning"], PARAGRAPH),
      "characters" => items(raw["characters"]) { |c|
        { "name" => text(c["name"], SHORT), "role" => text(c["role"], LINE) }
      },
      "address" => text(raw["address"], LINE),
      "instagram" => handle(raw["instagram"]),
      "networks" => items(raw["networks"]) { |n|
        { "network" => enum(n["network"], NETWORKS, "other"), "handle" => text(n["handle"], LINE) }
      },
      # O nicho e o estilo da marca, nos códigos de `Taxonomy` — os mesmos do
      # banco de referências, que é onde a geração os cruza. `segment` continua
      # sendo o texto que a pessoa usou; `niche` é a classificação.
      "niche" => enum(raw["niche"].to_s, Taxonomy::NICHES, ""),
      "archetypes" => normalize_archetypes(raw["archetypes"])
    }
  end

  # Principal e secundário, nessa ordem. Secundário sem principal sobe, e o
  # repetido some: a forma corrige em vez de reclamar, porque o onboarding
  # também escreve aqui, e uma inferência repetida não pode derrubar a seção
  # inteira da identidade.
  def normalize_archetypes(raw)
    raw = raw.respond_to?(:to_h) ? raw.to_h.stringify_keys : {}
    picked = raw.values_at("primary", "secondary").map(&:to_s).select { |code| Taxonomy::ARCHETYPES.include?(code) }.uniq
    { "primary" => picked[0].to_s, "secondary" => picked[1].to_s }
  end

  def normalize_palette(raw)
    {
      "colors" => items(raw["colors"]) { |c|
        {
          "name" => text(c["name"], SHORT),
          "hex" => text(c["hex"], 9).downcase,
          "role" => enum(c["role"], COLOR_ROLES, "accent")
        }
      }
    }
  end

  def normalize_typography(raw)
    {
      "display" => normalize_font(raw["display"]),
      "utility" => normalize_font(raw["utility"]),
      "rules" => strings(raw["rules"], LINE)
    }
  end

  def normalize_font(raw)
    raw = (raw || {}).deep_stringify_keys
    weights = Array(raw["weights"]).map(&:to_i).select { |w| FONT_WEIGHTS.include?(w) }.uniq.sort
    {
      "family" => text(raw["family"], SHORT),
      "source" => enum(raw["source"], FONT_SOURCES, "catalog"),
      "weights" => weights.empty? ? [ 400 ] : weights,
      "usage" => text(raw["usage"], LINE),
      "assetId" => raw["assetId"].presence&.to_s
    }
  end

  # Os papéis são fixos: a tela ajusta valores, nunca cria ou apaga papéis.
  def normalize_styles(raw)
    given = Array(raw["roles"]).map { |r| r.to_h.deep_stringify_keys }.index_by { |r| r["key"] }
    {
      "roles" => default_styles.map { |default|
        role = given[default["key"]] || {}
        {
          "key" => default["key"],
          "font" => enum(role["font"], FONT_ROLES, default["font"]),
          "size" => clamp(role["size"], 8, 200, default["size"]),
          "weight" => enum(role["weight"].to_i, FONT_WEIGHTS, default["weight"]),
          "transform" => enum(role["transform"], STYLE_TRANSFORMS, default["transform"]),
          "colorOnDark" => enum(role["colorOnDark"], COLOR_ROLES, default["colorOnDark"]),
          "colorOnLight" => enum(role["colorOnLight"], COLOR_ROLES, default["colorOnLight"])
        }
      }
    }
  end

  def normalize_voice(raw)
    rules = (raw["qualityRules"] || {}).to_h.deep_stringify_keys
    {
      "essence" => text(raw["essence"], LINE),
      "tones" => Array(raw["tones"]).map(&:to_s).select { |t| TONES.include?(t) }.uniq,
      "toneNote" => text(raw["toneNote"], LINE),
      "bannedWords" => items(raw["bannedWords"]) { |w| { "text" => text(w["text"], SHORT) } },
      "qualityRules" => QUALITY_RULES.index_with { |rule| rules[rule] == true },
      "examples" => items(raw["examples"]) { |e| { "text" => text(e["text"], PARAGRAPH) } }
    }
  end

  # `price` e `validity` são texto de propósito: "R$ 18", "3x de R$ 40",
  # "até domingo", "toda quarta". Número e data cravados obrigariam a pessoa a
  # traduzir o negócio dela para a forma do banco — e o agente escreve melhor
  # com a frase que ela usaria.
  def normalize_offers(raw)
    {
      "items" => items(raw["items"], MAX_OFFERS) { |offer|
        {
          "name" => text(offer["name"], SHORT),
          "price" => text(offer["price"], SHORT),
          "description" => text(offer["description"], LINE),
          "validity" => text(offer["validity"], LINE)
        }
      }
    }
  end

  def normalize_notes(raw)
    { "text" => text(raw["text"], NOTES) }
  end

  UUID = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

  def normalize_assets(raw)
    id = raw["primaryLogoId"].to_s.strip.downcase
    { "primaryLogoId" => id.match?(UUID) ? id : "" }
  end

  # ---------------------------------------------------------------------------
  # Validação: caminho → código. A tela mostra no campo certo.

  def errors_for(section, data)
    errors = []
    case section
    when "identity"
      errors << [ "identity.name", :blank ] if data["name"].blank?
      each_item(data["characters"], "identity.characters", errors) { |c, path|
        errors << [ "#{path}.name", :blank ] if c["name"].blank?
      }
      each_item(data["networks"], "identity.networks", errors) { |n, path|
        errors << [ "#{path}.handle", :blank ] if n["handle"].blank?
      }
    when "palette"
      each_item(data["colors"], "palette.colors", errors) { |c, path|
        errors << [ "#{path}.hex", :invalid ] unless c["hex"].match?(HEX)
        errors << [ "#{path}.name", :blank ] if c["name"].blank?
      }
    when "typography"
      FONT_ROLES.each do |role|
        font = data[role]
        errors << [ "typography.#{role}.assetId", :blank ] if font["source"] == "file" && font["assetId"].blank?
      end
    when "voice"
      each_item(data["bannedWords"], "voice.bannedWords", errors) { |w, path|
        errors << [ "#{path}.text", :blank ] if w["text"].blank?
      }
    when "offers"
      each_item(data["items"], "offers.items", errors) { |offer, path|
        errors << [ "#{path}.name", :blank ] if offer["name"].blank?
      }
    end
    errors
  end

  # As regras da paleta que valem para a completude (não bloqueiam o rascunho:
  # a pessoa pode salvar uma cor só e voltar depois).
  def palette_rules(palette)
    roles = Array(palette["colors"]).select { |c| c["hex"].to_s.match?(HEX) }.map { |c| c["role"] }
    backgrounds = roles & BACKGROUND_ROLES.keys
    {
      "background" => backgrounds.any?,
      "textPerBackground" => backgrounds.any? && backgrounds.all? { |bg| roles.include?(BACKGROUND_ROLES[bg]) },
      "accent" => roles.include?("accent")
    }
  end

  # ---------------------------------------------------------------------------

  def text(value, max)
    value.to_s.strip.first(max)
  end

  def handle(value)
    text(value, SHORT).delete_prefix("@")
  end

  def enum(value, allowed, default)
    allowed.include?(value) ? value : default
  end

  def clamp(value, min, max, default)
    number = Integer(value, exception: false)
    number ? number.clamp(min, max) : default
  end

  def strings(list, max)
    Array(list).map { |s| text(s, max) }.reject(&:blank?).first(MAX_LIST)
  end

  # Lista de itens com id: mantém o id que a tela deu (é como ela casa o erro
  # com a linha certa) e inventa um se faltar.
  def items(list, max = MAX_LIST)
    Array(list).first(max).map { |raw|
      raw = raw.to_h.deep_stringify_keys
      { "id" => raw["id"].presence&.to_s || SecureRandom.uuid }.merge(yield(raw))
    }
  end

  def each_item(list, base, _errors)
    Array(list).each_with_index { |item, index| yield item, "#{base}.#{index}" }
  end
end
