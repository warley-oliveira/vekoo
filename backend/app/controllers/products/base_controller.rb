module Products
  # Base do catálogo: a mesma permissão para tudo, e a organização sempre da sessão.
  class BaseController < PlatformController
    require_permission :catalog

    # Duas requisições passam juntas pela validação de unicidade (mesmo SKU, mesma
    # categoria). Quem chega depois ouve um 422, não um 500.
    rescue_from ActiveRecord::RecordNotUnique do
      render_error(status: :unprocessable_entity, code: "conflict", message: t("products.conflict"))
    end
  end
end
