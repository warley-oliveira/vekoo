module Ai
  # O primeiro objeto JSON de topo dentro de uma resposta do modelo.
  #
  # Modelos gostam de embrulhar JSON em cerca de markdown ou de comentar
  # antes. O que importa é o primeiro objeto que fecha — o resto é ruído e é
  # descartado sem drama. Contar chaves basta porque o `JSON.parse` de verdade
  # só roda sobre o pedaço já fechado.
  #
  # Era copiado em cada leitor de resposta (`Agent::Plan`, o "cria pra mim");
  # o onboarding por conversa seria o terceiro.
  module JsonObject
    module_function

    def extract(raw)
      raw = raw.to_s
      start = raw.index("{")
      return nil unless start

      depth = 0
      in_string = false
      escaped = false

      raw[start..].each_char.with_index do |char, index|
        if in_string
          if escaped then escaped = false
          elsif char == "\\" then escaped = true
          elsif char == '"' then in_string = false
          end
          next
        end

        case char
        when '"' then in_string = true
        when "{" then depth += 1
        when "}"
          depth -= 1
          return parse(raw[start, index + 1]) if depth.zero?
        end
      end

      nil
    end

    def parse(slice)
      value = JSON.parse(slice)
      value.is_a?(Hash) ? value : nil
    rescue JSON::ParserError
      nil
    end
  end
end
