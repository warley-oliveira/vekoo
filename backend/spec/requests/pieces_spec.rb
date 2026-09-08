require "rails_helper"

RSpec.describe "Peças e motores", type: :request do
  include ActiveJob::TestHelper
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let!(:brand_core) { create(:brand_core, :published, organization: organization) }

  describe "GET /engines" do
    it "devolve o catálogo no idioma da requisição, com dimensões" do
      get "/engines", headers: headers.merge("Accept-Language" => "en")

      expect(response).to have_http_status(:ok)
      expect(json["engines"].length).to be >= 8
      statement = json["engines"].find { |e| e["id"] == "statement" }
      expect(statement["name"]).to eq("Statement")
      expect(statement["fields"].map { |f| f["id"] }).to include("phrase", "price", "background")
      expect(statement["fields"].find { |f| f["id"] == "background" }).to include("source" => "palette.backgrounds")
      expect(json["dimensions"]["story"]).to eq("width" => 1080, "height" => 1920)
    end
  end

  describe "POST /engines/:id/preview" do
    it "devolve o PNG do primeiro quadro com os valores em edição" do
      post "/engines/statement/preview", headers: headers, as: :json,
        params: { piece: { format: "story", values: { phrase: "Hoje tem pão", price: "fato-preco" } } }

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("image/png")
      result = PngInspector.call(StringIO.new(response.body))
      expect([ result.width, result.height ]).to eq([ 1080, 1920 ])
    end

    it "explica quando a ref está pendente, nomeando o fato" do
      post "/engines/statement/preview", headers: headers, as: :json,
        params: { piece: { format: "post", values: { phrase: "Hoje tem pão", price: "fato-preco-pendente" } } }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("refPending")
      expect(json.dig("error", "message")).to include("Croissant de amêndoas")
      expect(json.dig("error", "details", "factId")).to eq("fato-preco-pendente")
    end

    it "aponta o campo inválido" do
      post "/engines/statement/preview", headers: headers, as: :json,
        params: { piece: { format: "post", values: { phrase: "" } } }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("values.phrase")
    end
  end

  describe "POST /pieces" do
    it "cria a peça na fila e enfileira a renderização" do
      expect {
        post "/pieces", headers: headers, as: :json, params: {
          piece: { engineId: "preco_heroi", format: "post", values: { label: "Pão rústico", price: "fato-preco" } }
        }
      }.to change(Piece, :count).by(1).and have_enqueued_job(RenderPieceJob)

      expect(response).to have_http_status(:created)
      expect(json).to include("status" => "queued", "engineId" => "preco_heroi", "title" => "Preço herói")
      expect(json["values"]).to eq("label" => "Pão rústico", "price" => "fato-preco")
    end

    it "recusa valores fora do manifesto apontando o campo" do
      post "/pieces", headers: headers, as: :json, params: {
        piece: { engineId: "statement", format: "post", values: { phrase: "uma\nduas\ntrês\nquatro\ncinco" } }
      }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("values.phrase")
      expect(json.dig("error", "details", "values.phrase").first).to match(/linhas/)
    end

    it "recusa motor desconhecido" do
      post "/pieces", headers: headers, as: :json, params: { piece: { engineId: "inventado", values: {} } }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("engineUnknown")
    end

    it "recusa formato que o motor não sai" do
      post "/pieces", headers: headers, as: :json, params: {
        piece: { engineId: "promo_box", format: "story", values: EngineExamples.values("promo_box") }
      }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("format")
    end

    it "exige marca publicada" do
      brand_core.update!(status: "draft", published_document: nil)

      post "/pieces", headers: headers, as: :json, params: { piece: { engineId: "statement", values: { phrase: "x" } } }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("brandNotPublished")
    end
  end

  describe "GET /pieces" do
    it "lista as peças com o sinal de desatualizada quando o preço mudou" do
      piece = create(:piece, organization: organization, brand_core: brand_core)
      RenderPiece.new(piece).call
      create(:piece)

      get "/pieces", headers: headers
      expect(json["pieces"].map { |p| p["id"] }).to eq([ piece.id ])
      expect(json["pieces"].first).to include("status" => "ready", "stale" => false)
      expect(json["pieces"].first["images"].first["url"]).to start_with("/rails/active_storage/blobs/proxy/")

      # O preço mudou na marca publicada: a peça impressa com R$ 18 fica velha.
      document = brand_core.published_document.deep_dup
      document["facts"]["items"].first["value"] = "R$ 20"
      brand_core.update!(published_document: document, document: document, current_version: 2)

      get "/pieces", params: { stale: true }, headers: headers
      expect(json["pieces"].map { |p| p["id"] }).to eq([ piece.id ])
      expect(json["pieces"].first["staleRefs"].first).to include("factId" => "fato-preco", "previous" => "R$ 18", "current" => "R$ 20", "reason" => "changed")
      expect(json["pieces"].first["outdated"]).to be(true)
    end
  end

  describe "POST /pieces/:id/regenerate" do
    it "volta a peça para a fila com os mesmos valores" do
      piece = create(:piece, organization: organization, brand_core: brand_core, status: "failed", error: { "code" => "refPending" })

      expect { post "/pieces/#{piece.id}/regenerate", headers: headers }.to have_enqueued_job(RenderPieceJob).with(piece.id)

      expect(response).to have_http_status(:accepted)
      expect(json).to include("status" => "queued", "error" => nil)
    end
  end

  describe "DELETE /pieces/:id" do
    it "apaga a peça da própria organização e só ela" do
      mine = create(:piece, organization: organization, brand_core: brand_core)
      other = create(:piece)

      delete "/pieces/#{mine.id}", headers: headers
      expect(response).to have_http_status(:no_content)

      delete "/pieces/#{other.id}", headers: headers
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "renderização em segundo plano" do
    it "avisa a organização pelo canal quando a peça fica pronta" do
      piece = create(:piece, organization: organization, brand_core: brand_core)

      expect { RenderPieceJob.perform_now(piece.id) }
        .to have_broadcasted_to(organization).from_channel(PieceChannel)
        .with(hash_including("event" => "updated", "piece" => hash_including("id" => piece.id, "status" => "ready")))
    end
  end
end
