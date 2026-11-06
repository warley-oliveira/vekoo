module Outreach
  # Um pedido que a regra de negócio recusa. `code` é o contrato de máquina, e a mensagem vem de
  # `errors.<code>` nos locales. A origem usava `ArgumentError`, e qualquer erro de programa com essa
  # classe virava um 422 com o texto interno.
  class RefusedError < StandardError
    attr_reader :code, :field, :details

    def initialize(code, field: nil, details: nil)
      @code = code
      @field = field
      @details = details
      super(code)
    end
  end
end
