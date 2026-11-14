FactoryBot.define do
  factory :piece do
    organization
    brand_core { association :brand_core, :published, organization: organization }
    engine_id { "statement" }
    format { "post" }
    title { "Frase de impacto" }
    values { { "phrase" => "Pão de verdade\nleva tempo.", "label" => "a partir de", "price" => "fato-preco" } }
    status { "queued" }
  end
end
