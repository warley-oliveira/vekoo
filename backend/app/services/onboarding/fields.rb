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
    Outcome = Struct.new(:touched, :missing_font, keyword_init: true)

    IDENTITY = {
      "name" => "brand", "concept" => "brand", "segment" => "brand",
      "audience" => "audience", "positioning" => "differential",
      "instagram" => nil, "address" => nil
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

      Outcome.new(touched: BrandCore::Onboarding::TOPICS & touched, missing_font: fonts[:missing])
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

    # Fonte só entra se existe no catálogo: fora dele ela não renderiza, e uma
    # marca que promete Gotham e sai em DejaVu é pior do que perguntar de novo.
    # Uma fonte só vale para título e texto.
    def typography(brand_core, document, fields)
      wanted = fields.slice("displayFont", "utilityFont").values.compact_blank
      return { touched: [], missing: nil } if wanted.empty?

      found = wanted.map { |family| [ family, catalog(family) ] }
      missing = found.find { |_, font| font.nil? }&.first
      return { touched: [], missing: missing } if missing

      display, utility = found.map(&:last)
      utility ||= display
      typography = document["typography"].merge(
        "display" => font_payload(display, [ 600, 700 ]),
        "utility" => font_payload(utility, [ 400, 500 ])
      )
      { touched: assign(brand_core, "typography", typography) ? [ "fonts" ] : [], missing: nil }
    end

    # ----------------------------------------------------------------- apoio

    # "Montserrat", "montserrat", "Montserrat Bold" — a pessoa escreve do
    # jeito dela; o catálogo tem um nome só. Por palavra inteira: "Interstate"
    # não é "Inter".
    def catalog(family)
      BrandCore::FontCatalog.find(family) ||
        BrandCore::FontCatalog.families
          .sort_by { |name| -name.length }
          .find { |name| family.match?(/(?<![[:alnum:]])#{Regexp.escape(name)}(?![[:alnum:]])/i) }
          &.then { |name| BrandCore::FontCatalog.find(name) }
    end

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
