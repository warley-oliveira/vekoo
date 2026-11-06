require "rails_helper"

RSpec.describe "Mensagens rápidas", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  it "exige sessão" do
    get "/quick-replies"
    expect(response).to have_http_status(:unauthorized)

    post "/quick-replies", params: { quickReply: { name: "x" } }, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /quick-replies" do
    it "lista por nome, com as chaves em camelCase e as datas em milissegundos" do
      create(:quick_reply, organization: organization, name: "Zebra", trigger: "z")
      create(:quick_reply, organization: organization, name: "Alfa", trigger: "a")

      get "/quick-replies", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["quickReplies"].map { |r| r["name"] }).to eq(%w[Alfa Zebra])
      expect(json["quickReplies"].first).to include("trigger" => "a", "content" => "Oi! Como posso ajudar?")
      expect(json["quickReplies"].first["createdAt"]).to be_a(Integer)
      expect(json["meta"]).to include("total" => 2, "perPage" => 100)
    end

    it "busca por nome, atalho e conteúdo" do
      create(:quick_reply, organization: organization, name: "Prazo de entrega", trigger: "prazo")
      create(:quick_reply, organization: organization, name: "Troca", trigger: "troca", content: "Prazo de 7 dias")
      create(:quick_reply, organization: organization, name: "Horário", trigger: "horario")

      get "/quick-replies", params: { q: "prazo" }, headers: headers

      expect(json["quickReplies"].map { |r| r["name"] }).to contain_exactly("Prazo de entrega", "Troca")
    end

    it "não mostra as de outra organização" do
      create(:quick_reply)

      get "/quick-replies", headers: headers

      expect(json["quickReplies"]).to be_empty
    end

    it "deixa quem atende ler, porque o composer do chat oferece a lista" do
      create(:quick_reply, organization: organization)

      get "/quick-replies", headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:ok)
      expect(json["quickReplies"].size).to eq(1)
    end

    it "recusa quem não atende nem configura" do
      get "/quick-replies", headers: auth_headers(member_with(catalog: "all"))

      expect(response).to have_http_status(:forbidden)
      expect(json["error"]["code"]).to eq("forbidden")
    end
  end

  describe "GET /quick-replies/:id" do
    it "responde 404 para a de outra organização" do
      get "/quick-replies/#{create(:quick_reply).id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(json["error"]["code"]).to eq("notFound")
    end
  end

  describe "POST /quick-replies" do
    it "cria e normaliza o atalho" do
      expect {
        post "/quick-replies",
             params: { quickReply: { name: "Boas-vindas", trigger: "Bom Dia!", content: "Bom dia! Em que posso ajudar?" } },
             headers: headers, as: :json
      }.to change { organization.quick_replies.count }.by(1)

      expect(response).to have_http_status(:created)
      expect(json["quickReply"]).to include("name" => "Boas-vindas", "trigger" => "bom-dia")
    end

    it "responde 422 com o primeiro campo inválido" do
      post "/quick-replies", params: { quickReply: { name: "", trigger: "", content: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name")
      expect(json["error"]["details"].keys).to include("name", "trigger", "content")
    end

    it "recusa atalho repetido na mesma organização" do
      create(:quick_reply, organization: organization, trigger: "prazo")

      post "/quick-replies", params: { quickReply: { name: "Outra", trigger: "PRAZO", content: "texto" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("field" => "trigger", "message" => "atalho já está em uso")
    end

    it "aceita o mesmo atalho em outra organização" do
      create(:quick_reply, trigger: "prazo")

      post "/quick-replies", params: { quickReply: { name: "Prazo", trigger: "prazo", content: "texto" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end

    it "recusa atalho que vira vazio" do
      post "/quick-replies", params: { quickReply: { name: "Nome", trigger: "!!!", content: "texto" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("trigger")
    end

    it "responde 400 sem o envelope" do
      post "/quick-replies", params: { name: "Solto" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["error"]["code"]).to eq("parameterMissing")
    end

    it "exige core_settings: quem só atende não muda o texto da organização" do
      post "/quick-replies",
           params: { quickReply: { name: "x", trigger: "x", content: "y" } },
           headers: auth_headers(member_with(chat: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /quick-replies/:id" do
    let!(:quick_reply) { create(:quick_reply, organization: organization) }

    it "altera" do
      patch "/quick-replies/#{quick_reply.id}", params: { quickReply: { content: "Texto novo" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["quickReply"]["content"]).to eq("Texto novo")
    end

    it "responde 422 na validação" do
      patch "/quick-replies/#{quick_reply.id}", params: { quickReply: { content: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para a de outra organização" do
      patch "/quick-replies/#{create(:quick_reply).id}", params: { quickReply: { content: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /quick-replies/:id" do
    let!(:quick_reply) { create(:quick_reply, organization: organization) }

    it "apaga" do
      expect {
        delete "/quick-replies/#{quick_reply.id}", headers: headers
      }.to change(QuickReply, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end

    it "exige core_settings" do
      delete "/quick-replies/#{quick_reply.id}", headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:forbidden)
      expect(QuickReply.exists?(quick_reply.id)).to be(true)
    end

    it "não alcança a de outra organização" do
      other = create(:quick_reply)

      delete "/quick-replies/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(QuickReply.exists?(other.id)).to be(true)
    end
  end
end
