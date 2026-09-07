module Ai
  # A escolha de imagem do modelo, trazida para o que o documento aceita.
  #
  # Vale o mesmo princípio do `CardBuilder`: o modelo sugere, este código
  # decide. Sugestão fora do vocabulário vira o padrão em vez de virar um
  # `ImageSource` que o editor não sabe desenhar.
  module ImageChoice
    STYLES = CardBuilder::ART_STYLES
    TINTS = %w[accent ink bg].freeze
    FALLBACK = { "kind" => "art", "style" => "blob", "seed" => 7, "tint" => "accent" }.freeze

    module_function

    def from(raw, library_ids:)
      parsed = extract(raw)
      return FALLBACK unless parsed.is_a?(Hash)

      case parsed["kind"]
      when "library"
        id = parsed["id"].to_s
        library_ids.include?(id) ? { "kind" => "library", "id" => id } : FALLBACK
      else
        {
          "kind" => "art",
          "style" => STYLES.include?(parsed["style"]) ? parsed["style"] : FALLBACK["style"],
          # A semente é nossa: o modelo não tem opinião útil sobre geometria, e
          # um número estável mantém a arte igual entre recargas.
          "seed" => rand(1_000),
          "tint" => TINTS.include?(parsed["tint"]) ? parsed["tint"] : "accent"
        }
      end
    end

    # O modelo às vezes embrulha o JSON em texto; pegamos o primeiro objeto.
    def extract(raw)
      slice = raw.to_s[/\{.*\}/m]
      slice && JSON.parse(slice)
    rescue JSON::ParserError
      nil
    end
  end
end
