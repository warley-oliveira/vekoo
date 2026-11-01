module References
  # O texto de uma referência como as guardas o leem: sem acento, minúsculo,
  # espaço normalizado — "Imobiliária" e "imobiliaria" são a mesma palavra.
  module Text
    module_function

    def fold(text)
      text.to_s.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase.squish
    end

    # Cada texto da análise com o caminho dele (`hook.description`,
    # `structure.beats.2`) — é por caminho que a curadoria vê o achado.
    def leaves(value, path = nil, &block)
      return enum_for(:leaves, value, path) unless block

      case value
      when Hash then value.each { |key, item| leaves(item, [ path, key ].compact.join("."), &block) }
      when Array then value.each_with_index { |item, index| leaves(item, [ path, index ].compact.join("."), &block) }
      when String then yield path, value if value.present?
      end
    end
  end
end
