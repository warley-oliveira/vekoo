require "rails_helper"

RSpec.describe "Anexos", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  def pdf
    Rack::Test::UploadedFile.new(StringIO.new("%PDF-1.4 catálogo"), "application/pdf", original_filename: "catalogo.pdf")
  end

  it "exige sessão" do
    get "/attachments"

    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /attachments" do
    it "lista os da galeria, com o arquivo" do
      attachment = create(:attachment, organization: organization, name: "Tabela", description: "De preços")

      get "/attachments", headers: headers

      expect(response).to have_http_status(:ok)
      item = json["attachments"].first
      expect(item).to include("id" => attachment.id, "name" => "Tabela", "description" => "De preços", "private" => false)
      expect(item["file"]).to include("filename" => "tabela.pdf", "contentType" => "application/pdf")
      expect(item["file"]["byteSize"]).to be_positive
      expect(item["file"]["url"]).to start_with("/rails/active_storage/")
      expect(json["meta"]).to include("total" => 1, "perPage" => 20)
    end

    it "não mostra os enviados por dentro de uma conversa" do
      create(:attachment, organization: organization, private: true)

      get "/attachments", headers: headers

      expect(json["attachments"]).to be_empty
    end

    it "não mostra os de outra organização" do
      create(:attachment)

      get "/attachments", headers: headers

      expect(json["attachments"]).to be_empty
    end

    it "busca por nome, descrição e nome do arquivo" do
      create(:attachment, organization: organization, name: "Cardápio")
      create(:attachment, organization: organization, name: "Outro", description: "cardápio novo")
      create(:attachment, organization: organization, name: "Regulamento")

      get "/attachments", params: { search: "cardápio" }, headers: headers
      expect(json["attachments"].map { |a| a["name"] }).to contain_exactly("Cardápio", "Outro")

      get "/attachments", params: { search: "tabela.pdf" }, headers: headers
      expect(json["attachments"].size).to eq(3)
    end

    it "ordena pelo campo pedido e ignora os que não existem" do
      create(:attachment, organization: organization, name: "B")
      create(:attachment, organization: organization, name: "A")

      get "/attachments", params: { sortBy: "name", sortOrder: "asc" }, headers: headers
      expect(json["attachments"].map { |a| a["name"] }).to eq(%w[A B])

      get "/attachments", params: { sortBy: "name; DROP TABLE attachments", sortOrder: "asc" }, headers: headers
      expect(response).to have_http_status(:ok)
    end

    it "pagina" do
      create_list(:attachment, 3, organization: organization)

      get "/attachments", params: { page: 2, perPage: 2 }, headers: headers

      expect(json["attachments"].size).to eq(1)
      expect(json["meta"]).to include("page" => 2, "perPage" => 2, "total" => 3, "hasMore" => false)
    end

    it "abre a leitura a quem atende, a campanhas e a fluxos" do
      [ { chat: "all" }, { campaigns: "all" }, { flows: "all" } ].each do |permissions|
        get "/attachments", headers: auth_headers(member_with(**permissions))
        expect(response).to have_http_status(:ok)
      end
    end

    it "recusa quem não tem nenhuma delas" do
      get "/attachments", headers: auth_headers(member_with(catalog: "all"))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /attachments/:id" do
    it "responde 404 para o de outra organização" do
      get "/attachments/#{create(:attachment).id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /attachments" do
    it "guarda o arquivo na organização da sessão" do
      post "/attachments", params: { name: "Catálogo", description: "Verão", file: pdf }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["attachment"]).to include("name" => "Catálogo", "description" => "Verão", "private" => false)
      expect(json["attachment"]["file"]).to include("filename" => "catalogo.pdf")
      attachment = Attachment.find(json["attachment"]["id"])
      expect(attachment.organization).to eq(organization)
      expect(attachment.file_name).to eq("catalogo.pdf")
    end

    it "usa o nome do arquivo quando não vem nome" do
      post "/attachments", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["attachment"]["name"]).to eq("catalogo.pdf")
    end

    it "deixa quem atende enviar: o composer do chat manda arquivo na hora" do
      post "/attachments", params: { name: "Do chat", file: pdf }, headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:created)
    end

    it "responde 422 sem arquivo" do
      post "/attachments", params: { name: "Sem arquivo" }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("field" => "file", "message" => "arquivo não pode ficar em branco")
    end

    it "responde 422 quando `file` não é um arquivo" do
      post "/attachments", params: { name: "Texto", file: "isto não é um arquivo" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("file")
    end

    it "responde 422 acima do limite" do
      stub_const("Attachment::MAX_BYTES", 3)

      post "/attachments", params: { name: "Grande", file: pdf }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("file")
    end

    it "recusa quem não tem permissão" do
      post "/attachments", params: { name: "x", file: pdf }, headers: auth_headers(member_with(catalog: "all"))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /attachments/:id" do
    let!(:attachment) { create(:attachment, organization: organization, name: "Antigo") }

    it "muda o nome sem exigir o arquivo de novo" do
      patch "/attachments/#{attachment.id}", params: { name: "Novo" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["attachment"]["name"]).to eq("Novo")
      expect(json["attachment"]["file"]["filename"]).to eq("tabela.pdf")
    end

    it "troca o arquivo" do
      patch "/attachments/#{attachment.id}", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["attachment"]["file"]["filename"]).to eq("catalogo.pdf")
    end

    it "exige core_settings" do
      patch "/attachments/#{attachment.id}", params: { name: "x" }, headers: auth_headers(member_with(chat: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 404 para o de outra organização" do
      patch "/attachments/#{create(:attachment).id}", params: { name: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /attachments/:id" do
    let!(:attachment) { create(:attachment, organization: organization) }

    it "apaga" do
      expect { delete "/attachments/#{attachment.id}", headers: headers }.to change(Attachment, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end

    it "exige core_settings" do
      delete "/attachments/#{attachment.id}", headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    it "não alcança o de outra organização" do
      other = create(:attachment)

      delete "/attachments/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Attachment.exists?(other.id)).to be(true)
    end
  end
end
