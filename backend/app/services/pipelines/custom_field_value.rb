module Pipelines
  # O que quer dizer "não preenchido" em `custom_field_values`. Compartilhado pela trava de mover
  # (`Stage#incomplete_required_field_values_for`) e pela de fechar negócio (`DealCloseGate`), para
  # "vazio" significar a mesma coisa nas duas. O espelho em SQL é `CardQuery#custom_blank_sql`.
  module CustomFieldValue
    module_function

    # `false` e `0` não são vazio: são respostas (caixa desmarcada, número zero).
    def blank_value?(value)
      value.nil? ||
        (value.is_a?(String) && value.strip.empty?) ||
        (value.is_a?(Array) && value.empty?) ||
        (value.is_a?(Hash) && value.empty?)
    end
  end
end
