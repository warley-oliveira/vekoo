module Onboarding
  # O "não sei / cria pra mim": três propostas para a pergunta em que a pessoa
  # travou.
  #
  # Sempre devolve três opções. Se o modelo não responder, responder torto ou
  # não estiver configurado, entram as propostas curadas
  # (`Onboarding::Fallbacks`) — o botão não pode dizer "deu erro", porque ele
  # é a saída de quem já disse que não sabe. Quem chama descobre a diferença
  # por `source`, e a tela não muda de forma por causa disso.
  #
  # O que sai daqui **já é salvável**: paleta com os papéis derivados e
  # contraste conferido, par de fontes que existe no catálogo, voz com tons
  # válidos. Nada volta para a tela precisando de conserto.
  class Suggest
    KINDS = %w[palette fonts voice].freeze
    WANTED = 3

    Result = Struct.new(:kind, :options, :source, :usage, :model, :cost_micro_usd, keyword_init: true)

    def self.call(brand_core, kind:, chat: Ai::Chat.new)
      new(brand_core, kind, chat).call
    end

    # Só as propostas curadas, sem tocar no modelo. É o caminho de quando o
    # teto de custo do mês já bateu: a pessoa não deveria descobrir isso.
    def self.curated(brand_core, kind:)
      instance = new(brand_core, kind, nil)
      Result.new(kind: kind, options: instance.fallback, source: "curated", usage: {}, cost_micro_usd: 0)
    end

    def initialize(brand_core, kind, chat)
      @brand_core = brand_core
      @kind = kind.to_s
      @chat = chat
      @document = BrandCore::Schema.complete(brand_core.document)
    end

    def call
      raise ArgumentError, "kind desconhecido: #{@kind}" unless KINDS.include?(@kind)

      answer = ask
      options = answer ? parse(answer.text) : []

      if options.length >= 2
        Result.new(kind: @kind, options: options.first(WANTED), source: "ai",
          usage: answer.usage, model: answer.model,
          cost_micro_usd: Agent::Pricing.micro_usd(answer.model, answer.usage))
      else
        Result.new(kind: @kind, options: fallback, source: "curated",
          usage: answer&.usage || {}, model: answer&.model,
          cost_micro_usd: answer ? Agent::Pricing.micro_usd(answer.model, answer.usage) : 0)
      end
    end

    # Público para `.curated`; o resto da classe segue fechado.
    def fallback
      case @kind
      when "palette" then Fallbacks.palettes(segment_code).map { |option| build_palette(option) }.compact
      when "fonts" then Fallbacks.fonts(segment_code).map { |option| build_fonts(option) }.compact
      else Fallbacks.voices(@document.dig("voice", "tones")).map { |option| build_voice(option) }.compact
      end
    end

    private

    def ask
      @chat.answer(
        system: [ { type: "text", text: Prompts.system, cache_control: { type: "ephemeral" } } ],
        messages: [ { role: "user", content: prompt } ],
        model: Agent::Run.model,
        max_tokens: 2_000,
        # Tarefa curta e criativa: `low` responde em segundos e a diferença de
        # qualidade não paga a espera numa tela de cadastro.
        effort: "low"
      )
    rescue Ai::Chat::MissingKey
      Rails.logger.info("onboarding: sem ANTHROPIC_API_KEY — usando propostas curadas")
      nil
    rescue Ai::Chat::Failed => e
      Rails.logger.warn("onboarding: #{e.message}")
      nil
    end

    def prompt
      case @kind
      when "palette" then Prompts.palette(brief)
      when "fonts" then Prompts.fonts(brief, BrandCore::FontCatalog.as_prompt)
      else Prompts.voice(brief, BrandCore::Schema::TONES, BrandCore::Schema::QUALITY_RULES)
      end
    end

    # O que o modelo sabe da marca até aqui — que é pouco, e é o ponto: as
    # perguntas vêm antes justamente para haver isto.
    def brief
      identity = @document["identity"]
      {
        name: identity["name"],
        what: identity["concept"],
        segment: identity["segment"],
        audience: identity["audience"],
        positioning: identity["positioning"],
        city: identity["address"],
        wanted_font: @kind == "fonts" ? @brand_core.onboarding_wanted_font : nil,
        tones: @document.dig("voice", "tones"),
        logo_colors: logo_colors
      }
    end

    # Quem subiu logo já escolheu as cores. Só para a paleta: para fonte e voz
    # a cor não diz nada.
    def logo_colors
      return [] unless @kind == "palette"

      asset = @brand_core.assets.where(kind: "logo", generated: false).order(:created_at).first
      return [] unless asset

      BrandCore::DominantColors.call(asset.file.download)
    rescue StandardError
      []
    end

    # O código do segmento fica no progresso do onboarding: `identity.segment`
    # guarda o texto que a pessoa confirmou, que pode ser qualquer coisa.
    def segment_code
      @brand_core.onboarding_state["segment"].to_s
    end

    # ------------------------------------------------------------- validação

    def parse(raw)
      payload = extract(raw)
      Array(payload && payload["options"]).filter_map { |option|
        next unless option.is_a?(Hash)

        case @kind
        when "palette" then build_palette(option)
        when "fonts" then build_fonts(option)
        else build_voice(option)
        end
      }.uniq { |option| signature(option) }
    end

    # A proposta vira paleta pronta: os papéis derivados e o contraste
    # conferido pelo mesmo `PaletteBuilder` do caminho manual.
    def build_palette(option)
      colors = Array(option["colors"]).filter_map { |hex| BrandCore::PaletteBuilder.normalize(hex) }
      return nil if colors.empty?

      palette = BrandCore::PaletteBuilder.call(colors, label: ->(role) { role_label(role) })
      return nil if palette.empty?

      {
        "name" => text(option["name"], 40).presence || role_label("accent"),
        "why" => text(option["why"], 160).presence,
        "colors" => palette
      }
    end

    def build_fonts(option)
      display = BrandCore::FontCatalog.find(option["display"].to_s)
      utility = BrandCore::FontCatalog.find(option["utility"].to_s)
      return nil unless display && utility && display.family != utility.family

      {
        "why" => text(option["why"], 160).presence,
        "display" => font_payload(display, [ 600, 700 ]),
        "utility" => font_payload(utility, [ 400, 500 ])
      }
    end

    def font_payload(font, wanted)
      weights = wanted.map { |weight| BrandCore::FontCatalog.nearest_weight(font.family, weight) }.uniq.sort
      {
        "family" => font.family, "category" => font.category, "source" => "catalog",
        "weights" => weights, "usage" => "", "assetId" => nil
      }
    end

    def build_voice(option)
      essence = text(option["essence"], BrandCore::Schema::LINE)
      return nil if essence.blank?

      tones = Array(option["tones"]).map(&:to_s).select { |tone| BrandCore::Schema::TONES.include?(tone) }.uniq.first(3)
      {
        "essence" => essence,
        "why" => text(option["why"], 160).presence,
        "tones" => tones.presence || [ "direct" ],
        "bannedWords" => Array(option["bannedWords"]).filter_map { |word| text(word, BrandCore::Schema::SHORT).presence }.first(5)
      }
    end

    def signature(option)
      case @kind
      when "palette" then option["colors"].map { |c| c["hex"] }
      when "fonts" then [ option["display"]["family"], option["utility"]["family"] ]
      else option["essence"]
      end
    end

    def role_label(role)
      I18n.t("brand_core.roles.#{role.underscore}", default: role)
    end

    def text(value, max)
      value.to_s.squish.first(max).to_s
    end

    def extract(raw)
      Ai::JsonObject.extract(raw)
    end
  end
end
