require "rails_helper"

# Os renderizadores sobre os documentos fixos (`spec/support/piece_fixtures`):
# cada layout em cada formato, títulos curtos e longos, com e sem logo, foto
# clara e escura. O libvips roda aqui; o Chromium só onde houver navegador
# (CHROME_PATH + FRONTEND_URL) — no CI ele fica de fora, com aviso.
RSpec.describe PieceRenderers do
  include ActiveJob::TestHelper

  let(:brand) { create(:brand_core, :published) }
  let(:photos) { PieceFixtures.synthetic_photos(brand) }

  def png_size(png)
    image = Vips::Image.new_from_buffer(png, "")
    [ image.width, image.height ]
  end

  describe "Libvips" do
    it "desenha todos os casos fixos, no tamanho exato do canvas, de documentos válidos" do
      renderer = PieceRenderers::Libvips.new(brand)
      cases = PieceFixtures.cases(brand, photos: photos)
      expect(cases.length).to be > 50

      cases.each do |fixture|
        expect(PieceDocument::Validator.call(fixture.document, brand_core: brand)).to be_valid, fixture.name
        canvas = fixture.document["canvas"]
        renderer.render(fixture.document).each do |slide|
          expect(png_size(slide["png"])).to eq([ canvas["width"], canvas["height"] ]), fixture.name
        end
      end
    end

    it "é determinístico: o mesmo documento dá os mesmos bytes" do
      fixture = PieceFixtures.cases(brand, photos: photos).find { |c| c.name == "hero-image-title-bottom--feed_portrait--longo" }
      first = PieceRenderers::Libvips.new(brand).render(fixture.document).first["png"]
      second = PieceRenderers::Libvips.new(brand).render(fixture.document).first["png"]
      expect(Digest::SHA256.hexdigest(first)).to eq(Digest::SHA256.hexdigest(second))
    end

    it "o ponto focal muda o recorte da foto" do
      fixture = PieceFixtures.cases(brand, photos: photos).find { |c| c.name == "hero-image-title-bottom--story--curto" }
      document = fixture.document.deep_dup
      image = document["slides"][0]["blocks"].find { |b| b["slot"] == "image" }
      renderer = PieceRenderers::Libvips.new(brand)

      # Foto 4:3 num story inteiro: sobra na horizontal — é ali que o ponto anda.
      image["focalPoint"] = { "x" => 0.0, "y" => 0.5 }
      left = renderer.render(document).first["png"]
      image["focalPoint"] = { "x" => 1.0, "y" => 0.5 }
      right = renderer.render(document).first["png"]
      expect(left).not_to eq(right)
    end
  end

  describe ".cover_rect" do
    it "centra o ponto focal quando dá e encosta na borda quando não dá" do
      expect(described_class.cover_rect(1600, 1200, 1080, 1350, { "x" => 0.5, "y" => 0.5 })).to include(x: 360, y: 0)
      expect(described_class.cover_rect(1600, 1200, 1080, 1350, { "x" => 0.0, "y" => 0.5 })).to include(x: 0)
      expect(described_class.cover_rect(1600, 1200, 1080, 1350, { "x" => 1.0, "y" => 0.5 })).to include(x: 720)
    end
  end

  describe RenderPieceDocument do
    let(:piece) do
      fixture = PieceFixtures.cases(brand, photos: photos).find { |c| c.name == "carousel-body--carousel--longo" }
      create(:piece, brand_core: brand, organization: brand.organization, engine_id: nil, format: "carousel", status: "draft")
        .tap { |p| p.record_version!(fixture.document, source: "generation") }
    end

    it "um PNG por lâmina, e a segunda vez reaproveita o que não mudou" do
      renders = described_class.new(piece, renderer: "libvips").call
      expect(renders.map(&:position)).to eq([ 0, 1, 2 ])
      expect(renders.map(&:width)).to all(eq(1080))
      blobs = renders.map { |r| r.file.blob_id }

      # Muda só a lâmina 2: as outras duas mantêm o arquivo.
      document = piece.document.deep_dup
      document["slides"][1]["blocks"].find { |b| b["slot"] == "title" }["content"] = "Outro título"
      piece.record_version!(document, source: "user_edit")
      again = described_class.new(piece.reload, renderer: "libvips").call

      expect(again.map { |r| r.file.blob_id }.values_at(0, 2)).to eq(blobs.values_at(0, 2))
      expect(again[1].file.blob_id).not_to eq(blobs[1])
      expect(piece.reload.provenance).to include("renderer" => "libvips", "frames" => 3)
    end

    it "o React sem navegador configurado falha limpo, com código" do
      allow(PieceRenderers::Chromium).to receive(:available?).and_return(false)
      expect(described_class.new(piece, renderer: "react").call).to be_nil
      expect(piece.reload.error).to include("code" => "renderFailed")
    end
  end

  describe "o payload de render", type: :request do
    let(:account) { create(:account, organization: brand.organization) }
    let(:piece) do
      fixture = PieceFixtures.cases(brand, photos: photos).find { |c| c.name == "product-card--feed_portrait--longo" }
      create(:piece, brand_core: brand, organization: brand.organization, engine_id: nil, format: "feed_portrait", status: "draft")
        .tap { |p| p.record_version!(fixture.document, source: "generation") }
    end

    it "o token abre só aquela versão, sem sessão" do
      version = piece.current_version
      get "/render/piece-versions/#{version.id}", params: { token: PieceRenderers.render_token(version) }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["document"]["slides"].length).to eq(1)
      expect(body["theme"]["colors"].keys).to eq(%w[primary secondary accent surface])
      expect(body["layouts"].first).to include("id" => "product-card", "geometry" => a_hash_including("default"))
      expect(body["assets"].keys).to eq([ photos[:light] ])

      get "/render/piece-versions/#{SecureRandom.uuid}", params: { token: PieceRenderers.render_token(version) }
      expect(response).to have_http_status(:not_found)
      get "/render/piece-versions/#{version.id}", params: { token: "inventado" }
      expect(response).to have_http_status(:not_found)
    end

    it "POST /pieces/:id/render enfileira com o renderizador escolhido, e a peça devolve os renders por renderizador" do
      headers = auth_headers(account)
      expect {
        post "/brands/#{brand.id}/pieces/#{piece.id}/render", params: { renderer: "libvips" }, headers: headers, as: :json
      }.to have_enqueued_job(RenderPieceJob).with(piece.id, "libvips")
      expect(response).to have_http_status(:accepted)

      post "/brands/#{brand.id}/pieces/#{piece.id}/render", params: { renderer: "photoshop" }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)

      perform_enqueued_jobs(only: RenderPieceJob)
      get "/brands/#{brand.id}/pieces/#{piece.id}", headers: headers
      body = JSON.parse(response.body)
      expect(body["renders"]["libvips"].map { |r| r["width"] }).to eq([ 1080 ])
      expect(body["images"].length).to eq(1)
    end
  end
end
