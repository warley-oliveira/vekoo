module Agenda
  # Resultado de um serviço da agenda. `code` é o contrato de máquina, como em `render_error`.
  Result = Struct.new(:success, :data, :code, :message, keyword_init: true) do
    def success? = success

    def self.ok(data = {})
      new(success: true, data: data)
    end

    def self.failure(code, scope:, **interpolation)
      new(success: false, code: code.to_s.camelize(:lower), message: I18n.t("#{scope}.#{code}", **interpolation))
    end
  end
end
