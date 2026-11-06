# Rotas do domínio "products" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".
#
# O catálogo mora em /products porque GET /catalog já é o acervo da ferramenta de
# carrosséis.
scope path: "products", module: :products, as: :products do
  get "search" => "items#search"

  resources :items, only: %i[index show create update destroy] do
    post "bulk-destroy", action: :bulk_destroy, on: :collection
    resources :images, only: :create
  end
  resources :images, only: %i[update destroy]

  resources :categories, only: %i[index create update destroy]
  resources :field_definitions, path: "field-definitions", only: %i[index create update destroy]

  # create = upload do arquivo cru (fase A); start = dispara o job (fase B).
  resources :imports, only: %i[index show create destroy] do
    post :start, on: :member
  end
end
