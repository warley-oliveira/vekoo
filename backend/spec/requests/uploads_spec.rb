require "rails_helper"

RSpec.describe "Uploads", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  def png = fixture_file_upload("foto.png", "image/png")

  describe "POST /uploads" do
    it "guarda a imagem e devolve o que o editor precisa para enquadrá-la" do
      expect {
        post "/uploads", params: { file: png }, headers: headers
      }.to change(Upload, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json["name"]).to eq("foto.png")
      # Sem largura e altura o editor não sabe enquadrar a imagem que a pessoa
      # acabou de escolher — por isso a análise é síncrona.
      expect(json["width"]).to eq(40)
      expect(json["height"]).to eq(30)
      expect(json["byteSize"]).to be_positive
      expect(json["createdAt"]).to be_a(Integer)
    end

    it "aponta para a rota proxy, que não expira nem quebra o CORS da exportação" do
      post "/uploads", params: { file: png }, headers: headers

      expect(json["url"]).to start_with("/rails/active_storage/representations/proxy/")
      expect(json["url"]).not_to include("expires_in")
    end

    it "guarda o dono: a imagem é da organização, não de quem enviou" do
      post "/uploads", params: { file: png }, headers: headers

      upload = Upload.find(json["id"])
      expect(upload.organization).to eq(organization)
      expect(upload.account).to eq(account)
    end

    it "recusa o que não é imagem, apontando o campo" do
      expect {
        post "/uploads",
          params: { file: fixture_file_upload("documento.txt", "text/plain") },
          headers: headers
      }.not_to change(Upload, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("file")
      expect(json.dig("error", "details", "file")).to be_present
    end

    it "recusa arquivo acima do teto sem gravar nada" do
      # O teto encolhe em vez de o arquivo crescer: o Rails reconstrói o
      # UploadedFile a partir do corpo multipart, então dublar o objeto que sai
      # daqui não teria efeito nenhum do outro lado.
      stub_const("Upload::MAX_BYTES", 10)

      expect {
        post "/uploads", params: { file: png }, headers: headers
      }.not_to change(Upload, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("file")
    end

    it "responde no idioma da requisição" do
      post "/uploads",
        params: { file: fixture_file_upload("documento.txt", "text/plain") },
        headers: headers.merge("Accept-Language" => "en")

      expect(json.dig("error", "message")).to match(/JPEG/)
      expect(json.dig("error", "message")).not_to match(/Esse arquivo/)
    end

    it "exige sessão" do
      post "/uploads", params: { file: png }

      expect(response).to have_http_status(:unauthorized)
    end

    it "recusa requisição sem arquivo em vez de estourar" do
      post "/uploads", headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end
  end

  describe "limite do documento" do
    it "recusa carrossel com imagem embutida no lugar de referência" do
      carousel = build(:carousel, organization: organization)
      carousel.cards = [ carousel.cards.first.merge("lixo" => "x" * (Carousel::MAX_DOCUMENT_BYTES + 1)) ]

      expect(carousel).not_to be_valid
      expect(carousel.errors[:cards]).to be_present
    end
  end
end
