FactoryBot.define do
  factory :folder do
    organization
    sequence(:name) { |n| "Pasta #{n}" }
    color { "oklch(0.62 0.12 292)" }
  end
end
