# Rotas do domínio "access" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

# --- pessoas, departamentos e grupos -----------------------------------------
resources :users, only: %i[index show create update destroy] do
  collection do
    get "check-email", action: :check_email
    post :leave
  end

  member do
    post :revoke
    post :restore
    post "transfer-ownership", action: :transfer_ownership
  end
end

# --- as organizações da pessoa e o suporte (valem sem `X-Account`) ----------------
get  "accounts"      => "memberships#index"
post "organizations" => "memberships#create"

scope :support, as: :support do
  get  "organizations"           => "support#organizations"
  post "organizations/:id/enter" => "support#enter", as: :enter_organization
end

resources :teams, only: %i[index show create update destroy]
resources :access_roles, path: "access-roles", only: %i[index show create update destroy]

# --- perfil e organização (singulares: valem para a sessão) --------------------
resource :profile, only: %i[show update], controller: "profile" do
  post :avatar, action: :upload_avatar
  delete :avatar, action: :destroy_avatar
end

resource :organization, only: %i[show update], controller: "organization" do
  patch "chat-settings", action: :update_chat_settings
  post :logo, action: :upload_logo
  delete :logo, action: :destroy_logo
end

# --- avisos, alertas e push -----------------------------------------------------
# `GET /notifications` e `POST /notifications/read-all` estão em config/routes.rb desde
# antes da plataforma; aqui entra o que este domínio acrescenta.
resources :notifications, only: %i[show destroy] do
  collection do
    get "unread-count", action: :unread_count
  end

  member do
    post :read
  end
end

resources :organization_alerts, path: "alerts", only: :index do
  collection do
    get :details
    post :resolve
  end
end

resources :push_devices, path: "push-devices", only: %i[index create destroy] do
  collection do
    get "vapid-public-key", action: :vapid_public_key
    post :test
    delete "", action: :destroy_by_endpoint
  end
end
