module Products
  # Base do catálogo: a mesma permissão para tudo, e a organização sempre da sessão.
  class BaseController < PlatformController
    require_permission :catalog

    # Duas requisições passam juntas pela validação de unicidade (mesmo SKU, mesma
    # categoria). Quem chega depois ouve um 422, não um 500.
    rescue_from ActiveRecord::RecordNotUnique do
      render_error(status: :unprocessable_entity, code: "conflict", message: t("products.conflict"))
    end

    private

    # O envelope precisa ser um objeto. `{ "item": "x" }` é o mesmo que não ter mandado, e
    # não um 500 no `permit`.
    def envelope(key)
      value = params.require(key)
      raise ActionController::ParameterMissing.new(key) unless value.respond_to?(:permit)

      value
    end
  end
end
