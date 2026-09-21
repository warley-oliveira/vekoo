require "rails_helper"

# O onboarding guiado, de ponta a ponta. Nada aqui toca a rede: sem chave de
# API, o "cria pra mim" cai nas propostas curadas — que é exatamente o
# comportamento de produção quando o modelo não responde.
RSpec.describe "Onboarding guiado", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { organization.brand_cores.create! }

  def answer(step, document: nil, action: "answered", segment: nil)
    body = { onboarding: { step: step, action: action } }
    body[:onboarding][:document] = document if document
    body[:onboarding][:segment] = segment if segment
    patch "/brands/#{brand.id}/onboarding", params: body, headers: headers, as: :json
  end

  # As quatro respostas do mínimo, com fonte e cor vindas do "cria pra mim".
  def answer_minimum
    answer("name", document: { identity: { name: "Padaria do João" } })
    answer("what", segment: "restaurant", document: {
      identity: { name: "Padaria do João", segment: "Padaria de bairro",
                  concept: "Pão quente às 6h e bolo de fubá no fim da tarde." }
    })
    palette = suggest("palette").first
    answer("colors", document: { palette: { colors: palette["colors"] } })
    fonts = suggest("fonts").first
    answer("fonts", document: { typography: { display: fonts["display"], utility: fonts["utility"], rules: [] } })
  end

  def suggest(kind)
    post "/brands/#{brand.id}/onboarding/suggest", params: { kind: kind }, headers: headers, as: :json
    json["options"]
  end

  describe "responder as perguntas" do
    it "escreve na seção do documento que o wizard de edição já conhece" do
      answer("name", document: { identity: { name: "Padaria do João" } })

      expect(response).to have_http_status(:ok)
      expect(brand.reload.full_document.dig("identity", "name")).to eq("Padaria do João")
      expect(json.dig("onboarding", "answered")).to eq([ "name" ])
    end

    it "guarda o código do segmento separado do texto que a pessoa confirmou" do
      answer("what", segment: "restaurant", document: {
        identity: { name: "x", segment: "Padaria artesanal do interior" }
      })

      # O texto é dela e pode ser qualquer coisa; o código é o que a IA e as
      # propostas curadas usam para escolher.
      expect(brand.reload.onboarding_segment).to eq("restaurant")
      expect(brand.full_document.dig("identity", "segment")).to eq("Padaria artesanal do interior")
    end

    it "lembra onde a pessoa parou, para ela voltar na pergunta certa" do
      answer("colors", action: "viewed")

      expect(brand.reload.onboarding_step).to eq("colors")
    end

    it "registra quem pulou, e pular não conta como resposta" do
      answer("handle", action: "skipped")

      expect(brand.reload.onboarding_skipped).to include("handle")
      expect(brand.onboarding_answered).not_to include("handle")
    end

    it "recusa pergunta que não existe" do
      answer("qualquer_coisa")

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("step")
    end

    it "não apaga o progresso do onboarding ao salvar uma etapa do wizard de edição" do
      answer("colors", action: "viewed")

      patch "/brands/#{brand.id}",
        params: { brand: { document: { identity: { name: "Outro nome" } }, progress: { lastStep: "identity" } } },
        headers: headers, as: :json

      expect(brand.reload.onboarding_step).to eq("colors")
      expect(brand.last_step).to eq("identity")
    end
  end

  describe "o botão 'não sei / cria pra mim'" do
    before do
      answer("what", segment: "restaurant", document: {
        identity: { name: "Padaria do João", segment: "Padaria de bairro", concept: "Pão quente às 6h." }
      })
    end

    it "sempre devolve três opções, mesmo sem modelo disponível" do
      options = suggest("palette")

      expect(response).to have_http_status(:ok)
      expect(json["source"]).to eq("curated")
      expect(options.length).to eq(3)
    end

    it "devolve paleta pronta para salvar: papéis derivados e contraste conferido" do
      palette = suggest("palette").first

      roles = palette["colors"].map { |c| c["role"] }
      expect(roles).to include("darkBackground", "lightBackground", "textOnDark", "textOnLight", "accent")
      by_role = palette["colors"].index_by { |c| c["role"] }
      expect(BrandCore::Colors.contrast(by_role["textOnDark"]["hex"], by_role["darkBackground"]["hex"])).to be >= 4.5
      expect(BrandCore::Colors.contrast(by_role["textOnLight"]["hex"], by_role["lightBackground"]["hex"])).to be >= 4.5
    end

    it "propõe pares de fontes que existem no catálogo e nunca a mesma duas vezes" do
      suggest("fonts").each do |option|
        expect(BrandCore::FontCatalog.exists?(option["display"]["family"])).to be(true)
        expect(BrandCore::FontCatalog.exists?(option["utility"]["family"])).to be(true)
        expect(option["display"]["family"]).not_to eq(option["utility"]["family"])
      end
    end

    it "propõe vozes com tons válidos" do
      suggest("voice").each do |option|
        expect(option["essence"]).to be_present
        expect(option["tones"] - BrandCore::Schema::TONES).to be_empty
      end
    end

    it "usa o modelo quando ele responde, e valida a resposta contra o catálogo" do
      allow(Ai::Chat).to receive(:new).and_return(chat_returning(
        { "options" => [
          { "display" => "Fraunces", "utility" => "Inter", "why" => "clássica com um pé no forno" },
          { "display" => "Bebas Neue", "utility" => "DM Sans", "why" => "grita o preço" },
          { "display" => "Fonte Inventada", "utility" => "Inter", "why" => "não existe" }
        ] }
      ))

      options = suggest("fonts")

      expect(json["source"]).to eq("ai")
      # A inventada some; as duas boas ficam.
      expect(options.map { |o| o["display"]["family"] }).to eq([ "Fraunces", "Bebas Neue" ])
    end

    it "cai nas propostas curadas quando o modelo responde algo inaproveitável" do
      allow(Ai::Chat).to receive(:new).and_return(chat_returning({ "options" => [ { "display" => "Nada" } ] }))

      suggest("fonts")

      expect(json["source"]).to eq("curated")
      expect(json["options"].length).to eq(3)
    end

    it "registra o custo da proposta — é o que dá o custo de criar uma marca" do
      allow(Ai::Chat).to receive(:new).and_return(chat_returning({ "options" => [] }))

      expect { suggest("voice") }.to change { OnboardingEvent.where(action: "suggested").count }.by(1)
      expect(OnboardingEvent.where(action: "suggested").ordered.last.cost_micro_usd).to be > 0
    end

    it "recusa um tipo de proposta que não existe" do
      post "/brands/#{brand.id}/onboarding/suggest", params: { kind: "logotipo" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "o logotipo de quem não tem logo" do
    it "guarda a intenção na pergunta da logo, sem desenhar ainda" do
      answer("name", document: { identity: { name: "Padaria do João" } })

      patch "/brands/#{brand.id}/onboarding",
        params: { onboarding: { step: "logo", action: "answered", wantsWordmark: true } },
        headers: headers, as: :json

      # A tipografia só é escolhida duas perguntas depois: desenhar agora
      # daria um logotipo na fonte errada.
      expect(brand.reload).to be_wants_wordmark
      expect(brand.assets.where(kind: "logo")).to be_empty
    end

    it "sai desenhado no fechamento, mesmo que a tela não tenha pedido" do
      answer_minimum
      patch "/brands/#{brand.id}/onboarding",
        params: { onboarding: { step: "logo", action: "answered", wantsWordmark: true } },
        headers: headers, as: :json

      post "/brands/#{brand.id}/onboarding/finish", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(brand.reload.assets.where(kind: "logo", generated: true).count).to eq(2)
    end

    it "desenha as duas versões com a fonte e as cores já escolhidas" do
      answer_minimum

      post "/brands/#{brand.id}/onboarding/wordmark", headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["assets"].map { |a| a["variant"] }).to match_array(%w[light dark])
      expect(json["assets"]).to all(include("kind" => "logo", "generated" => true))
    end

    it "é determinístico: rodar duas vezes troca o arquivo, não acumula ativo" do
      answer_minimum
      post "/brands/#{brand.id}/onboarding/wordmark", headers: headers, as: :json
      post "/brands/#{brand.id}/onboarding/wordmark", headers: headers, as: :json

      expect(brand.reload.assets.where(kind: "logo").count).to eq(2)
    end

    it "não desenha sem nome, e explica" do
      post "/brands/#{brand.id}/onboarding/wordmark", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("name")
    end
  end

  describe "o fechamento" do
    it "publica a versão 1 e marca o onboarding como concluído" do
      answer_minimum

      expect { post "/brands/#{brand.id}/onboarding/finish", headers: headers, as: :json }
        .to change { brand.reload.current_version }.from(0).to(1)

      expect(response).to have_http_status(:ok)
      expect(brand.reload).to be_published
      expect(brand.onboarding_done?).to be(true)
      expect(brand.generation_contract[:ready]).to be(true)
    end

    it "preenche a voz que a pessoa pulou, para o mínimo de publicação fechar" do
      answer_minimum
      answer("voice", action: "skipped")

      post "/brands/#{brand.id}/onboarding/finish", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      voice = brand.reload.full_document["voice"]
      expect(voice["essence"]).to be_present
      expect(voice["tones"]).not_to be_empty
    end

    it "recusa antes do mínimo, dizendo o que falta" do
      answer("name", document: { identity: { name: "Padaria do João" } })

      post "/brands/#{brand.id}/onboarding/finish", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("brandIncomplete")
      expect(json.dig("error", "details", "required")).to be_present
    end

    it "deixa a marca pronta para o agente criar a primeira peça" do
      answer_minimum
      post "/brands/#{brand.id}/onboarding/finish", headers: headers, as: :json

      post "/brands/#{brand.id}/conversations",
        params: { turn: { prompt: "post do pão de hoje" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end
  end

  describe "a telemetria do funil" do
    it "conta quem viu, respondeu e pulou cada pergunta" do
      answer("name", document: { identity: { name: "Padaria do João" } })
      answer("handle", action: "skipped")
      answer("logo", action: "viewed")

      funnel = OnboardingEvent.funnel.index_by { |row| row["step"] }
      expect(funnel["name"]["answered"]).to eq(1)
      expect(funnel["handle"]["skipped"]).to eq(1)
      # "Chegou" é ter qualquer evento na etapa: quem respondeu também chegou.
      expect(funnel["logo"]["reached"]).to eq(1)
      expect(funnel["name"]["reachPercent"]).to eq(100)
    end

    it "sobrevive à marca ser apagada — o custo do mês não pode sumir com ela" do
      answer("name", document: { identity: { name: "Padaria do João" } })

      expect { brand.destroy! }.not_to change { OnboardingEvent.count }
      expect(OnboardingEvent.ordered.last.brand_core_id).to be_nil
    end
  end

  # Um `Ai::Chat` que devolve o JSON que mandarmos.
  def chat_returning(payload)
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: JSON.generate(payload),
          usage: { input: 900, output: 300, cacheRead: 0, cacheWrite: 0 }, model: "claude-opus-5")
      )
    end
  end
end

# As marcas que nasceram antes do onboarding existir.
RSpec.describe "Onboarding e marcas antigas", type: :request do
  it "trata marca já publicada como cadastro concluído, sem migração de dados" do
    brand = create(:brand_core, :published)

    expect(brand.onboarding_done?).to be(true)
    expect(brand.onboarding_pending?).to be(false)
  end

  it "marca em rascunho que já usou o formulário de edição não volta ao onboarding" do
    brand = create(:brand_core)
    brand.track_progress(visited: [ "identity" ], last_step: "identity")
    brand.save!

    expect(brand.onboarding_pending?).to be(false)
  end
end
