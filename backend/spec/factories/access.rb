FactoryBot.define do
  factory :access_role do
    organization
    sequence(:name) { |n| "Grupo #{n}" }
    permissions { AccessRole::MANAGER_PERMISSIONS }

    trait :member do
      permissions { AccessRole::MEMBER_PERMISSIONS }
    end
  end

  factory :team do
    organization
    sequence(:name) { |n| "Departamento #{n}" }
  end

  factory :team_membership do
    team
    account
  end

  factory :organization_alert do
    organization
    category { "connectors" }
    severity { "error" }
    origin_type { "Connector" }
    sequence(:origin_id) { |n| "conector-#{n}" }
    origin_name { "WhatsApp da loja" }
    code { "connector_disconnected" }
    metadata { {} }
  end

  # O aparelho é da pessoa. `account:` continua aceito: vale a pessoa dele.
  factory :push_device do
    transient do
      account { nil }
    end

    user { account&.user || association(:user) }
    sequence(:endpoint) { |n| "https://push.exemplo.com.br/assinatura-#{n}" }
    p256dh_key { "chave-p256dh" }
    auth_key { "chave-auth" }
    user_agent { "Mozilla/5.0 (X11; Linux x86_64) Chrome/142.0" }
  end

  factory :account_notice do
    account_id { SecureRandom.uuid }
    organization_id { SecureRandom.uuid }
    title { "Novo agendamento confirmado" }
    description { "Ana Beatriz marcou Limpeza de pele para quinta-feira, às 14h." }
    category { "calendar" }
    url { "/calendar" }
    actions { [] }

    # O aviso aponta para a pessoa por id: não há associação para a factory seguir.
    transient do
      account { nil }
    end

    after(:build) do |notice, evaluator|
      next unless evaluator.account

      notice.account_id = evaluator.account.id
      notice.organization_id = evaluator.account.organization_id
    end
  end
end
