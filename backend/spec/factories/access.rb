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
end
