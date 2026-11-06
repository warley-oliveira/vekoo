# Rotas do domínio "connectors" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

resources :connectors, only: %i[index show create update] do
  member do
    post :activate
    post :reload
    post :shutdown
    post :pause
    post :disconnect

    get "business-profile", action: :business_profile
    patch "business-profile", action: :update_business_profile
    post "business-profile/picture", action: :upload_profile_picture

    get "phone-numbers", action: :phone_numbers
    post "phone-numbers/refresh", action: :refresh_phone_numbers

    get "instagram-profile", action: :instagram_profile
  end

  resources :templates, only: %i[index create update destroy], controller: "connector_templates"

  resource :widget, only: %i[show update destroy], controller: "connector_widgets" do
    post "regenerate-token", action: :regenerate_token
    post "upload-image", action: :upload_image
  end
end

get "media/download" => "media_downloads#show"
get "media/metadata" => "media_downloads#metadata"

# --- webhooks dos provedores: sem sessão, respondem 2xx e enfileiram ---------
scope :inbound, module: :inbound, as: :inbound do
  match "whatsapp-cloud/:id", to: "whatsapp_cloud#callback", via: %i[get post], as: :whatsapp_cloud
  match "meta-messaging", to: "meta_messaging#callback", via: %i[get post], as: :meta_messaging

  post "evolution/:codename", to: "evolution#receive", as: :evolution
  post "lead-chat/:id/event", to: "lead_chat#event", as: :lead_chat_event

  post "zapi/:connector_id/on-message-received", to: "zapi#on_message_received", as: :zapi_message_received
  post "zapi/:connector_id/on-message-send", to: "zapi#on_message_send", as: :zapi_message_send
  post "zapi/:connector_id/on-whatsapp-disconnected", to: "zapi#on_whatsapp_disconnected", as: :zapi_disconnected
  post "zapi/:connector_id/on-whatsapp-connected", to: "zapi#on_whatsapp_connected", as: :zapi_connected
end

# --- widget de chat nos sites dos clientes -----------------------------------
scope "widget/v1", module: "widget/v1", as: :widget_v1 do
  post "session", to: "sessions#create"
  get "config", to: "sessions#show"
  post "visitor", to: "visitor#create"
  get "visitor", to: "visitor#show"
  post "messages", to: "messages#create"
  get "messages", to: "messages#index"
  put "context", to: "context#update"
end

mount WidgetCable.server => "/widget-cable"
