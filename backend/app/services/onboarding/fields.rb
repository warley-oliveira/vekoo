module Onboarding
  # Os campos lidos de uma resposta, gravados no rascunho do brandcore.
  #
  # Cada seção passa pelo `assign_section` — a mesma normalização e validação
  # do wizard de edição. É isso que garante que a conversa e o formulário
  # escrevem o mesmo documento, e não dois parecidos.
  #
  # Devolve os **temas** tocados (é deles que sai o "paleta gravada ✓") e a
  # fonte que a pessoa pediu e o catálogo não tem.
  module Fields
    Outcome = Struct.new(:touched, :missing_font, :kept_font, keyword_init: true)

    # Campo da identidade → o tema que ele fecha. O estilo (`archetypes`) é
    # inferido junto da voz e não fecha tema nenhum sozinho.
    IDENTITY = {
      "name" => "brand", "concept" => "brand", "segment" => "brand", "niche" => "brand",
      "audience" => "audience", "positioning" => "differential",
      "instagram" => nil, "address" => nil, "archetypes" => nil
    }.freeze

    module_function

    # `topic` é o tema da pergunta: decide a quem pertence a observação de
    # tom, que serve tanto a "como fala" quanto a "o que nunca diria".
    def apply(brand_core, fields, topic:)
      document = brand_core.full_document
      touched = []

      touched |= identity(brand_core, document, fields)
      touched |= voice(brand_core, document, fields, topic)
      touched |= offers(brand_core, fields)
      notes(brand_core, fields)
      touched |= palette(brand_core, fields)
      fonts = typography(brand_core, document, fields)
      touched |= fonts[:touched]

      Outcome.new(touched: BrandCore::Onboarding::TOPICS & touched, missing_font: fonts[:missing], kept_font: fonts[:kept])
    end

    # Uma opção do "cria pra mim" que a pessoa escolheu. Já vem pronta do
    # `Onboarding::Suggest` — paleta com papéis e contraste conferido, par de
    # fontes do catálogo, voz com tons válidos.
    def choose(brand_core, kind, option)
      document = brand_core.full_document
      case kind
      when "palette"
        assign(brand_core, "palette", "colors" => option["colors"])
      when "fonts"
        assign(brand_core, "typography", document["typography"].merge(
          "display" => option["display"], "utility" => option["utility"]
        ))
      when "wordmark"
        brand_core.choose_logo(option["logoId"].to_s)
      when "voice"
        voice = document["voice"]
        banned = merge_banned(voice["bannedWords"], Array(option["bannedWords"]))
        assign(brand_core, "voice", voice.merge(
          "essence" => option["essence"], "tones" => option["tones"], "bannedWords" => banned
        ))
      end
    end

    # ----------------------------------------------------------------- seções

    def identity(brand_core, document, fields)
      given = fields.slice(*IDENTITY.keys)
      return [] if given.empty?

      return [] unless assign(brand_core, "identity", document["identity"].merge(given))

      given.keys.filter_map { |key| IDENTITY[key] }.uniq
    end

    def voice(brand_core, document, fields, topic)
      given = fields.slice("example", "essence", "tones", "toneNote", "bannedWords")
      return [] if given.empty?

      voice = document["voice"].dup
      touched = []
      if given["example"]
        texts = voice["examples"].map { |example| example["text"] }
        voice["examples"] += [ { "text" => given["example"] } ] unless texts.include?(given["example"])
        touched << "voice"
      end
      %w[essence tones].each do |key|
        next unless given[key]

        voice[key] = given[key]
        touched << "voice"
      end
      if given["toneNote"]
        voice["toneNote"] = given["toneNote"]
        touched << (topic.to_s == "banned" ? "banned" : "voice")
      end
      if given["bannedWords"]
        voice["bannedWords"] = merge_banned([], given["bannedWords"])
        touched << "banned"
      end

      assign(brand_core, "voice", voice) ? touched.uniq : []
    end

    def offers(brand_core, fields)
      return [] unless fields["offers"]

      assign(brand_core, "offers", "items" => fields["offers"]) ? [ "offers" ] : []
    end

    def notes(brand_core, fields)
      assign(brand_core, "notes", "text" => fields["notes"]) if fields["notes"]
    end

    # As cores que a pessoa disse viram a paleta inteira: papéis derivados e
    # contraste conferido pelo mesmo `PaletteBuilder` do "cria pra mim".
    def palette(brand_core, fields)
      return [] if fields["colors"].blank?

      colors = BrandCore::PaletteBuilder.call(fields["colors"], label: ->(role) { role_label(role) })
      return [] if colors.empty?

      assign(brand_core, "palette", "colors" => colors) ? [ "palette" ] : []
    end

    # Fonte só entra se é aberta (vitrine ou qualquer família do Google
    # Fonts): fora disso ela não renderiza, e uma marca que promete Gotham e
    # sai em DejaVu é pior do que perguntar de novo. Uma fonte só vale para
    # título e texto. Num par em que só uma existe, a que existe entra no
    # papel dela (`kept`) e o tema segue aberto pela que falta (`missing`).
    FONT_WEIGHTS = { "display" => [ 600, 700 ], "utility" => [ 400, 500 ] }.freeze

    def typography(brand_core, document, fields)
      wanted = { "display" => fields["displayFont"], "utility" => fields["utilityFont"] }.compact_blank
      return { touched: [], missing: nil, kept: nil } if wanted.empty?

      wanted = FONT_WEIGHTS.keys.index_with(wanted.values.first) if wanted.size == 1
      found = wanted.to_h { |role, family| [ role, catalog(family) ] }
      missing = wanted[found.key(nil)]
      kept = found.compact
      return { touched: [], missing: missing, kept: nil } if kept.empty?

      typography = document["typography"].merge(kept.to_h { |role, font| [ role, font_payload(font, FONT_WEIGHTS[role]) ] })
      saved = assign(brand_core, "typography", typography)
      return { touched: [], missing: missing, kept: (kept.values.first.family if saved) } if missing

      { touched: saved ? [ "fonts" ] : [], missing: nil, kept: nil }
    end

    # ----------------------------------------------------------------- apoio

    # "Montserrat", "montserrat", "Montserrat Bold" — a pessoa escreve do
    # jeito dela; o catálogo tem um nome só. Primeiro o nome exato em todo o
    # Google Fonts (com peso ou estilo no fim): "Inter Tight" é uma família,
    # não "Inter". Depois a vitrine no meio da frase, por palavra inteira —
    # "Interstate" não é "Inter". O índice inteiro não entra nessa busca
    # solta: são 1.800 famílias, e "Oi" também é uma delas.
    def catalog(family)
      BrandCore::FontCatalog.find(family) ||
        BrandCore::FontDirectory.find(family) ||
        BrandCore::FontDirectory.find(family.to_s.sub(STYLE_SUFFIX, "")) ||
        BrandCore::FontCatalog.families
          .sort_by { |name| -name.length }
          .find { |name| family.match?(/(?<![[:alnum:]])#{Regexp.escape(name)}(?![[:alnum:]])/i) }
          &.then { |name| BrandCore::FontCatalog.find(name) }
    end

    STYLE_SUFFIX = /(?:\s+(?:thin|extralight|extra light|light|regular|book|medium|semibold|semi bold|bold|extrabold|extra bold|black|heavy|italic|\d{3}))+\s*\z/i

    def font_payload(font, wanted)
      weights = wanted.map { |weight| BrandCore::FontCatalog.nearest_weight(font.family, weight) }.uniq.sort
      { "family" => font.family, "source" => "catalog", "weights" => weights, "usage" => "", "assetId" => nil }
    end

    def merge_banned(current, words)
      existing = current.map { |word| word["text"] }
      (existing + words).uniq { |text| text.downcase }.map { |text| { "text" => text } }
    end

    def assign(brand_core, section, data)
      errors = brand_core.assign_section(section, data)
      Rails.logger.warn("onboarding: #{section} recusada — #{errors.map(&:first).join(', ')}") if errors.any?
      errors.empty?
    end

    def role_label(role)
      I18n.t("brand_core.roles.#{role.underscore}", default: role)
    end
  end
end
