require "rails_helper"

RSpec.describe "Widget::V1::Visitor", type: :request do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_web_widget, organization: organization, pre_chat_fields: "name_phone") }
  let(:visitor_id) { "visitor-profile-1" }
  let(:widget_headers) { { "Authorization" => "Bearer #{connector.issue_visitor_jwt(visitor_id)}" } }

  def post_visitor(**params)
    post "/widget/v1/visitor", params: params, headers: widget_headers, as: :json
  end

  def visitor_chat
    Chat.where(connector_id: connector.id, external_id: visitor_id).take
  end

  describe "POST /widget/v1/visitor" do
    it "responde 401 sem token válido" do
      post "/widget/v1/visitor", params: { name: "Maria", phone: "+5511999999999" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "cria a conversa com nome e telefone, antes da primeira mensagem" do
      post_visitor(name: "Maria", phone: "+5511999999999")

      expect(response).to have_http_status(:ok)
      expect(json["profile"]).to include("name" => "Maria", "phone" => "+5511999999999", "captured" => true)

      expect(visitor_chat).to have_attributes(user_name: "Maria", audience_type: "web", organization_id: organization.id)
      expect(visitor_chat.custom_attributes["phone"]).to eq("+5511999999999")
    end

    it "nasce com a automação padrão da organização" do
      organization.update!(settings: { "default_automation_enabled" => false })

      post_visitor(name: "Maria", phone: "+5511999999999")

      expect(visitor_chat.automation_enabled).to be(false)
    end

    it "responde 400 quando falta campo obrigatório do conector" do
      post_visitor(name: "Maria")

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("missingFields")
      expect(json.dig("error", "details", "fields")).to include("phone")
      expect(visitor_chat).to be_nil
    end

    it "lista todos os campos que faltam" do
      connector.update!(pre_chat_fields: "name_phone_email")

      post_visitor

      expect(json.dig("error", "details", "fields")).to eq(%w[name phone email])
    end

    it "trata campo em branco como faltando" do
      post_visitor(name: "   ", phone: "+5511999999999")

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "details", "fields")).to eq(%w[name])
    end

    it "aceita sem telefone quando o conector só pede nome" do
      connector.update!(pre_chat_fields: "name")

      post_visitor(name: "Maria")

      expect(response).to have_http_status(:ok)
      expect(json["profile"]).to include("captured" => true)
    end

    it "aceita vazio quando o conector não pede nada" do
      connector.update!(pre_chat_fields: "off")

      post_visitor

      expect(response).to have_http_status(:ok)
      expect(json["profile"]).to include("captured" => true)
    end

    it "responde 422 com e-mail inválido" do
      connector.update!(pre_chat_fields: "name_phone_email")

      post_visitor(name: "Maria", phone: "+5511999999999", email: "not-an-email")

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "invalidEmail", "field" => "email")
    end

    it "responde 422 com e-mail inválido mesmo quando o e-mail é opcional" do
      post_visitor(name: "Maria", phone: "+5511999999999", email: "not-an-email")

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "guarda o e-mail" do
      connector.update!(pre_chat_fields: "name_phone_email")

      post_visitor(name: "Maria", phone: "+5511999999999", email: "maria@exemplo.com.br")

      expect(json["profile"]).to include("email" => "maria@exemplo.com.br", "captured" => true)
      expect(visitor_chat.custom_attributes["email"]).to eq("maria@exemplo.com.br")
    end

    it "atualiza o perfil nas chamadas seguintes, sem criar outra conversa" do
      post_visitor(name: "Maria", phone: "+5511999999999")
      post_visitor(name: "Maria S.", phone: "+5511988888888")

      expect(visitor_chat.user_name).to eq("Maria S.")
      expect(visitor_chat.custom_attributes["phone"]).to eq("+5511988888888")
      expect(Chat.where(connector_id: connector.id).count).to eq(1)
    end

    it "preserva os outros atributos do contato" do
      post_visitor(name: "Maria", phone: "+5511999999999")
      visitor_chat.set(custom_attributes: { "phone" => "+5511999999999", "cpf" => "123" })

      post_visitor(name: "Maria", phone: "+5511988888888")

      expect(visitor_chat.custom_attributes).to include("cpf" => "123", "phone" => "+5511988888888")
    end

    it "é a mesma conversa que a primeira mensagem vai usar" do
      allow(Flows::InboundDispatcher).to receive(:call)

      post_visitor(name: "Maria", phone: "+5511999999999")
      post "/widget/v1/messages", params: { content: "olá" }, headers: widget_headers, as: :json

      expect(Chat.where(connector_id: connector.id).count).to eq(1)
      expect(ChatMessage::Base.where(chat_id: visitor_chat.id).first.sender_name).to eq("Maria")
    end
  end

  describe "GET /widget/v1/visitor" do
    def show
      get "/widget/v1/visitor", headers: widget_headers
    end

    it "responde 401 sem token" do
      get "/widget/v1/visitor"

      expect(response).to have_http_status(:unauthorized)
    end

    it "diz captured:false sem conversa" do
      show

      expect(response).to have_http_status(:ok)
      expect(json["profile"]).to eq("name" => nil, "phone" => nil, "email" => nil, "captured" => false)
    end

    it "diz captured:true com os campos obrigatórios preenchidos" do
      post_visitor(name: "Maria", phone: "+5511999999999")

      show

      expect(json["profile"]).to include("name" => "Maria", "phone" => "+5511999999999", "captured" => true)
    end

    it "diz captured:false se o conector passou a pedir mais do que foi preenchido" do
      post_visitor(name: "Maria", phone: "+5511999999999")
      connector.update!(pre_chat_fields: "name_phone_email")

      show

      expect(json["profile"]).to include("captured" => false)
    end

    it "não mostra o perfil de outro visitante" do
      post_visitor(name: "Maria", phone: "+5511999999999")

      other = connector.issue_visitor_jwt("visitor-profile-2")
      get "/widget/v1/visitor", headers: { "Authorization" => "Bearer #{other}" }

      expect(json["profile"]).to include("name" => nil, "captured" => false)
    end
  end
end
