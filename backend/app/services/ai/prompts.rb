module Ai
  # As instruções do produto para o modelo.
  #
  # Ficam separadas por dois motivos. Primeiro, é o bloco **estável** de cada
  # chamada: é ele que carrega o `cache_control`, e prefixo que muda a cada
  # requisição não é cacheado. Segundo, isto é voz de produto — quem ajusta o
  # tom mexe aqui, não no meio do controlador.
  #
  # O texto gerado é **obra do usuário** e nasce em pt-BR, como o resto do
  # conteúdo. Isso não conflita com a API responder em inglês: o que se traduz é
  # a interface, não o carrossel.
  module Prompts
    VOICE = <<~TEXT.freeze
      Você escreve conteúdo para carrosséis de Instagram em português do Brasil.

      Quem usa a ferramenta não é designer nem publicitário: é social media,
      lojista, nutricionista, professor. Escreva como quem explica para uma
      pessoa ocupada, no celular, entre uma coisa e outra.

      Regras de voz:
      - Frases curtas. Uma ideia por frase.
      - Sem jargão de marketing ("alavancar", "potencializar", "solução
        completa") e sem promessa que você não pode cumprir.
      - Sem emoji, a menos que o texto original já use.
      - Nada de "neste carrossel vamos ver": vá direto ao assunto.
      - Português do Brasil, sempre — mesmo que o pedido chegue em outra língua.
      - Use **negrito** com parcimônia, só no que a pessoa precisa levar embora.
    TEXT

    REWRITE_INTENTS = {
      "shorten" => "Reescreva mais curto, mantendo o sentido. Corte o que não é essencial.",
      "expand" => "Desenvolva um pouco mais, acrescentando concretude — um exemplo, um número, um detalhe prático. Sem encher linguiça.",
      "casual" => "Reescreva em tom de conversa, como quem fala com um conhecido. Sem gíria forçada.",
      "expert" => "Reescreva com autoridade e precisão, como quem domina o assunto. Sem parecer artigo acadêmico.",
      "fix" => "Corrija ortografia, gramática e pontuação. Mexa no mínimo: preserve as palavras e o tom de quem escreveu."
    }.freeze

    # O modelo escreve um roteiro, não o documento. Descrever o formato aqui, no
    # bloco cacheado, é o que mantém a saída previsível sem custar tokens a cada
    # requisição.
    CAROUSEL_FORMAT = <<~TEXT.freeze
      Responda com um **array JSON** e nada mais: sem cerca de markdown, sem
      explicação antes ou depois.

      Cada item é um card. O primeiro é a capa e aceita:
        { "kicker": "CHAPÉU CURTO EM CAIXA ALTA",
          "title": "O título do carrossel",
          "footer": "@perfil ou nome do negócio" }

      Os demais são cards de conteúdo e aceitam, todos opcionais:
        { "title": "Título curto do card",
          "body": "Um parágrafo. Pode ter **negrito**.",
          "bullets": ["item", "item"],
          "steps": ["passo", "passo"],
          "stat": { "value": "3x", "label": "o que esse número significa" },
          "quote": "uma frase que vale ser destacada",
          "button": "Chamada curta para ação" }

      Use dois ou três campos por card, no máximo. Card cheio não se lê no
      celular. Varie: nem todo card precisa de lista.

      O último card fecha — convida a salvar, comentar ou seguir.
    TEXT

    module_function

    def carousel(subject, card_count)
      <<~TEXT
        Escreva um carrossel de #{card_count} cards sobre o assunto abaixo.

        #{CAROUSEL_FORMAT}

        Assunto: #{subject}
      TEXT
    end

    def rewrite(text, intent)
      instruction = REWRITE_INTENTS.fetch(intent, REWRITE_INTENTS["fix"])

      <<~TEXT
        #{instruction}

        Responda **somente** com o texto reescrito, sem aspas, sem explicação e
        sem comentário sobre o que você mudou.

        Texto:
        #{text}
      TEXT
    end

    # A API da Anthropic **não gera imagens**. O que o modelo faz aqui é
    # *escolher* a arte que combina com o card, entre o que a ferramenta já
    # sabe desenhar. Gerar foto de verdade é integração de terceiro.
    def card_image(hint, library_ids)
      <<~TEXT
        Escolha a imagem de fundo que combina com o texto deste card.

        Responda com **um JSON e nada mais**, numa destas duas formas:

          {"kind":"art","style":"<estilo>","tint":"<tinta>"}
          {"kind":"library","id":"<id>"}

        Estilos possíveis: arc, waves, dots, grid, beams, blob.
        Tintas possíveis: accent, ink, bg.
        Ids da biblioteca: #{library_ids.join(", ")}.

        Prefira `art` quando o card for direto e o fundo tiver que ficar
        discreto; prefira `library` quando o assunto pedir cor e clima.

        Texto do card: #{hint}
      TEXT
    end

    def caption(title, card_text)
      <<~TEXT
        Escreva a legenda do post para este carrossel.

        A legenda acompanha as imagens no Instagram: ela dá o contexto, convida
        a arrastar e fecha com uma pergunta ou um convite. Três a cinco linhas,
        depois uma linha em branco e de três a cinco hashtags relevantes em
        minúsculas.

        Responda somente com a legenda.

        Título: #{title}
        Conteúdo do primeiro card: #{card_text}
      TEXT
    end
  end
end
