FactoryBot.define do
  factory :reference_import do
    niche { "food_beverage" }
    size { "local" }
  end

  factory :reference_import_account do
    reference_import
    username { "padoca.exemplo" }
    status { "pending" }
  end
end
