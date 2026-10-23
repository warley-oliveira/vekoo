require "rails_helper"

# As logos da marca: grupos de arquivos por variante, a principal escolhida
# no documento (e versionada com ele), o "regenerar" e o download.
RSpec.describe "Logos da marca", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, :published, organization: organization) }

  def upload(file, type, variant: "light", **params)
    post "/brands/#{brand.id}/assets", headers: headers,
      params: { file: fixture_file_upload(file, type), kind: "logo", variant: variant, **params }
    json
  end

  def choose(logo_id)
    patch "/brands/#{brand.id}", headers: headers, as: :json,
      params: { brand: { document: { assets: { primaryLogoId: logo_id } } } }
  end

  describe "enviar" do
    it "cada envio é uma logo nova; `logoId` junta a variante escura à mesma logo" do
      light = upload("logo-transparente.png", "image/png")
      dark = upload("logo-transparente.png", "image/png", variant: "dark", logoId: light["logoId"])
      other = upload("logo-transparente.png", "image/png")

      expect(dark["logoId"]).to eq(light["logoId"])
      expect(other["logoId"]).not_to eq(light["logoId"])
      expect(brand.reload.logos.count).to eq(2)
      expect(brand.logos.find_logo(light["logoId"]).variants.keys).to contain_exactly("light", "dark")
    end

    it "`primary` torna a enviada a principal — no rascunho, não na publicada" do
      logo = upload("logo-transparente.png", "image/png", primary: true)

      expect(brand.reload.full_document.dig("assets", "primaryLogoId")).to eq(logo["logoId"])
      expect(brand.published_document.dig("assets", "primaryLogoId")).to be_blank
      expect(brand.unpublished_changes).to include("section" => "assets", "path" => "assets.primaryLogoId", "kind" => "changed")
    end

    it "recusa logo acima de 5 MB" do
      big = Rack::Test::UploadedFile.new(StringIO.new("0" * (5.megabytes + 1)), "image/png", original_filename: "grande.png")
      post "/brands/#{brand.id}/assets", headers: headers, params: { file: big, kind: "logo", variant: "light" }
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "escolher a principal" do
    it "só aceita logo desta marca" do
      foreign = create(:brand_asset, brand_core: create(:brand_core))
      choose(foreign.logo_id)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("assets.primaryLogoId")
    end

    it "vai para o histórico como \"ativos\" ao publicar, e restaurar devolve a principal da versão" do
      first = upload("logo-transparente.png", "image/png", primary: true)
      post "/brands/#{brand.id}/publish", headers: headers
      second = upload("logo-transparente.png", "image/png", primary: true)
      post "/brands/#{brand.id}/publish", headers: headers

      version = brand.reload.versions.find_by(number: 3)
      expect(version.change_list.map { |change| change["section"] }).to eq([ "assets" ])
      expect(brand.primary_logo(brand.published_document).id).to eq(second["logoId"])

      post "/brands/#{brand.id}/versions/#{brand.versions.find_by(number: 2).id}/restore", headers: headers
      expect(json["document"]["assets"]["primaryLogoId"]).to eq(first["logoId"])
      # Nenhum arquivo some: só a referência muda.
      expect(brand.reload.logos.count).to eq(2)
    end

    it "o motor lê a principal da versão publicada, nunca a do rascunho" do
      published = upload("logo-transparente.png", "image/png", primary: true)
      post "/brands/#{brand.id}/publish", headers: headers
      upload("logo-opaco.png", "image/png", primary: true)

      tokens = Engines::Tokens.new(brand.reload)
      expect(brand.primary_logo(tokens.document).id).to eq(published["logoId"])
      expect(tokens.logo(:light)).to be_present
    end
  end

  describe "regenerar" do
    it "marca sem logo nenhuma fica com a primeira opção, como no onboarding" do
      post "/brands/#{brand.id}/logos/generate", headers: headers

      expect(brand.reload.full_document.dig("assets", "primaryLogoId")).to eq(json["logoIds"].first)
    end

    it "desenha três opções novas sem apagar as antigas nem trocar a principal" do
      kept = upload("logo-transparente.png", "image/png", primary: true)

      post "/brands/#{brand.id}/logos/generate", headers: headers

      expect(response).to have_http_status(:created)
      expect(json["logoIds"].length).to eq(3)
      logos = json["brandCore"]["logos"]
      expect(logos.length).to eq(4)
      expect(logos.find { |logo| logo["primary"] }["id"]).to eq(kept["logoId"])
      expect(logos.select { |logo| logo["origin"] == "brand" }.map { |logo| logo["style"] })
        .to contain_exactly("asWritten", "spacedCaps", "boldLower")
    end
  end

  describe "baixar" do
    it "o logotipo sai em PNG 1024 e 2048, com o nome da marca no arquivo" do
      post "/brands/#{brand.id}/logos/generate", headers: headers
      logo = json["brandCore"]["logos"].first
      expect(logo["downloads"]).to include(
        { "variant" => "light", "format" => "png", "size" => 1024 },
        { "variant" => "dark", "format" => "png", "size" => 2048 }
      )

      get "/brands/#{brand.id}/logos/#{logo["id"]}/download", headers: headers,
        params: { variant: "light", format: "png", size: 1024 }

      expect(response).to have_http_status(:ok)
      expect(response.headers["Content-Disposition"]).to include('filename="pao-da-vila-logo-light-1024.png"')
      expect(Vips::Image.new_from_buffer(response.body, "").width).to eq(1024)
    end

    it "SVG enviado baixa como SVG e também rasterizado em PNG" do
      logo = upload("logo.svg", "image/svg+xml")
      get "/brands/#{brand.id}/logos/#{logo["logoId"]}/download", headers: headers,
        params: { variant: "light", format: "svg" }
      expect(response.media_type).to eq("image/svg+xml")

      get "/brands/#{brand.id}/logos/#{logo["logoId"]}/download", headers: headers,
        params: { variant: "light", format: "png", size: 2048 }
      image = Vips::Image.new_from_buffer(response.body, "")
      expect(image.width).to eq(2048)
      expect(image.has_alpha?).to be(true)
    end

    it "não amplia PNG pequeno: oferece o original" do
      logo = upload("logo-transparente.png", "image/png")
      sizes = brand.reload.logos.find_logo(logo["logoId"]).then { |l| BrandLogoSerializer.downloads(l) }.map { |d| d[:size] }
      expect(sizes).to eq([ nil ])
    end

    it "não baixa logo de marca de outra organização" do
      other = create(:brand_asset, brand_core: create(:brand_core))

      get "/brands/#{other.brand_core_id}/logos/#{other.logo_id}/download", headers: headers,
        params: { variant: "light", format: "png" }
      expect(response).to have_http_status(:not_found)

      get "/brands/#{brand.id}/logos/#{other.logo_id}/download", headers: headers,
        params: { variant: "light", format: "png" }
      expect(response).to have_http_status(:not_found)
    end
  end
end
