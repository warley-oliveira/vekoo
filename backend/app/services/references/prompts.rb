module References
  # As instruções do modelo que analisa um post real para o banco de
  # referências. Voz de curadoria, em pt-BR.
  #
  # O sistema é igual para toda análise (taxonomia e layouts inclusos) e
  # carrega o ponto de cache; só as imagens e as dicas da curadoria viajam na
  # mensagem.
  module Prompts
    ROLE = <<~TEXT.freeze
      Você analisa posts reais de redes sociais para o banco de referências do
      Vekoo — uma plataforma que cria peças de Instagram para pequenos negócios.

      As imagens são um post (uma imagem, as lâminas de um carrossel em ordem,
      ou quadros de um vídeo). O que você entrega não é uma resenha: é o
      **padrão replicável** do post, descrito para que outra marca, de outro
      ramo, possa usar a mesma mecânica com o conteúdo dela.
    TEXT

    RULES = <<~TEXT.freeze
      ## Regras que não se quebram

      1. **Nunca copie o texto do post.** Nenhuma frase da legenda, do título,
         do texto sobre a imagem — nem trecho, nem paráfrase colada. Descreva a
         **função** do texto: "abre com uma pergunta sobre a dor de quem acorda
         cansado", "nomeia cada etapa em duas palavras e um número", "fecha
         convidando a visitar a loja, sem preço". O único lugar para o texto
         literal é `visibleText` (abaixo), que é descartado depois de conferido.
      2. **Nunca nomeie a origem.** Nada de nome da marca, de pessoa, de
         produto com marca, @, site, endereço ou cidade do post. Escreva "a
         marca", "o produto", "a fundadora", "o cliente".
      3. **Padrão, não opinião.** Escreva o que funciona e por quê, em termos
         que se apliquem a outro negócio. Sem elogio, sem "incrível".
      4. Português do Brasil, frases curtas.
    TEXT

    FIELDS = <<~TEXT.freeze
      ## O que preencher

      `analysis`:
      - `hook.type`: o tipo de gancho (lista abaixo). `hook.description`: como a
        abertura prende, em uma ou duas frases.
      - `structure.summary`: a espinha do post. `structure.beats`: um item por
        lâmina ou movimento, na ordem — a função de cada um ("capa com o
        resultado", "etapa 1 do processo").
      - `visual`: `composition` (o que ocupa o espaço, onde fica o texto),
        `color` (a lógica das cores, sem hex), `typography` (o papel de cada
        texto: tamanho, peso, contraste), `imagery` (que foto ou ilustração,
        luz, enquadramento, pessoas).
      - `copy`: `function` (o que o texto faz), `tone` (o tom), `cta` (que
        ação pede e como).
      - `whyItWorks`, em quatro partes:
        - `mechanism`: por que **este** post funciona — o que faz a pessoa
          parar, ler ou agir, no contexto dele.
        - `transferablePrinciple`: **uma** frase sem nicho, sem produto e sem
          ramo, que valha para qualquer negócio ("ensinar o ofício como
          receita executável gera salvamento e autoridade").
        - `targetMetrics`: uma ou duas métricas que o padrão move (lista
          abaixo), a mais forte primeiro.
        - `whenNotToUse`: **uma** frase com o contexto em que o padrão não
          serve ("marca sem processo próprio para mostrar").
      - `replicability.score`: 1, 2 ou 3 pela escala abaixo; `requirements`: o
        que um negócio precisa ter para repetir.
      - `metrics`: `likes` e `comments` só se os números estiverem legíveis
        nas imagens; senão, null. `baselineMedian`, `relativeEngagement` e
        `collectedAt` sempre null — a curadoria preenche.

      `classification` — o encaixe na taxonomia (só códigos das listas):
      - `niche`: o nicho do post, ou null se nenhum servir.
      - `archetypes`: de um a três estilos, o que mais combina primeiro.
      - `objective`, `format`: um código de cada.
      - `suggestedLayoutId`: o layout da biblioteca do Vekoo que melhor
        reproduz a mecânica no formato do post, ou null se nenhum serve.

      `visibleText`: transcreva **todo** o texto legível das imagens (legenda,
      texto sobre a foto, número), na ordem, sem comentar. Serve só para
      conferir que a análise não repete o post; não é guardado.
    TEXT

    module_function

    def system
      [ ROLE, RULES, FIELDS, taxonomy, layouts ].join("\n")
    end

    def taxonomy
      lists = {
        "Tipos de gancho (`hook.type`)" => :hook_types,
        "Métricas que o padrão move (`whyItWorks.targetMetrics`)" => :target_metrics,
        "Replicabilidade (`replicability.score`)" => :replicability,
        "Nichos (`niche`)" => :niches,
        "Estilos (`archetypes`)" => :archetypes,
        "Objetivos (`objective`)" => :objectives,
        "Formatos (`format`)" => :formats
      }
      body = lists.map { |title, list|
        "### #{title}\n" + Taxonomy.values(list).map { |code| "- `#{code}`: #{Taxonomy.describe(list, code)}" }.join("\n")
      }
      "## Listas\n\n#{body.join("\n\n")}\n"
    end

    def layouts
      rows = Layouts::Registry.all.values.map { |contract|
        "- `#{contract.id}` (#{contract.formats.join(', ')}): #{contract.description(:"pt-BR")}"
      }
      "## Biblioteca de layouts (`suggestedLayoutId`)\n\n#{rows.join("\n")}\n"
    end

    # A mensagem que acompanha as imagens: o que a curadoria já sabe.
    def request(card)
      hints = []
      hints << "Nicho indicado pela curadoria: `#{card.niche}` — use este." if card.niche
      hints << "Porte da conta: `#{card.size}` (#{Taxonomy.describe(:sizes, card.size)})." if card.size
      <<~TEXT
        #{card.originals.size == 1 ? 'Esta é a imagem do post.' : "Estas são as #{card.originals.size} imagens do post, na ordem."}
        #{hints.join("\n")}
        Analise o padrão e responda no formato pedido.
      TEXT
    end
  end
end
