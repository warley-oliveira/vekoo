require "rails_helper"

RSpec.describe "Admin: importação do Instagram", type: :request do
  around { |example| with_instagram_env { example.run } }
  before do
    InstagramGraph::TokenStatus.reset!
    allow(InstagramGraph::TokenStatus).to receive(:call).and_return(state: "ok", missingScopes: [])
  end

  let(:staff) { create(:account, :staff) }
  let(:headers) { auth_headers(staff) }

  it "responde 404 a quem não é staff" do
    member = auth_headers(create(:account))
    import = create(:reference_import)

    get "/admin/reference-imports", headers: member
    expect(response).to have_http_status(:not_found)
    post "/admin/reference-imports", headers: member, params: { handles: "padoca" }
    expect(response).to have_http_status(:not_found)
    get "/admin/reference-imports/#{import.id}", headers: member
    expect(response).to have_http_status(:not_found)
    get "/admin/instagram/status"
    expect(response).to have_http_status(:not_found)
  end

  describe "POST /admin/reference-imports" do
    it "lê os @ do jeito que vierem, uma conta por @, e põe cada uma na fila" do
      expect {
        post "/admin/reference-imports", headers: headers, params: {
          handles: "@Padoca.Exemplo, https://www.instagram.com/outra_conta/?hl=pt\nterceira  @padoca.exemplo", niche: "food_beverage", size: "local"
        }
      }.to have_enqueued_job(ImportReferenceAccountJob).exactly(3).times

      expect(response).to have_http_status(:created)
      expect(json["handles"]).to eq(%w[outra_conta padoca.exemplo terceira])
      expect(json).to include("niche" => "food_beverage", "size" => "local", "running" => true)
    end

    it "diz quais itens não são @ e não cria nada" do
      post "/admin/reference-imports", headers: headers, params: { handles: "padoca, nome-com-hifen, açaí, @ok" }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("invalidHandles")
      expect(json.dig("error", "details", "handles")).to eq(%w[nome-com-hifen açaí])
      expect(ReferenceImport.count).to eq(0)
    end

    it "no máximo 20 contas por lote" do
      post "/admin/reference-imports", headers: headers, params: { handles: (1..21).map { |n| "conta#{n}" }.join("\n") }

      expect(json.dig("error", "code")).to eq("tooManyHandles")
      expect(json.dig("error", "message")).to include("20")
    end

    it "sem configuração ou com o token vencido, não importa" do
      with_instagram_env("META_ACCESS_TOKEN" => nil) do
        post "/admin/reference-imports", headers: headers, params: { handles: "padoca" }
      end
      expect(json.dig("error", "code")).to eq("instagramNotConfigured")

      allow(InstagramGraph::TokenStatus).to receive(:call).and_return(state: "invalid")
      post "/admin/reference-imports", headers: headers, params: { handles: "padoca" }
      expect(json.dig("error", "code")).to eq("instagramTokenInvalid")
    end

    it "apaga os lotes de mais de 30 dias — o card que saiu deles fica" do
      old = create(:reference_import, created_at: 31.days.ago)
      account = create(:reference_import_account, reference_import: old)
      card = create(:reference_card, :analyzed)
      account.candidates.create!(ig_media_id: "1", media_type: "IMAGE", status: "carded", reference_card: card)

      post "/admin/reference-imports", headers: headers, params: { handles: "padoca" }

      expect(ReferenceImport.exists?(old.id)).to be(false)
      expect(ReferenceCandidate.count).to eq(0)
      expect(card.reload).to be_persisted
    end
  end

  describe "o lote" do
    let(:import) { create(:reference_import, niche: "food_beverage", size: "local") }
    let(:account) do
      create(:reference_import_account, reference_import: import, username: "padoca.exemplo", status: "done",
        name: "Padoca Exemplo", baseline_median: 115, fetched_at: Time.zone.parse("2026-10-27 10:00"))
    end
    let!(:strong) { account.candidates.create!(ig_media_id: "100", media_type: "IMAGE", permalink: "https://www.instagram.com/p/100/", like_count: 300, comments_count: 30, relative_engagement: 2.87, posted_at: 10.days.ago) }
    let!(:reel) { account.candidates.create!(ig_media_id: "300", media_type: "VIDEO", product_type: "REELS", permalink: "https://www.instagram.com/p/300/", like_count: 120, comments_count: 10, relative_engagement: 1.13, posted_at: 12.days.ago, partial: true) }
    let!(:hidden) { account.candidates.create!(ig_media_id: "400", media_type: "IMAGE", permalink: "https://www.instagram.com/p/400/", comments_count: 4, posted_at: 9.days.ago) }

    it "mostra as contas com os candidatos do melhor para o pior, com destaque" do
      get "/admin/reference-imports/#{import.id}", headers: headers

      candidates = json["accounts"].sole["candidates"]
      expect(candidates.map { |c| c["igMediaId"] }).to eq(%w[100 300 400])
      expect(candidates.first).to include("highlight" => true, "format" => "static", "partial" => false)
      expect(candidates.second).to include("highlight" => false, "format" => "reels", "partial" => true)
      expect(candidates.last).to include("relativeEngagement" => nil, "likeCount" => nil)
      expect(json["counts"]).to include("candidates" => 3, "highlighted" => 1, "carded" => 0)
      expect(response.body).not_to include("caption")
    end

    it "os escolhidos viram card em rascunho, com fonte, termos proibidos e métricas, e vão buscar a mídia" do
      expect {
        post "/admin/reference-imports/#{import.id}/analyze", headers: headers, as: :json, params: { candidateIds: [ strong.id, reel.id ] }
      }.to have_enqueued_job(FetchInstagramReferenceJob).once

      # Uma busca por conta: os dois cards da mesma conta vão no mesmo job.
      expect(ActiveJob::Base.queue_adapter.enqueued_jobs.last[:args]).to match_array(json["created"])
      cards = ReferenceCard.where(id: json["created"]).index_by { |card| card.source["igMediaId"] }
      expect(cards["100"]).to have_attributes(status: "draft", analysis_status: "pending", niche: "food_beverage", size: "local",
        format: "static", partial_analysis: false, curated_by: staff)
      expect(cards["100"].source).to eq("url" => "https://www.instagram.com/p/100/", "channel" => "@padoca.exemplo",
        "bannedTerms" => [ "padoca.exemplo", "Padoca Exemplo" ], "igMediaId" => "100")
      expect(cards["100"].analysis["metrics"]).to include("likes" => 300, "comments" => 30, "baselineMedian" => 115, "relativeEngagement" => 2.87,
        "collectedAt" => "2026-10-27")
      expect(cards["300"]).to have_attributes(format: "reels", partial_analysis: true)
      expect(strong.reload).to have_attributes(status: "carded", reference_card_id: cards["100"].id)
    end

    it "post que já virou card não vira outro" do
      post "/admin/reference-imports/#{import.id}/analyze", headers: headers, as: :json, params: { candidateIds: [ strong.id ] }
      strong.update!(status: "pending", reference_card: nil)

      expect {
        post "/admin/reference-imports/#{import.id}/analyze", headers: headers, as: :json, params: { candidateIds: [ strong.id ] }
      }.not_to change(ReferenceCard, :count)
      expect(strong.reload.status).to eq("carded")
    end

    it "sem escolha, nada a analisar" do
      post "/admin/reference-imports/#{import.id}/analyze", headers: headers, as: :json, params: { candidateIds: [] }

      expect(json.dig("error", "code")).to eq("nothingSelected")
    end

    it "tenta de novo a conta que bateu no limite — não a que não existe" do
      limited = create(:reference_import_account, reference_import: import, username: "limitada", status: "error", error_code: "rateLimited")
      missing = create(:reference_import_account, reference_import: import, username: "sumida", status: "error", error_code: "accountUnavailable")

      expect { post "/admin/reference-imports/#{import.id}/accounts/#{limited.id}/retry", headers: headers }
        .to have_enqueued_job(ImportReferenceAccountJob).with(limited.id)
      expect(limited.reload.status).to eq("pending")

      post "/admin/reference-imports/#{import.id}/accounts/#{missing.id}/retry", headers: headers
      expect(json.dig("error", "code")).to eq("importNotRetryable")
    end

    it "lista os lotes recentes com o estado do token" do
      get "/admin/reference-imports", headers: headers

      expect(json["referenceImports"].sole).to include("id" => import.id, "handles" => [ "padoca.exemplo" ])
      expect(json["instagram"]).to eq("state" => "ok", "missingScopes" => [])
    end
  end

  it "o card do Instagram que falhou busca a mídia de novo" do
    card = create(:reference_card, analysis_status: "failed", analysis_error: { "code" => "mediaUnavailable" },
      source: { "url" => "https://www.instagram.com/p/9/", "channel" => "@padoca.exemplo", "igMediaId" => "9" })

    expect { post "/admin/reference-cards/#{card.id}/retry", headers: headers }.to have_enqueued_job(FetchInstagramReferenceJob).with(card.id)
    expect(json).to include("analysisStatus" => "pending", "instagram" => true)
  end

  it "mostra o estado do token" do
    get "/admin/instagram/status", headers: headers

    expect(json).to eq("state" => "ok", "missingScopes" => [])
  end
end
