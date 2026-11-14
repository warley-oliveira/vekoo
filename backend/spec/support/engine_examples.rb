# Valores de exemplo por motor. Motor novo sem entrada aqui ganha valores
# mínimos derivados do manifesto — os exemplos gerais continuam rodando para
# ele.
module EngineExamples
  VALUES = {
    "statement" => { "phrase" => "Pão de verdade\nleva tempo.", "label" => "a partir de", "price" => "R$ 18" },
    "preco_heroi" => { "label" => "Pão de fermentação natural", "price" => "R$ 18", "subline" => "Todo dia, a partir das 7h" },
    "foto_copy" => { "copy" => "Assado hoje,\nantes de você acordar.", "price" => "R$ 18" },
    "promo_box" => { "title" => "Sábado é dia de fornada dupla", "support" => "Chegue cedo: o segundo lote sai às 11h e costuma acabar antes do meio-dia.", "tag" => "só este sábado", "description" => "Dois pães de fermentação natural", "price" => "R$ 18" },
    "tabela" => { "title" => "Guia da semana", "rows" => [ "Pão rústico | fermentação natural | R$ 18", "Baguete | massa de 24h | R$ 12", "Focaccia | alecrim e sal grosso | R$ 22" ] },
    "programa_evento" => { "title" => "Oficina de fermentação", "schedule" => [ "9h | Boas-vindas e café", "9h30 | Levain do zero", "11h | Modelagem", "12h | Fornada e prova" ], "partner" => "Apoio: Moinho da Serra" },
    "contagem" => { "mode" => "number", "number" => 3, "subline" => "dias para a oficina", "series" => "sequence" },
    "destaque_item" => { "name" => "Pão rústico", "composition" => "Farinha branca, integral e centeio, fermentação de 36 horas, casca grossa.", "price" => "R$ 18", "note" => "sai do forno às 7h" }
  }.freeze

  # Quantas imagens o exemplo produz (só a série difere de 1).
  FRAMES = { "contagem" => 3 }.freeze

  module_function

  def values(engine_id)
    VALUES.fetch(engine_id) { minimal_values(engine_id) }
  end

  def frames(engine_id)
    FRAMES.fetch(engine_id, 1)
  end

  def minimal_values(engine_id)
    manifest = Engines::Registry.fetch(engine_id).manifest
    manifest.fields.select(&:required).each_with_object({}) do |field, acc|
      acc[field.id] = case field.type
      when "text" then "Exemplo"
      when "textList" then [ "Um | dois | três" ]
      when "number" then field.constraints["min"] || 1
      when "choice" then field.derived? ? nil : field.options.first["id"]
      end
    end.compact
  end
end
