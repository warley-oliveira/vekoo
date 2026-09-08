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

  # --- a marca -----------------------------------------------------------------
  # Recurso singular: um Brandcore por organização. O rascunho salva seção a
  # seção (PATCH); só `publish` exige o mínimo obrigatório.
  get    "brand-core"            => "brand_cores#show"
  patch  "brand-core"            => "brand_cores#update"
  post   "brand-core/publish"    => "brand_cores#publish"
  get    "brand-core/versions"   => "brand_core_versions#index"
  post   "brand-core/assets"     => "brand_assets#create"
  delete "brand-core/assets/:id" => "brand_assets#destroy"

  # WebSocket dos avisos ao vivo (`BrandCoreChannel`). Autentica por `?token=`.
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
