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

  resources :notifications, only: :index do
    collection do
      post "read-all", action: :read_all
    end
  end

  get  "credits"         => "credits#show"
  post "credits/consume" => "credits#consume"

  # --- acervo da ferramenta -------------------------------------------------
  get "catalog" => "catalog#show"

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
end
