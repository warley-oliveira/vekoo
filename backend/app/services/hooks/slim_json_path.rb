module Hooks
  # Achata o que chegou em `caminho.do.campo => valor`, que é como os textos das ações pedem cada dado:
  # `{{body.cliente.telefones.0}}`. As chaves vêm de fora e passam intactas.
  class SlimJsonPath
    def self.fetch_all_slim(hash, parent_key = "", result = {})
      hash&.each do |key, value|
        new_key = parent_key.empty? ? key.to_s : "#{parent_key}.#{key}"

        if value.is_a?(Hash)
          fetch_all_slim(value, new_key, result)
        elsif value.is_a?(Array)
          value.each_with_index do |item, index|
            if item.is_a?(Hash) || item.is_a?(Array)
              fetch_all_slim({ index => item }, new_key, result)
            else
              result["#{new_key}.#{index}"] = item
            end
          end
        else
          result[new_key] = value
        end
      end
      result
    end
  end
end
