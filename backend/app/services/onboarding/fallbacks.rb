module Onboarding
  # As propostas de reserva: curadas à mão, sem rede.
  #
  # O botão "não sei / cria pra mim" é a promessa central do onboarding — ele
  # não pode responder "deu erro". Quando o modelo não responde (chave
  # ausente, rede fora, teto de custo batido) ou responde algo que não passa
  # na validação, a pessoa recebe estas. São boas o bastante para publicar uma
  # marca; a IA só as melhora quando está disponível.
  #
  # A escolha é **determinística pelo segmento**: a mesma padaria recebe as
  # mesmas três paletas nas duas vezes que abrir a tela, e ninguém tem a
  # sensação de que a ferramenta mudou de ideia sozinha.
  module Fallbacks
    PALETTES = {
      "restaurant" => [
        { name: "Brasa", colors: %w[#8c2f1e #f2b134 #fbf3e6] },
        { name: "Horta", colors: %w[#2f5d3a #d9b04a #f7f4ec] },
        { name: "Balcão", colors: %w[#1f1b18 #c96a3f #f6efe6] }
      ],
      "shop" => [
        { name: "Vitrine", colors: %w[#1b2b4b #e8654f #f7f3ee] },
        { name: "Papel", colors: %w[#2a2a2a #c9a227 #faf7f2] },
        { name: "Menta", colors: %w[#17423c #7fc7a8 #f2f7f4] }
      ],
      "services" => [
        { name: "Prumo", colors: %w[#16324f #3d84c6 #f4f7fa] },
        { name: "Grafite", colors: %w[#232323 #f0a500 #f7f6f3] },
        { name: "Cobalto", colors: %w[#101a3d #4f6df5 #f3f4fb] }
      ],
      "health" => [
        { name: "Consultório", colors: %w[#12403c #4fb3a4 #f2f8f6] },
        { name: "Sereno", colors: %w[#1d3355 #7aa7d9 #f4f7fb] },
        { name: "Folha", colors: %w[#26402a #8bbf5a #f5f8f1] }
      ],
      "education" => [
        { name: "Quadro", colors: %w[#1c2a3a #f2a541 #f7f5f0] },
        { name: "Caderno", colors: %w[#232c5c #5b6ee1 #f5f5fb] },
        { name: "Giz", colors: %w[#213b34 #d96c4f #f7f4ee] }
      ],
      "creator" => [
        { name: "Ameixa", colors: %w[#2b1d3a #7c3aed #f4ecff] },
        { name: "Coral", colors: %w[#231a2e #ff6b6b #fdf2f2] },
        { name: "Elétrico", colors: %w[#101215 #00d1b2 #f2f6f5] }
      ]
    }.freeze

    DEFAULT_PALETTES = [
      { name: "Tinta", colors: %w[#1c1a24 #7c3aed #f6f3ee] },
      { name: "Terra", colors: %w[#2e2013 #c98a3f #f8f3ea] },
      { name: "Maré", colors: %w[#12283f #3a8fb7 #f1f5f8] }
    ].freeze

    # Pares que funcionam: um display com personalidade e uma utilitária que
    # some. Nunca duas fontes que brigam.
    FONT_PAIRS = {
      "restaurant" => [
        { display: "Fraunces", utility: "Inter" },
        { display: "Playfair Display", utility: "Work Sans" },
        { display: "Bebas Neue", utility: "DM Sans" }
      ],
      "shop" => [
        { display: "Bricolage Grotesque", utility: "Inter" },
        { display: "Archivo", utility: "DM Sans" },
        { display: "Instrument Serif", utility: "Figtree" }
      ],
      "services" => [
        { display: "Space Grotesk", utility: "Inter" },
        { display: "Archivo", utility: "Work Sans" },
        { display: "Newsreader", utility: "Geist" }
      ],
      "health" => [
        { display: "Lora", utility: "Inter" },
        { display: "Figtree", utility: "Geist" },
        { display: "EB Garamond", utility: "DM Sans" }
      ],
      "education" => [
        { display: "Lexend", utility: "Inter" },
        { display: "Merriweather", utility: "Work Sans" },
        { display: "Sora", utility: "DM Sans" }
      ],
      "creator" => [
        { display: "Bricolage Grotesque", utility: "Geist" },
        { display: "Syne", utility: "Inter" },
        { display: "Unbounded", utility: "DM Sans" }
      ]
    }.freeze

    DEFAULT_PAIRS = [
      { display: "Bricolage Grotesque", utility: "Geist" },
      { display: "Fraunces", utility: "Inter" },
      { display: "Space Grotesk", utility: "DM Sans" }
    ].freeze

    module_function

    def palettes(segment)
      PALETTES.fetch(segment.to_s, DEFAULT_PALETTES).map { |option|
        option.merge(why: nil).transform_keys(&:to_s)
      }
    end

    def fonts(segment)
      FONT_PAIRS.fetch(segment.to_s, DEFAULT_PAIRS).map { |pair|
        { "display" => pair[:display], "utility" => pair[:utility], "why" => nil }
      }
    end

    # A voz de reserva sai dos tons que a pessoa já marcou — é a frase que ela
    # escreveria se soubesse a fórmula, não uma invenção sobre o negócio dela.
    def voices(tones)
      chosen = Array(tones).presence || [ "direct", "warm" ]
      templates = [
        "Fala de um jeito %<tones>s, sem enrolação e sem prometer o que não pode cumprir.",
        "Explica como quem entende do assunto e tem pressa de ajudar: %<tones>s.",
        "Conversa de um jeito %<tones>s, uma ideia por frase e com o dado na mão."
      ]
      words = chosen.first(3).map { |tone| I18n.t("brand_core.tones.#{tone}", locale: :"pt-BR", default: tone) }
      templates.map { |template|
        { "essence" => format(template, tones: join(words)), "tones" => chosen, "bannedWords" => [], "why" => nil }
      }
    end

    # "a, b e c" à mão: o projeto não carrega o rails-i18n, e `to_sentence`
    # sem ele emenda com "and" mesmo pedindo o locale pt-BR.
    def join(words)
      return words.first.to_s if words.length <= 1

      "#{words[0..-2].join(', ')} e #{words.last}"
    end
  end
end
