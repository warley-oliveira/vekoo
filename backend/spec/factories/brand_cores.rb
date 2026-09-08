FactoryBot.define do
  factory :brand_core do
    organization
    status { "draft" }
    document { {} }

    # O mínimo obrigatório preenchido — publica de primeira.
    trait :complete do
      document do
        {
          "identity" => {
            "name" => "Pão da Vila", "segment" => "Padaria artesanal",
            "concept" => "Pão de fermentação natural feito todo dia, sem pressa.",
            "positioning" => "A padaria de bairro que virou referência.", "instagram" => "paodavila"
          },
          "palette" => {
            "colors" => [
              { "id" => "c1", "name" => "Casca", "hex" => "#3b2a1a", "role" => "darkBackground" },
              { "id" => "c2", "name" => "Miolo", "hex" => "#f6efe3", "role" => "textOnDark" },
              { "id" => "c3", "name" => "Farinha", "hex" => "#fbf8f2", "role" => "lightBackground" },
              { "id" => "c4", "name" => "Café", "hex" => "#2a1d12", "role" => "textOnLight" },
              { "id" => "c5", "name" => "Manteiga", "hex" => "#e8b64c", "role" => "accent" }
            ]
          },
          "typography" => {
            "display" => { "family" => "Fraunces", "source" => "catalog", "weights" => [ 600, 700 ], "usage" => "Títulos" },
            "utility" => { "family" => "Inter", "source" => "catalog", "weights" => [ 400, 600 ], "usage" => "Texto" }
          },
          "voice" => {
            "essence" => "Fala como quem assa: direta, quente e sem enfeite.",
            "tones" => [ "warm", "direct" ]
          }
        }
      end
    end

    trait :published do
      complete
      status { "published" }
      published_document { document }
      published_at { 1.day.ago }
      current_version { 1 }
    end
  end
end
