FactoryBot.define do
  factory :account do
    organization
    name { "Marina Duarte" }
    sequence(:email) { |n| "pessoa#{n}@exemplo.com.br" }
    password { "carrossel123" }
    role { "owner" }
  end
end
