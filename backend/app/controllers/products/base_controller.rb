module Products
  # Base do catálogo: a mesma permissão para tudo, e a organização sempre da sessão.
  class BaseController < PlatformController
    # O envelope (`{ item: {...} }`, `{ fieldDefinition: {...} }`) é o contrato. O wrapper
    # do Rails ainda atrapalharia: ele injeta `field_definition: {}`, e esse vazio
    # sobrescreve o `fieldDefinition` de verdade quando CamelParams converte as chaves.
    wrap_parameters false

    require_permission :catalog

    # Duas requisições passam juntas pela validação de unicidade (mesmo SKU, mesma
    # categoria). Quem chega depois ouve um 422, não um 500.
    rescue_from ActiveRecord::RecordNotUnique do
      render_error(status: :unprocessable_entity, code: "conflict", message: t("products.conflict"))
    end
  end
end
