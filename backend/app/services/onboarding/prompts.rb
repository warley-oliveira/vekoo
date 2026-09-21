module Onboarding
  # As instruções do onboarding para o modelo.
  #
  # Três tarefas curtas e fechadas — paleta, par de fontes, voz —, cada uma
  # devolvendo **três opções**. Três é regra de produto, não detalhe: quem não
  # sabe responder também não sabe avaliar uma proposta sozinha; comparar é
  # mais fácil do que julgar.
  #
  # O bloco de papel é o mesmo nas três chamadas e carrega o ponto de cache.
  module Prompts
    ROLE = <<~TEXT.freeze
      Você ajuda alguém a montar a identidade da própria marca no Vekoo.

      Quem está do outro lado não é designer: é dono de padaria, nutricionista,
      professora, lojista. Ela clicou em "não sei, cria pra mim" porque a
      pergunta é sobre uma decisão que nunca precisou tomar.

      Proponha **três** opções diferentes de verdade entre si — não três
      variações da mesma ideia. Cada uma com uma justificativa de **uma linha**,
      em português do Brasil, escrita para ela e não para um designer: diga o
      que a opção transmite, nunca o jargão que a produz. "Mais quente, puxa
      para o apetite" serve; "paleta análoga de temperatura alta" não.

      Responda com **um objeto JSON e nada mais**: sem cerca de markdown, sem
      texto antes ou depois.
    TEXT

    module_function

    def system
      ROLE
    end

    def context(brief)
      lines = [ "Negócio: #{brief[:name]}" ]
      lines << "O que faz: #{brief[:what]}" if brief[:what].present?
      lines << "Segmento: #{brief[:segment]}" if brief[:segment].present?
      lines << "Cidade: #{brief[:city]}" if brief[:city].present?
      lines << "Tons que ela marcou: #{brief[:tones].join(', ')}" if brief[:tones].present?
      lines << "Cores que já aparecem na logo dela: #{brief[:logo_colors].join(', ')}" if brief[:logo_colors].present?
      lines.join("\n")
    end

    def palette(brief)
      <<~TEXT
        #{context(brief)}

        Proponha três paletas para esta marca. Cada paleta tem de duas a três
        cores: uma escura (que vai virar fundo), uma cor de marca com
        personalidade e, se fizer sentido, uma clara. A plataforma deriva
        sozinha o resto dos papéis e garante o contraste — você escolhe as
        cores, não os papéis.

        #{brief[:logo_colors].present? ? "Ela já tem logo: pelo menos uma das paletas deve partir das cores dela.\n" : ''}
        Formato:
        {"options":[{"name":"Nome curto da paleta","colors":["#112233","#aabbcc"],"why":"uma linha"}]}
      TEXT
    end

    def fonts(brief, catalog)
      <<~TEXT
        #{context(brief)}

        Proponha três pares de fontes para esta marca: uma **display** (títulos
        e números, é ela que dá o caráter) e uma **utilitária** (texto corrido,
        tem que sumir e deixar ler). Nunca as duas iguais.

        Escolha **só** destas famílias:
        #{catalog.map { |category, families| "#{category}: #{families.join(', ')}" }.join("\n")}

        Formato:
        {"options":[{"display":"Familia","utility":"Familia","why":"uma linha"}]}
      TEXT
    end

    def voice(brief, tones, quality_rules)
      <<~TEXT
        #{context(brief)}

        Escreva três versões da **essência de voz** desta marca: uma frase só,
        até 160 caracteres, na terceira pessoa, dizendo como ela fala com o
        cliente. Nada de adjetivo vazio ("moderna e inovadora"): diga o que a
        marca faz quando abre a boca.

        Para cada versão, marque de um a três tons desta lista e sugira até
        cinco **palavras banidas** — os clichês que esse segmento repete e que
        esta marca não deveria usar (ex.: "imperdível", "solução completa").

        Tons possíveis: #{tones.join(', ')}.

        Formato:
        {"options":[{"essence":"uma frase","tones":["direct"],"bannedWords":["clichê"],"why":"uma linha"}]}
      TEXT
    end
  end
end
