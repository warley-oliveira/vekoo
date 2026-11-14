module Agent
  # A biblioteca de layouts como o agente a lê.
  #
  # É o mesmo contrato que valida o documento e que o editor usa — não existe
  # uma segunda descrição dos layouts para a IA. Layout novo = arquivo novo
  # em `layouts/`, e o agente passa a saber dele sem que ninguém escreva prompt.
  #
  # Bloco **estável**: é ele que carrega um dos pontos de cache. Por isso sai
  # ordenado e sem nada que mude entre requisições.
  module Catalog
    module_function

    def text
      @text ||= JSON.pretty_generate(layouts)
    end

    def reset!
      @text = nil
    end

    def layouts
      Layouts::Registry.all.values.map { |contract| describe(contract) }
    end

    # Sempre em pt-BR: o conteúdo gerado é obra do usuário e nasce em pt-BR,
    # independentemente do idioma da interface de quem pediu.
    def describe(contract)
      {
        "id" => contract.id,
        "nome" => contract.name(:"pt-BR"),
        "quandoUsar" => contract.description(:"pt-BR"),
        "formatos" => contract.formats,
        "posicaoNoCarrossel" => { "first" => "primeira", "last" => "última" }[contract.position],
        "fundo" => contract.background_options,
        "alinhamentos" => contract.align_options.presence,
        "slots" => contract.slots.values.map { |slot| describe_slot(slot) }
      }.compact
    end

    def describe_slot(slot)
      {
        "id" => slot.id,
        "tipo" => slot.type,
        "obrigatorio" => slot.required?,
        "maxChars" => slot.max_chars,
        "maxLines" => slot.max_lines
      }.compact
    end
  end
end
