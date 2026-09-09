Rails.application.routes.draw do
  # Toda URL da plataforma é em inglês, kebab-case — igual às rotas do front.

  # --- entrada e conta ------------------------------------------------------
  post   "signup" => "registrations#create"
  post   "login"  => "sessions#create"
  delete "logout" => "sessions#destroy"
  get    "me"     => "sessions#show"

  post  "password-resets"        => "password_resets#create"
  patch "password-resets/:token" => "password_resets#update", as: :password_reset

  # --- trabalho da organização ---------------------------------------------
  resources :folders, only: %i[index create update destroy]

  resources :carousels, only: %i[index show create update destroy] do
    member do
      post   :duplicate
      post   :restore
      delete :permanent, action: :destroy_permanently
    end
  end

  delete "trash" => "trash#destroy"

  # Imagem do editor. Só criar: apagar romperia documentos que a usam, e a
  # galeria "suas imagens" é tela que ainda não existe.
  resources :uploads, only: :create

  resources :notifications, only: :index do
    collection do
      post "read-all", action: :read_all
    end
  end

  get  "credits"         => "credits#show"
  post "credits/consume" => "credits#consume"

  # --- as marcas -------------------------------------------------------------
  # Todo conteúdo nasce dentro de uma marca: o Brandcore, os ativos, o
  # histórico, as peças e a prévia moram sob `/brands/:id`. Carrosséis e
  # pastas mantêm as rotas próprias (o editor os abre por id) e recebem a
  # marca na criação (`brandId`) — sem ela a API recusa.
  resources :brands, only: %i[index show create update] do
    member { post :publish }
    get "versions" => "brand_core_versions#index"
    resources :assets, only: %i[create destroy], controller: :brand_assets
    resources :pieces, only: %i[index show create destroy] do
      member { post :regenerate }
    end
    resources :engines, only: [] do
      member { post :preview }
    end
  end

  # O catálogo de motores (manifestos de `engines/*/`) é igual para todo mundo.
  resources :engines, only: %i[index show]

  # Migração do legado: carrosséis e pastas sem marca. Temporária (ver
  # `OrphanMigration`).
  get  "orphans"        => "orphans#index"
  post "orphans/assign" => "orphans#assign"

  # WebSocket dos avisos ao vivo (`BrandCoreChannel`, `PieceChannel`). Autentica por `?token=`.
  mount ActionCable.server => "/cable"

  # --- geração ---------------------------------------------------------------
  # Fluxo (SSE): o editor insere card a card, então esperar o documento inteiro
  # ficar pronto tiraria o sentido de esperar.
  scope :ai, module: :ai, as: :ai do
    post "carousel" => "generations#carousel"
    post "rewrite" => "generations#rewrite"
    post "caption" => "generations#caption"
    post "card-image" => "generations#card_image"
  end

  # --- acervo da ferramenta -------------------------------------------------
  get "catalog" => "catalog#show"

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
end
