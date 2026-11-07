require "rails_helper"

# O tipo que o navegador declara é escolha de quem manda. Imagem precisa ser imagem nos bytes: é o arquivo
# que vai para o libvips medir e reduzir, e o libvips escolhe o leitor pelo conteúdo, com vários que não são
# para receber arquivo de fora (CVE-2026-66066).
RSpec.describe "Conteúdo do arquivo enviado", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:headers) { auth_headers(owner) }
  let(:work_dir) { Pathname.new(Dir.mktmpdir("upload-content")) }

  after { FileUtils.rm_rf(work_dir) }

  def fake(name, content, type)
    path = work_dir.join(name)
    path.binwrite(content)
    Rack::Test::UploadedFile.new(path.to_s, type)
  end

  let(:html_as_png) { fake("foto.png", "<html><script>alert(1)</script></html>", "image/png") }
  let(:svg_as_png) { fake("foto.png", %(<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>), "image/png") }
  let(:real_png) { fixture_file_upload("foto.png", "image/png") }

  describe "POST /uploads" do
    it "recusa HTML que se diz PNG" do
      expect {
        post "/uploads", params: { file: html_as_png }, headers: headers
      }.not_to change(ActiveStorage::Blob, :count)

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "recusa SVG que se diz PNG" do
      expect {
        post "/uploads", params: { file: svg_as_png }, headers: headers
      }.not_to change(Upload, :count)

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "um texto no lugar do arquivo é erro de quem chamou, não 500" do
      post "/uploads", params: { file: "nao-e-arquivo" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "aceita a imagem de verdade" do
      post "/uploads", params: { file: real_png }, headers: headers

      expect(response).to have_http_status(:created)
    end
  end

  describe "POST /connectors/:id/widget/upload-image" do
    let(:connector) { create(:connector_web_widget, organization: organization) }

    # A URL vai para o site do cliente.
    it "recusa HTML que se diz PNG" do
      post "/connectors/#{connector.id}/widget/upload-image", params: { slot: "avatar", file: html_as_png }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("invalidFileType")
      expect(connector.reload.bot_avatar_url).to be_blank
    end

    it "aceita a imagem de verdade" do
      post "/connectors/#{connector.id}/widget/upload-image", params: { slot: "avatar", file: real_png }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(connector.reload.bot_avatar_url).to include("/rails/active_storage/")
    end
  end

  # Já vinha certo: é o que as outras rotas de imagem fazem, e fica aqui para não regredir.
  describe "as rotas que já conferiam os bytes" do
    it "POST /profile/avatar recusa HTML que se diz PNG" do
      post "/profile/avatar", params: { file: html_as_png }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "POST /organization/logo recusa HTML que se diz PNG" do
      post "/organization/logo", params: { file: html_as_png }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "POST /products/items/:id/images recusa HTML que se diz PNG" do
      item = create(:product_item, organization: organization)

      post "/products/items/#{item.id}/images", params: { file: html_as_png }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
