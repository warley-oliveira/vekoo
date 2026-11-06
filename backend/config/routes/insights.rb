# Rotas do domínio "insights" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

get "dashboard" => "dashboard#show"

resources :funnels, only: %i[index show create update destroy] do
  get :board, on: :member

  # Mover a conversa entre as etapas: `PUT` com `stageId`, `DELETE` tira do funil.
  resources :chats, only: %i[update destroy], controller: "funnel_chats"
end
