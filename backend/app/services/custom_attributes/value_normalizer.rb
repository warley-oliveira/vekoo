# frozen_string_literal: true

module CustomAttributes
  # Normaliza um valor livre de campo personalizado para texto numérico canônico
  # ("R$ 50.000,00/mês" → "50000"; "20 a 40/dia" → "20" na estratégia min). Números sempre
  # positivos: o '-' é separador de faixa ("1-2" → [1, 2], nunca [1, -2]).
  module ValueNormalizer
    # Milhar pt-BR ("50.000,00") ou número simples com decimal por vírgula ou ponto.
    NUMBER_PATTERN = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/
    STRATEGIES = %w[min avg max].freeze

    module_function

    # @return [String, nil] o texto canônico ("30"), ou nil quando não há número no valor
    def normalize(raw, strategy: "min")
      numbers = extract_numbers(raw.to_s)
      return nil if numbers.empty?

      value = case strategy
      when "max" then numbers.max
      when "avg" then (numbers.min + numbers.max) / 2.0
      else numbers.min
      end
      canonical(value)
    end

    def extract_numbers(text)
      text.scan(NUMBER_PATTERN).filter_map { |match| parse_locale_number(match) }
    end

    def parse_locale_number(str)
      normalized = if str.match?(/\d\.\d{3}(?:\D|$)/) || (str.include?(".") && str.include?(","))
                     str.delete(".").tr(",", ".")
      else
                     str.tr(",", ".")
      end
      Float(normalized)
    rescue ArgumentError
      nil
    end

    def canonical(value)
      value == value.to_i ? value.to_i.to_s : value.to_s
    end
  end
end
