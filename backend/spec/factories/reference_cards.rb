FactoryBot.define do
  factory :reference_card do
    status { "draft" }
    origin { "external" }
    source { { "url" => "https://www.instagram.com/p/C0deExempl0/", "channel" => "@padariaexemplo" } }

    # A análise como o modelo devolve: tudo preenchido, nenhuma frase copiada
    # — só a função de cada parte.
    trait :analyzed do
      status { "in_review" }
      niche { "food_beverage" }
      size { "local" }
      archetypes { %w[natural_artisanal popular_warm] }
      objective { "behind_the_scenes" }
      format { "carousel" }
      analysis do
        {
          "hook" => { "type" => "curiosity", "description" => "A capa mostra o resultado e esconde o processo; promete contar como se chega lá." },
          "structure" => {
            "summary" => "Processo em etapas, uma por lâmina, terminando no produto pronto e no convite para visitar.",
            "beats" => [ "capa com o resultado", "etapa 1 do processo", "etapa 2 do processo", "produto pronto", "convite para a loja" ]
          },
          "visual" => {
            "composition" => "Foto ocupa a lâmina inteira; texto curto no terço de baixo.",
            "color" => "Tons terrosos da própria foto; texto claro sobre faixa escura.",
            "typography" => "Serifa grande no título, sem serifa pequena na legenda da etapa.",
            "imagery" => "Mãos trabalhando, luz natural lateral, sem pessoa de frente."
          },
          "copy" => {
            "function" => "Nomeia cada etapa em poucas palavras e dá um dado concreto (tempo, temperatura).",
            "tone" => "Próximo, de quem faz com as próprias mãos.",
            "cta" => "Convida para provar na loja, sem preço."
          },
          "whyItWorks" => "Transforma o processo em história e gera confiança pelo detalhe concreto.",
          "replicability" => { "score" => 3, "requirements" => "Celular e luz de janela; o processo já existe." },
          "metrics" => { "likes" => 840, "comments" => 60, "baselineMedian" => 300, "collectedAt" => "2026-10-20" }
        }
      end
    end

    trait :published do
      analyzed
      status { "published" }
    end
  end
end
