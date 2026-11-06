# Rotas do domínio "access" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

# --- pessoas, departamentos e grupos -----------------------------------------
resources :users, only: %i[index show create update destroy] do
  collection do
    get "check-email", action: :check_email
  end

  member do
    post :revoke
    post :restore
  end
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
