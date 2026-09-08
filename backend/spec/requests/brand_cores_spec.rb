require "rails_helper"

RSpec.describe "Brandcore", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  describe "GET /brand-core" do
    it "cria o Brandcore na primeira visita, já com os defaults" do
      expect { get "/brand-core", headers: headers }.to change(BrandCore, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(json["status"]).to eq("draft")
      expect(json["document"]["identity"]["name"]).to eq("")
      # Os estilos nascem preenchidos: a pessoa ajusta, não cria do zero.
      expect(json["document"]["styles"]["roles"].map { |r| r["key"] })
        .to eq(%w[kicker title lede body number item footer])
      expect(json["completeness"]["percent"]).to eq(10)
      expect(json["completeness"]["minimumMet"]).to be(false)
      expect(json["readyForGeneration"]).to be(false)
      expect(json["generationBlockers"]).to eq([ "notPublished" ])
      expect(json["progress"]).to eq("visitedSteps" => [], "lastStep" => nil)
    end

    it "não cria de novo na segunda visita" do
      get "/brand-core", headers: headers
      expect { get "/brand-core", headers: headers }.not_to change(BrandCore, :count)
    end

    it "exige sessão" do
      get "/brand-core"
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "PATCH /brand-core" do
    it "salva uma seção inteira, normalizando o que vem da tela" do
      patch "/brand-core", headers: headers, as: :json, params: {
        brandCore: {
          document: {
            identity: {
              name: "  Pão da Vila ", segment: "Padaria", concept: "Pão sem pressa.",
              instagram: "@paodavila", estranho: "não entra",
              characters: [ { id: "p1", name: "Seu Nilton", role: "Padeiro" } ]
            }
          },
          progress: { visitedSteps: [ "identity" ], lastStep: "identity" }
        }
      }

      expect(response).to have_http_status(:ok)
      identity = json["document"]["identity"]
      expect(identity["name"]).to eq("Pão da Vila")
      expect(identity["instagram"]).to eq("paodavila")
      expect(identity).not_to have_key("estranho")
      expect(identity["characters"]).to eq([ { "id" => "p1", "name" => "Seu Nilton", "role" => "Padeiro" } ])
      expect(json["progress"]).to eq("visitedSteps" => [ "identity" ], "lastStep" => "identity")
      expect(json["completeness"]["sections"]["identity"]).to eq(80)
    end

    it "aplica as regras da paleta na completude, sem travar o rascunho" do
      patch "/brand-core", headers: headers, as: :json, params: {
        brandCore: { document: { palette: { colors: [
          { id: "c1", name: "Noite", hex: "#101018", role: "darkBackground" },
          { id: "c2", name: "Giz", hex: "#F5F5F5", role: "textOnDark" }
        ] } } }
      }

      expect(response).to have_http_status(:ok)
      expect(json["document"]["palette"]["colors"].last["hex"]).to eq("#f5f5f5")
      required = json["completeness"]["required"].to_h { |r| [ r["key"], r["met"] ] }
      expect(required["palette.background"]).to be(true)
      expect(required["palette.textPerBackground"]).to be(true)
      expect(required["palette.accent"]).to be(false)
    end

    it "recusa o inválido apontando o caminho do campo" do
      patch "/brand-core", headers: headers, as: :json, params: {
        brandCore: { document: { palette: { colors: [
          { id: "c1", name: "", hex: "vermelho", role: "accent" }
        ] } } }
      }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("palette.colors.0.hex")
      expect(json.dig("error", "details")).to include("palette.colors.0.hex", "palette.colors.0.name")
      expect(BrandCore.find_by(organization: organization).document).to eq({})
    end

    it "mantém os papéis de estilo fixos e limita os valores" do
      patch "/brand-core", headers: headers, as: :json, params: {
        brandCore: { document: { styles: { roles: [
          { key: "title", size: 999, weight: 800, font: "display", transform: "uppercase" },
          { key: "inventado", size: 12 }
        ] } } }
      }

      roles = json["document"]["styles"]["roles"]
      expect(roles.length).to eq(7)
      title = roles.find { |r| r["key"] == "title" }
      expect(title).to include("size" => 200, "weight" => 800, "transform" => "uppercase")
    end

    it "guarda o status de cada fato — o portão dos pendentes" do
      patch "/brand-core", headers: headers, as: :json, params: {
        brandCore: { document: { facts: { items: [
          { id: "f1", kind: "price", label: "Combo", value: "R$ 39", status: "confirmed" },
          { id: "f2", kind: "promotion", label: "Setembro", value: "20% off", status: "pendente?" },
          { id: "f3", kind: "hours", label: "Loja", status: "confirmed", hours: { mon: "9h–18h", sun: "" } }
        ] } } }
      }

      expect(response).to have_http_status(:ok)
      items = json["document"]["facts"]["items"]
      expect(items.map { |i| i["status"] }).to eq(%w[confirmed pending confirmed])
      expect(items.last["hours"]).to include("mon" => "9h–18h", "sun" => nil)
      expect(json["pendingFacts"]).to eq(1)
    end

    it "avisa quem mais estiver com a marca aberta" do
      expect {
        patch "/brand-core", headers: headers.merge("X-Client-Id" => "aba-1"), as: :json,
          params: { brandCore: { document: { voice: { essence: "Direta." } } } }
      }.to have_broadcasted_to(organization).from_channel(BrandCoreChannel)
        .with(hash_including("event" => "updated", "clientId" => "aba-1", "accountId" => account.id))
    end

    it "não alcança a marca de outra organização" do
      outra = create(:brand_core, :complete)

      patch "/brand-core", headers: headers, as: :json,
        params: { brandCore: { document: { identity: { name: "Invasor" } } } }

      expect(outra.reload.document["identity"]["name"]).to eq("Pão da Vila")
      expect(BrandCore.find_by(organization: organization).document["identity"]["name"]).to eq("Invasor")
    end
  end

  describe "POST /brand-core/publish" do
    it "recusa sem o mínimo obrigatório, dizendo o que falta" do
      create(:brand_core, organization: organization)

      expect { post "/brand-core/publish", headers: headers }.not_to change(BrandCoreVersion, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("brandIncomplete")
      expect(json.dig("error", "details", "required")).to include("identity.name", "palette.accent", "voice.essence")
    end

    it "publica a primeira versão e libera a geração" do
      create(:brand_core, :complete, organization: organization)

      expect {
        post "/brand-core/publish", headers: headers
      }.to change(BrandCoreVersion, :count).by(1)
        .and have_broadcasted_to(organization).from_channel(BrandCoreChannel)
        .with(hash_including("event" => "published"))

      expect(response).to have_http_status(:ok)
      expect(json["status"]).to eq("published")
      expect(json["currentVersion"]).to eq(1)
      expect(json["readyForGeneration"]).to be(true)
      expect(json["generationBlockers"]).to eq([])
      expect(json["publishedDocument"]["identity"]["name"]).to eq("Pão da Vila")
      expect(json["hasUnpublishedChanges"]).to be(false)
    end

    it "não cria versão quando nada mudou" do
      create(:brand_core, :published, organization: organization)

      expect { post "/brand-core/publish", headers: headers }.not_to change(BrandCoreVersion, :count)
      expect(response).to have_http_status(:ok)
    end

    it "gera versão nova com o que mudou, depois da primeira publicação" do
      brand_core = create(:brand_core, :published, organization: organization)

      patch "/brand-core", headers: headers, as: :json, params: {
        brandCore: { document: { voice: { essence: "Fala de padeiro.", tones: [ "warm" ] } } }
      }
      expect(json["hasUnpublishedChanges"]).to be(true)

      post "/brand-core/publish", headers: headers

      expect(json["currentVersion"]).to eq(2)
      version = brand_core.versions.first
      expect(version.number).to eq(2)
      expect(version.account).to eq(account)
      expect(version.change_list).to include("section" => "voice", "path" => "voice.essence", "kind" => "changed")
    end
  end

  describe "GET /brand-core/versions" do
    it "lista o histórico: quem, quando e o quê" do
      brand_core = create(:brand_core, :published, organization: organization)
      brand_core.versions.create!(account: account, number: 1, snapshot: brand_core.document, change_list: [])
      brand_core.versions.create!(
        account: nil, number: 2, snapshot: brand_core.document,
        change_list: [ { "section" => "palette", "path" => "palette.colors.c9", "kind" => "added" } ]
      )

      get "/brand-core/versions", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["versions"].map { |v| v["number"] }).to eq([ 2, 1 ])
      expect(json["versions"].last["account"]).to eq("id" => account.id, "name" => account.name)
      expect(json["versions"].first["account"]).to be_nil
      expect(json["versions"].first["changedSections"]).to eq([ "palette" ])
      expect(json["versions"].first["createdAt"]).to be_a(Integer)
    end
  end
end
