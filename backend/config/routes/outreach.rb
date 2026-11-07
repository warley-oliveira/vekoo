# Rotas do domínio "outreach" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".
resources :campaigns, only: %i[index show create update destroy] do
  collection do
    get :summary
    get :capabilities, to: "campaign_options#capabilities"
    get "available-connectors", to: "campaign_options#connectors"
    get "available-tags", to: "campaign_options#tags"
    get "available-flows", to: "campaign_options#flows"
    post "import-google-sheet", to: "campaign_imports#google_sheet"
    post "apify-places-search", to: "campaign_imports#apify_places_search"
  end

  member do
    post :schedule
    post :launch
    post :pause
    post :resume
    post :cancel
    get :stats
    get :recipients
    post "import-contacts", to: "campaign_imports#contacts"
    post "import-csv-contacts", to: "campaign_imports#csv_contacts"
    get "recipient-summary", to: "campaign_imports#recipient_summary"
    delete :recipients, to: "campaign_imports#remove_recipients"
    delete "recipients/:recipient_id", to: "campaign_imports#remove_recipient"
  end
end

resources :place_extractions, path: "place-extractions", only: %i[index show create destroy] do
  get :contacts, on: :collection
  get :results, on: :member
end
