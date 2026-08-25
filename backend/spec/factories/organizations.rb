FactoryBot.define do
  factory :organization do
    sequence(:name) { |n| "Organização #{n}" }
    plan { "free" }
    credits_total { 50 }
    credits_used { 0 }
  end
end
