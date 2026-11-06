require "rails_helper"

RSpec.describe "Visões salvas do chat", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:colleague) { member_with(chat: "all") }
  let(:headers) { auth_headers(owner) }

  it "exige sessão" do
    get "/chat-views"

    expect(response).to have_http_status(:unauthorized)
  end

  it "exige a permissão de chat" do
    get "/chat-views", headers: auth_headers(member_with(contacts: "all"))

    expect(response).to have_http_status(:forbidden)
  end

  describe "GET /chat-views" do
    it "traz as compartilhadas e as próprias, nunca a pessoal de outra pessoa" do
      mine = create(:chat_view, account: owner, name: "Minha", personal: true)
      shared = create(:chat_view, account: colleague, name: "Do time", personal: false)
      create(:chat_view, account: colleague, name: "Dela", personal: true)
      create(:chat_view, name: "De outra organização", personal: false)

      get "/chat-views", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["chatViews"].map { |v| v["id"] }).to contain_exactly(mine.id, shared.id)
    end
  end

  describe "GET /chat-views/:id" do
    it "responde 404 para a pessoal de outra pessoa" do
      theirs = create(:chat_view, account: colleague, personal: true)

      get "/chat-views/#{theirs.id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 para a de outra organização" do
      get "/chat-views/#{create(:chat_view).id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /chat-views" do
    let(:conditions) { [ { "attributeKey" => "custom_attributes.cidade", "filterOperator" => "text_contains", "values" => [ "Curitiba" ] } ] }

    it "cria, em nome de quem pediu, com as condições intactas" do
      post "/chat-views",
           params: { chatView: { name: "Curitiba", payload: conditions, personal: true } },
           headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["chatView"]).to include("name" => "Curitiba", "personal" => true, "accountId" => owner.id, "payload" => conditions)
    end

    it "aceita as condições em texto, como a tela da origem mandava" do
      post "/chat-views",
           params: { chatView: { name: "Texto", payload: conditions.to_json } },
           headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["chatView"]["payload"]).to eq(conditions)
    end

    it "não deixa escolher outra dona" do
      post "/chat-views",
           params: { chatView: { name: "Dona", payload: [], accountId: colleague.id, personal: true } },
           headers: headers, as: :json

      expect(json["chatView"]["accountId"]).to eq(owner.id)
    end

    it "responde 422 sem nome" do
      post "/chat-views", params: { chatView: { name: "", payload: [] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("name")
    end

    it "responde 422 com condições que não são JSON" do
      post "/chat-views", params: { chatView: { name: "Ruim", payload: "isto não é json" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidPayload", "field" => "payload")
    end

    it "responde 422 com condições grandes demais" do
      huge = [ { "attributeKey" => "x" * ChatViewsController::MAX_PAYLOAD_BYTES } ]

      post "/chat-views", params: { chatView: { name: "Grande", payload: huge } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("invalidPayload")
    end
  end

  describe "PATCH /chat-views/:id" do
    it "altera a compartilhada de outra pessoa sem trocar a dona" do
      shared = create(:chat_view, account: colleague)

      patch "/chat-views/#{shared.id}", params: { chatView: { name: "Novo nome" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["chatView"]).to include("name" => "Novo nome", "accountId" => colleague.id)
    end

    it "faz de dona quem torna pessoal uma compartilhada" do
      shared = create(:chat_view, account: colleague)

      patch "/chat-views/#{shared.id}", params: { chatView: { personal: true } }, headers: headers, as: :json

      expect(json["chatView"]).to include("personal" => true, "accountId" => owner.id)
    end

    it "não alcança a pessoal de outra pessoa" do
      theirs = create(:chat_view, account: colleague, personal: true)

      patch "/chat-views/#{theirs.id}", params: { chatView: { name: "Roubada" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(theirs.reload.name).not_to eq("Roubada")
    end
  end

  describe "DELETE /chat-views/:id" do
    it "apaga" do
      view = create(:chat_view, account: owner)

      expect { delete "/chat-views/#{view.id}", headers: headers }.to change(ChatView, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end

    it "não alcança a de outra organização" do
      other = create(:chat_view)

      delete "/chat-views/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(ChatView.exists?(other.id)).to be(true)
    end
  end
end
