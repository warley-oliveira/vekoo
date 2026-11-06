module Contacts
  # Uma célula de CSV segura. O nome do contato vem de fora (é o que ele escreveu no WhatsApp), e
  # o Excel executa o que começa com `=`, `+`, `-` ou `@`: um contato chamado `=HYPERLINK(...)`
  # viraria fórmula na máquina de quem exporta. O apóstrofo faz a planilha ler como texto.
  module CsvCell
    FORMULA_START = /\A[=+\-@\t\r]/

    module_function

    def safe(value)
      return value unless value.is_a?(String)
      # O traço de nome em branco é só um traço.
      return value if value.length < 2 || !value.match?(FORMULA_START)

      "'#{value}"
    end
  end
end
