# Rotas do domínio "inbox" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

resources :chats, only: %i[index show create update destroy] do
  collection do
    post :search, action: :index
    get :lookup
    get "self-filter", action: :self_filter
    get :people
    get :teams
    get :access
  end

  member do
    put :attributes, action: :update_attributes
    post :read
    post "suggest-reply", action: :suggest_reply
  end

  resources :messages, only: %i[index destroy], controller: "chat_messages" do
    collection do
      post "bulk-delete", action: :bulk_destroy
      post :audio
      post :attachments
    end

    member do
      post :reaction
    end
  end
end

# `external_id` pode ter `@` e `.` (`5511...@s.whatsapp.net`): a tela manda codificado.
resources :unified_contacts, path: "unified-contacts", only: :index
get "unified-contacts/:external_id/messages", to: "unified_contacts#messages",
    constraints: { external_id: %r{[^/]+} }, format: false

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
