module Agent
  # O catálogo de motores como o agente o lê.
  #
  # É o mesmo manifesto que desenha o formulário do modo avançado — não existe
  # uma segunda descrição dos motores para a IA. Motor novo = diretório novo,
  # e o agente passa a saber dele sem que ninguém escreva prompt.
  #
  # Bloco **estável**: é ele que carrega um dos pontos de cache. Por isso sai
  # ordenado e sem nada que mude entre requisições.
  module Catalog
    module_function

    def text
      @text ||= JSON.pretty_generate(engines)
    end

    def reset!
      @text = nil
    end

    def engines
      Engines::Registry.all.values.map { |entry| describe(entry.manifest) }
    end

    # Sempre em pt-BR: o conteúdo gerado é obra do usuário e nasce em pt-BR,
    # independentemente do idioma da interface de quem pediu.
    def describe(manifest)
      json = manifest.as_json(locale: :"pt-BR")
      {
        "id" => json["id"],
        "nome" => json["name"],
        "quandoUsar" => json["description"],
        "formatos" => json["formats"],
        "serie" => json["series"],
        "campos" => json["fields"].map { |field| describe_field(field) }
      }
    end

    def describe_field(field)
      {
        "id" => field["id"],
        "tipo" => field["type"],
        "obrigatorio" => field["required"] == true,
        "rotulo" => field["label"],
        "dica" => field["hint"],
        "limites" => field["constraints"].presence,
        # Opções fixas viajam com rótulo (ajuda a escolher); as derivadas da
        # marca só dizem de onde vêm — os ids estão na ficha da marca.
        "opcoes" => field["options"]&.map { |option| { "id" => option["id"], "rotulo" => option["label"] } },
        "opcoesDaMarca" => field["source"],
        "tiposDeAtivo" => field["kinds"],
        "padrao" => field["default"]
      }.compact
    end
  end
end
