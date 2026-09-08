module Engines
  # A geração não pôde acontecer, e a razão é explicável para a pessoa:
  # `code` é o contrato de máquina; `details` carrega o campo ou o fato.
  class GenerationError < StandardError
    attr_reader :code, :details

    def initialize(code, message = nil, **details)
      @code = code
      @details = details
      super(message || code)
    end

    def as_json(*)
      { "code" => code, "message" => message }.merge(details.transform_keys(&:to_s))
    end
  end
end
