FactoryBot.define do
  factory :notification do
    organization
    key { "welcome" }
    read { false }
    notified_at { Time.current }
  end
end
