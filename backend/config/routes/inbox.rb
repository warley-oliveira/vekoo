# Rotas do domínio "inbox" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

resources :quick_replies, path: "quick-replies", only: %i[index show create update destroy]

resources :chat_views, path: "chat-views", only: %i[index show create update destroy]

resources :chat_tags, path: "chat-tags", only: %i[index show create update destroy] do
  member do
    get :assigns
    put "chats/:chat_id", action: :apply
    delete "chats/:chat_id", action: :remove
  end
end

resources :attachments, only: %i[index show create update destroy]

resources :custom_fields, path: "custom-fields", only: %i[index show create update destroy] do
  member do
    get :values
    post :normalize
    post :options, action: :add_option
  end
end
