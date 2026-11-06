FactoryBot.define do
  factory :product_item, class: "Products::Item" do
    organization
    sequence(:title) { |n| "Camiseta de algodão #{n}" }
  end

  factory :product_category, class: "Products::Category" do
    organization
    sequence(:name) { |n| "Categoria #{n}" }
  end

  factory :product_field_definition, class: "Products::FieldDefinition" do
    organization
    sequence(:name) { |n| "Campo #{n}" }
    value_type { "text" }
  end

  factory :product_image, class: "Products::Image" do
    association :item, factory: :product_item
    sequence(:source_url) { |n| "https://cdn.exemplo.com.br/fotos/#{n}.png" }
  end

  factory :product_embedding, class: "Products::Embedding" do
    transient do
      vector { Array.new(Products::Embedder::DIMENSIONS, 0.1) }
    end

    association :item, factory: :product_item
    organization { item.organization }
    embedding { vector }
    source_hash { SecureRandom.hex(32) }
    model { Products::Embedder::MODEL }
  end

  factory :product_import, class: "Products::Import" do
    organization
    status { "ready" }
    filename { "catalogo.csv" }
    delimiter { "," }
  end
end
