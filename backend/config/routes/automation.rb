# Rotas do domínio "automation" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

resources :flows, only: %i[index show create update destroy] do
  member do
    match :definition, via: %i[put patch], action: :update_definition
    post :publish
    post :archive
    post :unarchive
    get :versions
    get "versions/:version_id", action: :version, as: :version
  end

  resources :executions, only: %i[index show create], module: :flows

  # O teste do editor: `POST /flows/:flowId/playground`, assinar o canal e só então `.../run`.
  post "playground", to: "flows/playground#start"
  post "playground/:execution_id/run", to: "flows/playground#run", as: :playground_run
  post "playground/:execution_id/message", to: "flows/playground#message", as: :playground_message
  delete "playground/:execution_id", to: "flows/playground#stop", as: :playground_stop
end

resources :flow_templates, path: "flow-templates", only: %i[index show]

resources :tools, only: %i[index show create update destroy] do
  member do
    post :test
    post :personalize
    get "test-runs/:run_id", action: :test_run, as: :test_run
  end
end

resources :tool_catalog, path: "tool-catalog", only: %i[index show], controller: "tool_catalog"

resources :tool_installations, path: "tool-installations", only: %i[index create update destroy] do
  patch :toggle, on: :member
end

resources :webhooks, only: %i[index show create update destroy] do
  member do
    post "enable-signature", action: :enable_signature
    post "rotate-signing-secret", action: :rotate_signing_secret
    delete "disable-signature", action: :disable_signature
  end
end

resources :webhook_logs, path: "webhook-logs", only: %i[index show] do
  get :stats, on: :collection
end

# Entrada pública do webhook: sem sessão, responde na hora e joga o trabalho para o job.
post "inbound/webhooks/:uid", to: "inbound/webhooks#receive", as: :inbound_webhook
