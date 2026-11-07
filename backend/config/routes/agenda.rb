# Rotas do domínio "agenda" (avaliadas dentro de Rails.application.routes.draw).
# Caminhos em inglês e kebab-case: resources :quick_replies, path: "quick-replies".

scope module: :agenda do
  resources :calendars, only: %i[index show create update] do
    post "google-calendar/connect" => "google_calendar#connect"
    post "google-calendar/callback" => "google_calendar#callback"
    delete "google-calendar" => "google_calendar#disconnect"

    get "availability" => "availability#show"

    # Sequências de comparecimento e o teste delas.
    resource :attendance_sequences, path: "attendance-sequences", only: %i[show update], controller: "attendance_sequences" do
      get :bookings
      post :preview
    end

    # O teste dos lembretes ao contato: simula, sem enviar.
    resource :contact_notification_preview, path: "contact-notification-preview", only: :create, controller: "contact_notification_previews" do
      get :bookings
      get :messages
    end

    resources :professionals, only: %i[index show create update destroy]
    resources :services, only: %i[index show create update destroy], controller: "offerings"

    resources :class_groups, path: "class-groups", only: %i[index show create update destroy] do
      resources :sessions, only: %i[index show create update], controller: "class_sessions" do
        post :cancel, on: :member
      end
      resources :enrollments, only: %i[index create destroy], controller: "class_enrollments"
    end
  end

  # Os da organização, em todos os calendários.
  get "professionals" => "professionals#all"
  get "services" => "offerings#all"

  resources :calendar_events, path: "calendar-events", only: %i[index show create update destroy] do
    collection do
      get "month-counts", action: :month_counts
      get :filters
    end

    member do
      post :sequence, action: :enroll_sequence
      delete :sequence, action: :unenroll_sequence
    end
  end

  # A aula pode ser a exceção gravada ou a calculada (`vcs_...`).
  resources :class_sessions, path: "class-sessions", only: [] do
    resources :attendances, only: %i[index create update destroy], controller: "class_attendances" do
      collection do
        post "bulk-update", action: :bulk_update
        get :schedule
      end
    end
  end

  get "dashboard/calendar-stats" => "calendar_stats#show"
end

# O trabalho agendado da conversa. A tela do chat lista e cancela um a um.
resources :chats, only: [] do
  resources :scheduled_actions, path: "scheduled-actions", only: %i[index destroy]
end

# O aviso do Google: sem sessão, responde 2xx e enfileira.
scope :inbound, module: :inbound, as: :inbound do
  post "google-calendar/:id", to: "google_calendar#event", as: :google_calendar
end
