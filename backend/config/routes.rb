Rails.application.routes.draw do
  # Toda URL da plataforma é em inglês, kebab-case — igual às rotas do front.

  # --- entrada e conta ------------------------------------------------------
  post   "signup" => "registrations#create"
  post   "login"  => "sessions#create"
  delete "logout" => "sessions#destroy"
  get    "me"     => "sessions#show"
  patch  "me/organization" => "sessions#organization"

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
    post "versions/:id/restore" => "brand_core_versions#restore", as: :restore_version
    resources :assets, only: %i[create destroy], controller: :brand_assets
    # A geração de imagens (Gemini): as fotos viram ativos da marca.
    resources :image_generations, only: %i[index show create], path: "image-generations"
    resources :logos, only: [], controller: :brand_logos do
      collection { post :generate }
      member { get :download }
    end
    resources :pieces, only: %i[index show create destroy] do
      member do
        post :regenerate
        # O documento pronto para desenhar (preview do editor) e o export.
        get "render-payload" => "pieces#render_payload"
        post :render, action: :render_document
        # O editor: salvamento automático, operações e histórico.
        patch "document" => "piece_documents#update"
        post "operations" => "piece_documents#operations"
        get "versions" => "piece_documents#versions"
        post "versions/:version_id/restore" => "piece_documents#restore", as: :restore_version
      end
    end
    resources :engines, only: [] do
      member { post :preview }
    end
    # O onboarding por conversa: a porta de entrada de toda marca nova. A
    # pessoa conta da marca e o agente escreve no mesmo documento do wizard de
    # edição.
    resource :onboarding, only: :show, controller: :onboardings do
      post :start
      post :messages
      post :retry, action: :retry_turn
      post :back
      post :wordmark
      post :finish
    end

    # A conversa de criação: o caminho principal do produto. O catálogo de
    # motores continua existindo em `/engines` — ele virou o modo avançado.
    resources :conversations, only: %i[index show create destroy],
      controller: :agent_conversations do
      member { post :turns }
    end
  end

  # O catálogo de motores (manifestos de `engines/*/`) é igual para todo mundo.
  resources :engines, only: %i[index show]
  # A biblioteca de layouts das peças (contratos): o editor monta o seletor e
  # valida localmente com ela.
  resources :layouts, only: :index
  # A rota `/render` do front, aberta pelo Chromium do export, lê por aqui.
  get "render/piece-versions/:id" => "piece_render_payloads#show", as: :piece_render_payload

  # --- área da Vekoo (staff) -------------------------------------------------
  # A curadoria do banco de referências. Quem não é staff recebe 404 em tudo
  # aqui dentro, como se a rota não existisse (`Admin::BaseController`).
  namespace :admin do
    resources :reference_cards, path: "reference-cards", only: %i[index show create update] do
      member do
        post :publish
        post :reject
        post :reopen
        post :retry, action: :retry_analysis
        get :thumbnail
      end
    end
    # A importação pela Business Discovery do Instagram.
    resources :reference_imports, path: "reference-imports", only: %i[index show create] do
      member do
        post :analyze
        post "accounts/:account_id/retry", action: :retry_account, as: :retry_account
      end
    end
    get "instagram/status" => "instagram#status"
    # O teste lado a lado da Fase 3 (as rotas do par vêm antes: `pairs` não é
    # nome de rodada).
    get "reference-evals/pairs/:id" => "reference_evals#pair", as: :reference_eval_pair
    patch "reference-evals/pairs/:id" => "reference_evals#update_pair"
    get "reference-evals" => "reference_evals#index", as: :reference_evals
    get "reference-evals/:round" => "reference_evals#show", as: :reference_eval
    get "reference-evals/:round/results" => "reference_evals#results", as: :reference_eval_results
  end

  # Migração do legado: carrosséis e pastas sem marca. Temporária (ver
  # `OrphanMigration`).
  get  "orphans"        => "orphans#index"
  post "orphans/assign" => "orphans#assign"

  # WebSocket dos avisos ao vivo (`BrandCoreChannel`, `PieceChannel`,
  # `AgentChannel`). Autentica por `?token=`.
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
