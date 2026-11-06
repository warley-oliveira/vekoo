FactoryBot.define do
  # Um funil com as etapas de um atendimento de loja. `stage_names: []` para testar sem etapa.
  factory :funnel do
    transient { stage_names { %w[Novo Atendimento Proposta Fechado] } }

    organization
    sequence(:name) { |n| "Funil #{n}" }

    after(:create) do |funnel, evaluator|
      evaluator.stage_names.each_with_index { |name, position| funnel.stages.create!(name: name, position: position) }
      funnel.stages.reset
    end
  end

  factory :funnel_stage do
    funnel
    sequence(:name) { |n| "Etapa #{n}" }
    position { 0 }
  end

  factory :custom_dashboard, class: "CustomDashboard" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    created_by_account_id { SecureRandom.uuid }
    sequence(:name) { |n| "Dashboard #{n}" }
  end
end
