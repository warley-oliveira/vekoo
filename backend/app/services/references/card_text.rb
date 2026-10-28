module References
  # O card como texto corrido, em pt-BR: o que o embedding lê. Só o padrão —
  # taxonomia (pelo que cada código quer dizer) e análise; a fonte nunca entra.
  #
  # O princípio transferível entra (é a ponte entre ramos: um pedido de
  # pet shop acha o padrão que funcionou numa padaria). O "quando não usar"
  # fica de fora de propósito: ele vai na ficha do agente, que decide com ele
  # — no vetor, aproximaria o card justamente dos pedidos em que ele não serve.
  module CardText
    module_function

    def call(card)
      analysis = card.analysis
      lines = []
      lines << labeled("Nicho", Taxonomy.describe(:niches, card.niche)) if card.niche
      lines << labeled("Formato", Taxonomy.describe(:formats, card.format)) if card.format
      lines << labeled("Objetivo", Taxonomy.describe(:objectives, card.objective)) if card.objective
      if card.archetypes.any?
        lines << labeled("Estilo", card.archetypes.map { |code| Taxonomy.describe(:archetypes, code) }.join("; "))
      end
      hook = analysis["hook"]
      lines << labeled("Gancho", [ Taxonomy.describe(:hook_types, hook["type"]), hook["description"] ].compact_blank.join(" — "))
      structure = analysis["structure"]
      lines << labeled("Estrutura", [ structure["summary"], structure["beats"].join("; ") ].compact_blank.join(" "))
      lines << labeled("Visual", analysis["visual"].values.compact_blank.join(" "))
      copy = analysis["copy"]
      lines << labeled("Copy", [ copy["function"], copy["tone"], copy["cta"] ].compact_blank.join(" "))
      why = analysis["whyItWorks"]
      lines << labeled("Princípio", why["transferablePrinciple"])
      lines << labeled("Por que funciona", why["mechanism"])
      lines.compact.join("\n")
    end

    def labeled(label, text)
      "#{label}: #{text}" if text.present?
    end
  end
end
