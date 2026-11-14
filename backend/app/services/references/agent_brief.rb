module References
  # Os cards que a busca escolheu, como o agente de criação os lê: o padrão em
  # texto, com apelido (R1, R2, R3) no lugar do id — o modelo copia apelido
  # curto sem errar; UUID ele estropia.
  #
  # Só o que serve para compor: gancho, estrutura, copy, visual (sem cor — a
  # cor é da marca), por que funciona, quando não usar, o que o post exige e o
  # layout da biblioteca que reproduz a mecânica. **Nunca** a fonte, o @, as
  # métricas, o nicho ou o porte: o agente não precisa saber de onde veio, e o
  # prompt da geração não pode carregar a marca de outra pessoa.
  #
  # Vai na mensagem do pedido, nunca no sistema: muda a cada pedido e
  # derrubaria o cache da ficha da marca.
  class AgentBrief
    attr_reader :aliases

    def initialize(cards)
      @cards = Array(cards)
      @aliases = @cards.each_with_index.to_h { |card, index| [ "R#{index + 1}", card.id ] }
    end

    def empty? = @cards.empty?

    def text
      return "" if empty?

      blocks = @cards.each_with_index.map { |card, index| card_text("R#{index + 1}", card) }
      <<~TEXT
        # Padrões de referência

        Posts reais que funcionaram, descritos pela mecânica — sem a marca de
        origem e sem o texto deles. Use como forma, com o conteúdo desta marca.

        #{blocks.join("\n")}
      TEXT
    end

    private

    def card_text(name, card)
      analysis = card.analysis
      hook = analysis["hook"]
      structure = analysis["structure"]
      visual = analysis["visual"]
      copy = analysis["copy"]
      why = analysis["whyItWorks"]
      beats = Array(structure["beats"]).each_with_index.map { |beat, index| "#{index + 1}. #{beat}" }.join(" ")
      lines = [
        "## #{name}",
        "- Gancho (#{Taxonomy.describe(:hook_types, hook['type']) || hook['type']}): #{hook['description']}",
        "- Estrutura: #{structure['summary']}#{beats.present? ? " Lâminas: #{beats}" : ''}",
        "- Visual: #{[ visual['composition'], visual['typography'], visual['imagery'] ].compact_blank.join(' ')}",
        "- Copy: #{copy['function']} Tom: #{copy['tone']} Chamada: #{copy['cta']}",
        "- Por que funciona: #{why['mechanism']} Princípio: #{why['transferablePrinciple']}",
        "- Não use quando: #{why['whenNotToUse']}",
        "- O post exige: #{requires(card)}"
      ]
      lines << "- Layout que reproduz a mecânica: `#{card.suggested_layout_id}`" if card.suggested_layout_id.present?
      lines.join("\n") + "\n"
    end

    def requires(card)
      return "nada além de texto e de uma imagem genérica" if card.requires.empty?

      card.requires.map { |code| Taxonomy.describe(:requires, code).to_s.split(" — ").first }.join("; ")
    end
  end
end
