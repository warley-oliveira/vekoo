require "rails_helper"

# O editor de peças, pelo lado do servidor: salvamento automático com
# conflito entre abas, operações conferidas, troca de layout sem perder texto,
# histórico e restaurar.
RSpec.describe "Editor de peças", type: :request do
  include ActiveJob::TestHelper

  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, :published, organization: organization) }
  let(:piece) do
    document = PieceDocument::Build.from_agent({
      "format" => "feed_portrait",
      "slides" => [ { "layout" => "product-card", "content" => { "title" => "Pão de queijo", "price" => "R$ 6", "body" => "Saindo agora." } } ],
      "caption" => { "text" => "Fornada nova.", "hashtags" => [ "#pao" ] }
    }, brand_core: brand)
    create(:piece, brand_core: brand, organization: organization, engine_id: nil, format: "feed_portrait", status: "draft")
      .tap { |p| p.record_version!(document, source: "generation") }
  end
  let(:base) { "/brands/#{brand.id}/pieces/#{piece.id}" }
  let(:slide_id) { piece.document["slides"][0]["id"] }

  def ops(*list, base_version: piece.reload.current_version_id)
    post "#{base}/operations", headers: headers, as: :json, params: { baseVersionId: base_version, operations: list }
  end

  describe "PATCH document" do
    it "grava uma versão nova, avisa de texto longo sem bloquear e enfileira o render" do
      document = piece.document.deep_dup
      document["slides"][0]["blocks"].find { |b| b["slot"] == "title" }["content"] = "x" * 80

      expect {
        patch "#{base}/document", headers: headers, as: :json,
          params: { baseVersionId: piece.current_version_id, document: document }
      }.to have_enqueued_job(RenderPieceJob)

      expect(response).to have_http_status(:ok)
      expect(json["warnings"]).to eq([ { "path" => "slides[0].blocks[0].content", "code" => "tooLong", "detail" => "80/50" } ])
      expect(piece.reload.versions.map(&:source)).to eq(%w[generation user_edit])
      expect(json["versionId"]).to eq(piece.current_version_id)
    end

    it "a segunda aba, com a versão velha, leva 409 e não sobrescreve" do
      old = piece.current_version_id
      patch "#{base}/document", headers: headers, as: :json, params: { baseVersionId: old, document: piece.document }
      expect(response).to have_http_status(:ok)

      patch "#{base}/document", headers: headers, as: :json, params: { baseVersionId: old, document: piece.reload.document }
      expect(response).to have_http_status(:conflict)
      expect(json.dig("error", "code")).to eq("conflict")
      expect(piece.reload.versions.count).to eq(2)
    end

    it "recusa documento inválido apontando o caminho" do
      document = piece.document.deep_dup
      document["slides"][0]["background"] = { "type" => "color", "colorToken" => "vermelho" }
      document["slides"][0]["layoutId"] = "inventado"

      patch "#{base}/document", headers: headers, as: :json, params: { baseVersionId: piece.current_version_id, document: document }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "details").keys).to include("slides[0].layoutId")
    end

    it "peça aprovada não se edita" do
      piece.update!(status: "approved")
      patch "#{base}/document", headers: headers, as: :json, params: { baseVersionId: piece.current_version_id, document: piece.document }
      expect(json.dig("error", "code")).to eq("pieceLocked")
    end
  end

  describe "POST operations" do
    it "trocar de layout não perde texto; voltar devolve o que não cabia" do
      ops({ op: "set_layout", slideId: slide_id, layoutId: "text-only-solid" })
      slide = json["piece"]["document"]["slides"][0]
      expect(slide["blocks"].map { |b| b["slot"] }).to eq(%w[title body logo])
      expect(slide["orphans"].map { |b| b["content"] }).to include("R$ 6")
      expect(piece.reload.current_version.source).to eq("layout_change")

      ops({ op: "set_layout", slideId: slide_id, layoutId: "product-card" })
      slide = json["piece"]["document"]["slides"][0]
      expect(slide["blocks"].find { |b| b["slot"] == "price" }["content"]).to eq("R$ 6")
      expect(slide["orphans"]).to be_empty
    end

    it "aplica as válidas, descarta as inválidas com o motivo e recusa a reservada" do
      ops(
        { op: "set_size_step", slideId: slide_id, slot: "title", sizeStep: -1 },
        { op: "set_background", slideId: slide_id, type: "color", colorToken: "vermelho" },
        { op: "set_text", slideId: slide_id, slot: "subtitulo", content: "Oi" },
        { op: "request_image", slideId: slide_id, slot: "image", prompt: "pão" }
      )

      expect(json["applied"].map { |op| op["op"] }).to eq([ "set_size_step" ])
      expect(json["rejected"].map { |r| [ r["op"]["op"], r["reason"] ] }).to eq([
        [ "set_background", "unknownToken" ], [ "set_text", "unknownSlot" ], [ "request_image", "reserved" ]
      ])
      title = json["piece"]["document"]["slides"][0]["blocks"].find { |b| b["slot"] == "title" }
      expect(title["sizeStep"]).to eq(-1)
    end

    it "foto de outra marca é recusada; mostrar o selo cria o bloco" do
      foreign = create(:brand_asset, :photo)
      ops({ op: "set_image", slideId: slide_id, slot: "image", assetId: foreign.id })
      expect(json["rejected"].first["reason"]).to eq("invalid")

      ops({ op: "set_visible", slideId: slide_id, slot: "badge", visible: true })
      expect(json["piece"]["document"]["slides"][0]["blocks"].map { |b| b["slot"] }).to include("badge")
    end
  end

  describe "histórico" do
    it "lista o que mudou em códigos e restaurar cria versão nova" do
      first = piece.current_version
      ops({ op: "set_text", slideId: slide_id, slot: "title", content: "Pão de queijo quente" })

      get "#{base}/versions", headers: headers
      expect(json["versions"].first["changes"]).to eq([ { "kind" => "text", "slot" => "title", "slide" => 1 } ])
      expect(json["versions"].last["changes"]).to eq([ { "kind" => "created" } ])

      post "#{base}/versions/#{first.id}/restore", headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(piece.reload.versions.map(&:source)).to eq(%w[generation user_edit restore])
      expect(piece.document.dig("slides", 0, "blocks").find { |b| b["slot"] == "title" }["content"]).to eq("Pão de queijo")
    end
  end
end
