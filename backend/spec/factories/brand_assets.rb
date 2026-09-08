FactoryBot.define do
  factory :brand_asset do
    brand_core
    organization { brand_core.organization }
    kind { "logo" }
    variant { "light" }
    filename { "logo.png" }
    content_type { "image/png" }
    byte_size { 1234 }

    after(:build) do |asset|
      asset.file.attach(
        io: File.open(Rails.root.join("spec/fixtures/files/logo-transparente.png")),
        filename: asset.filename,
        content_type: asset.content_type
      )
    end
  end
end
