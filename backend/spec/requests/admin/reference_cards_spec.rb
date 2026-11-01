require "rails_helper"

RSpec.describe "Admin: banco de referências", type: :request do
  let(:staff) { create(:account, :staff) }
  let(:headers) { auth_headers(staff) }

  def upload(name, type) = fixture_file_upload(name, type)

  describe "acesso" do
    let(:card) { create(:reference_card, :analyzed) }

    it "responde 404 para quem não é staff — como se a área não existisse" do
      member = auth_headers(create(:account))

      [
        -> { get "/admin/reference-cards", headers: member },
        -> { get "/admin/reference-cards/#{card.id}", headers: member },
        -> { get "/admin/reference-cards/#{card.id}/thumbnail", headers: member },
        -> { post "/admin/reference-cards/#{card.id}/publish", headers: member },
        -> { patch "/admin/reference-cards/#{card.id}", headers: member, params: { referenceCard: { niche: "pet" } }, as: :json }
      ].each do |request|
        request.call
        expect(response).to have_http_status(:not_found)
        expect(json.dig("error", "code")).to eq("notFound")
      end
      expect(card.reload.niche).to eq("food_beverage")
    end

    it "responde 404 (não 401) sem sessão" do
      get "/admin/reference-cards"

      expect(response).to have_http_status(:not_found)
    end

    it "conta como staff no /me só a conta da Vekoo" do
      get "/me", headers: headers
      expect(json.dig("account", "staff")).to be(true)

      get "/me", headers: auth_headers(create(:account))
      expect(json.dig("account", "staff")).to be(false)
    end
  end

  describe "POST /admin/reference-cards" do
    it "cadastra com as imagens, gera a miniatura e põe a análise na fila" do
      expect {
        post "/admin/reference-cards", headers: headers, params: {
          images: [ upload("foto.png", "image/png"), upload("logo.jpg", "image/jpeg") ],
          url: "https://www.instagram.com/p/C0de/", channel: "Padoca do Vale", niche: "food_beverage", size: "local",
          bannedTerms: [ "Padoca do Vale" ], baselineMedian: "320"
        }
      }.to have_enqueued_job(AnalyzeReferenceJob)

      expect(response).to have_http_status(:created)
      card = ReferenceCard.find(json["id"])
      expect(card).to have_attributes(status: "draft", analysis_status: "pending", niche: "food_beverage", size: "local", curated_by: staff)
      expect(card.originals.count).to eq(2)
      expect(card.thumbnail).to be_attached
      expect(card.source).to eq("url" => "https://www.instagram.com/p/C0de/", "channel" => "@padocadovale", "bannedTerms" => [ "Padoca do Vale" ])
      expect(card.analysis.dig("metrics", "baselineMedian")).to eq(320)
      expect(json).to include("hasThumbnail" => true, "originalsCount" => 2)
    end

    it "baixa a imagem do link direto quando não vem arquivo" do
      allow(References::FetchImage).to receive(:call).with("https://cdn.exemplo.com/post.png")
        .and_return(References::FetchImage::Result.new(data: file_fixture("foto.png").binread, content_type: "image/png", filename: "post.png"))

      post "/admin/reference-cards", headers: headers, params: { url: "https://cdn.exemplo.com/post.png" }

      expect(response).to have_http_status(:created)
      expect(ReferenceCard.find(json["id"]).originals.first.filename.to_s).to eq("post.png")
    end

    it "diz o que falta ou não serve" do
      post "/admin/reference-cards", headers: headers, params: {}
      expect(json.dig("error", "code")).to eq("imagesRequired")

      post "/admin/reference-cards", headers: headers, params: { images: [ upload("documento.txt", "image/png") ] }
      expect(json.dig("error", "code")).to eq("imageInvalid")

      post "/admin/reference-cards", headers: headers, params: { images: Array.new(11) { upload("foto.png", "image/png") } }
      expect(json.dig("error", "code")).to eq("tooManyImages")

      allow(References::FetchImage).to receive(:call).and_raise(References::FetchImage::Refused.new("urlNotImage"))
      post "/admin/reference-cards", headers: headers, params: { url: "https://www.instagram.com/p/C0de/" }
      expect(json.dig("error", "code")).to eq("urlNotImage")
      expect(json.dig("error", "message")).to include("print")

      expect(ReferenceCard.count).to eq(0)
    end
  end

  describe "GET /admin/reference-cards" do
    let!(:strong) { create(:reference_card, :published) }
    let!(:review) { create(:reference_card, :analyzed, niche: "pet", analysis: attributes_for(:reference_card, :analyzed)[:analysis].merge("metrics" => {})) }
    let!(:draft) { create(:reference_card) }

    it "lista em resumo, com contagem por status e paginação" do
      get "/admin/reference-cards", headers: headers, params: { per: 2 }

      expect(json["referenceCards"].length).to eq(2)
      expect(json["meta"]).to include("total" => 3, "page" => 1, "per" => 2)
      expect(json["meta"]["counts"]).to eq("published" => 1, "in_review" => 1, "draft" => 1)
      expect(json["referenceCards"].first).not_to have_key("analysis")
      expect(json["referenceCards"].first).not_to have_key("source")
    end

    it "filtra por status, nicho e busca no texto da análise" do
      get "/admin/reference-cards", headers: headers, params: { status: "in_review,published", niche: "pet" }
      expect(json["referenceCards"].map { |c| c["id"] }).to eq([ review.id ])

      get "/admin/reference-cards", headers: headers, params: { q: "luz natural" }
      expect(json["referenceCards"].map { |c| c["id"] }).to match_array([ strong.id, review.id ])
    end

    it "ordena por engajamento relativo, sem métrica por último" do
      get "/admin/reference-cards", headers: headers, params: { sort: "relativeEngagement", dir: "desc" }

      expect(json["referenceCards"].map { |c| c["id"] }.first).to eq(strong.id)
      expect(json["referenceCards"].last["relativeEngagement"]).to be_nil
    end
  end

  describe "revisão" do
    let(:card) { create(:reference_card, :analyzed) }

    def save(attributes)
      patch "/admin/reference-cards/#{card.id}", headers: headers, as: :json, params: { referenceCard: attributes }
    end

    it "edita a análise e refaz o vetor quando o conteúdo muda" do
      analysis = card.analysis.deep_merge("copy" => { "tone" => "Seco e direto." })

      expect { save(analysis: analysis, archetypes: %w[bold_energetic]) }.to have_enqueued_job(EmbedReferenceJob).with(card.id)

      expect(response).to have_http_status(:ok)
      expect(json.dig("analysis", "copy", "tone")).to eq("Seco e direto.")
      expect(json["archetypes"]).to eq(%w[bold_energetic])
    end

    it "não refaz o vetor quando só a fonte muda" do
      expect { save(source: { bannedTerms: [ "Outra Marca" ] }) }.not_to have_enqueued_job(EmbedReferenceJob)

      expect(card.reload.source).to include("bannedTerms" => [ "Outra Marca" ], "channel" => "@padariaexemplo")
    end

    it "aponta o erro no caminho do campo" do
      save(analysis: card.analysis.deep_merge("hook" => { "type" => "grito" }))

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "details")).to have_key("analysis.hook.type")
    end

    it "não edita enquanto a análise roda nem com o card arquivado" do
      card.update_columns(analysis_status: "running")
      save(niche: "pet")
      expect(response).to have_http_status(:conflict)

      card.update_columns(analysis_status: "done", status: "archived", archived_reason: "Fora do padrão.")
      save(niche: "pet")
      expect(json.dig("error", "code")).to eq("cardArchived")
    end

    it "publica o card completo e sobe a versão a cada edição depois disso" do
      post "/admin/reference-cards/#{card.id}/publish", headers: headers

      expect(json).to include("status" => "published", "version" => 1)
      expect(json["publishedAt"]).to be_present

      save(objective: "launch")
      expect(json["version"]).to eq(2)
    end

    it "não publica análise que cita a origem" do
      card.update!(analysis: card.analysis.deep_merge("copy" => { "cta" => "Chama para seguir @padariaexemplo." }))

      post "/admin/reference-cards/#{card.id}/publish", headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "details", "analysis.copy.cta").join).to include("padariaexemplo")
      expect(card.reload.status).to eq("in_review")
    end

    it "rejeita com motivo e reabre" do
      post "/admin/reference-cards/#{card.id}/reject", headers: headers
      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "details")).to have_key("archivedReason")

      post "/admin/reference-cards/#{card.id}/reject", headers: headers, params: { reason: "Depende de celebridade." }
      expect(json).to include("status" => "archived", "archivedReason" => "Depende de celebridade.")

      post "/admin/reference-cards/#{card.id}/reopen", headers: headers
      expect(json).to include("status" => "in_review", "archivedReason" => nil)
    end

    it "mostra os achados ao abrir o card" do
      card.update!(analysis: card.analysis.deep_merge("whyItWorks" => "Funciona como no site padaria.com.br"))

      get "/admin/reference-cards/#{card.id}", headers: headers

      expect(json["findings"]).to include(hash_including("code" => "leak", "path" => "whyItWorks.mechanism", "kind" => "url"))
    end
  end

  describe "análise que falhou" do
    let(:card) do
      create(:reference_card, analysis_status: "failed", analysis_error: { "code" => "refused" }).tap do |card|
        card.originals.attach(io: file_fixture("foto.png").open, filename: "a.png", content_type: "image/png")
      end
    end

    it "roda de novo" do
      expect { post "/admin/reference-cards/#{card.id}/retry", headers: headers }.to have_enqueued_job(AnalyzeReferenceJob).with(card.id)

      expect(json).to include("analysisStatus" => "pending", "analysisError" => nil)
    end

    it "só a que falhou" do
      done = create(:reference_card, :analyzed, analysis_status: "done")

      post "/admin/reference-cards/#{done.id}/retry", headers: headers

      expect(json.dig("error", "code")).to eq("analysisNotRetryable")
    end
  end

  it "serve a miniatura daqui, privada" do
    card = create(:reference_card).tap do |c|
      c.thumbnail.attach(io: StringIO.new(References::Images.thumbnail(file_fixture("foto.png").binread)), filename: "m.jpg", content_type: "image/jpeg")
    end

    get "/admin/reference-cards/#{card.id}/thumbnail", headers: headers

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("image/jpeg")
    expect(response.headers["Cache-Control"]).to include("private")
  end
end
