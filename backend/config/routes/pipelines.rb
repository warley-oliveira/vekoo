# Rotas do domínio "pipelines" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".
scope path: "pipelines", module: :pipelines, as: :pipelines do
  resources :labels, only: %i[index create update destroy]
  resources :templates, only: :index

  resources :boards, only: %i[index show create update destroy] do
    member do
      post :archive
      get :metrics
      get "archived-cards", action: :archived_cards
    end

    resources :stages, only: %i[create update destroy] do
      post :reorder, on: :collection

      resources :checklist_items, path: "checklist-items", controller: "stage_checklist_items",
        only: %i[index create update destroy] do
        post :reorder, on: :collection
      end
    end

    resources :cards, only: %i[index show create update destroy] do
      member do
        post :move
        post :archive
        post "mark-won", action: :mark_won
        post "mark-lost", action: :mark_lost
        post :reopen
        post :watch
        delete :watch, action: :unwatch
      end

      collection do
        post "bulk-update", action: :bulk_update
        post :reorder
      end

      resources :comments, only: %i[index create update destroy] do
        member do
          post :pin
          delete :pin, action: :unpin
          post :reactions, action: :add_reaction
          delete :reactions, action: :remove_reaction
        end
      end

      resources :activities, only: :index
      resources :attachments, only: %i[index create destroy]

      resources :checklists, only: %i[index create update destroy] do
        resources :items, controller: "checklist_items", only: %i[create update destroy] do
          post :toggle, on: :member
        end
      end

      resources :stage_checks, path: "stage-checks", controller: "card_stage_checks", only: :index do
        post :toggle, on: :member
      end
    end

    resources :custom_fields, path: "custom-fields", only: %i[index create update destroy] do
      post :reorder, on: :collection
    end

    resources :triggers, only: %i[index create update destroy] do
      post :toggle, on: :member
    end

    resources :trigger_executions, path: "trigger-executions", only: :index

    resources :goals, only: %i[index create update destroy] do
      collection do
        get :progress
        get :history
      end
    end

    resources :saved_filters, path: "saved-filters", only: %i[index create update destroy] do
      post "toggle-favorite", action: :toggle_favorite, on: :collection
    end
  end
end
