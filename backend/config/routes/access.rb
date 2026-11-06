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
