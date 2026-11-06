require "rails_helper"

RSpec.describe "Etiquetas", type: :request do
  include ActionCable::TestHelper

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  def tag_for(org = organization, **attributes)
    create(:chat_tag, organization_id: org.id, **attributes)
  end

  it "exige sessão" do
    get "/chat-tags"

    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /chat-tags" do
    it "lista em ordem de nome, só as da organização" do
      tag_for(name: "vip")
      tag_for(name: "atraso")
      tag_for(create(:organization), name: "de-fora")

      get "/chat-tags", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["chatTags"].map { |t| t["name"] }).to eq(%w[atraso vip])
      expect(json["chatTags"].first.keys).to include("id", "name", "description", "color", "createdAt")
    end

    # Campanhas, fluxos e pipelines filtram e marcam por etiqueta.
    it "abre a leitura a qualquer sessão" do
      get "/chat-tags", headers: auth_headers(member_with(campaigns: "all"))

      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST /chat-tags" do
    it "cria com o nome em forma de slug" do
      post "/chat-tags", params: { chatTag: { name: "Cliente VIP", color: "#db2777", description: "De sempre" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["chatTag"]).to include("name" => "cliente-vip", "color" => "#db2777", "description" => "De sempre")
    end

    it "responde 422 sem cor" do
      post "/chat-tags", params: { chatTag: { name: "Sem cor" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("field" => "color", "message" => "cor não pode ficar em branco")
    end

    it "recusa nome que já existe, mesmo escrito de outro jeito" do
      tag_for(name: "cliente-vip")

      post "/chat-tags", params: { chatTag: { name: "CLIENTE VIP", color: "#000000" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "tagNameTaken", "field" => "name")
    end

    it "exige a permissão de chat ou de campanhas" do
      post "/chat-tags", params: { chatTag: { name: "x", color: "#000000" } }, headers: auth_headers(member_with(contacts: "all")), as: :json
      expect(response).to have_http_status(:forbidden)

      post "/chat-tags", params: { chatTag: { name: "y", color: "#000000" } }, headers: auth_headers(member_with(campaigns: "all")), as: :json
      expect(response).to have_http_status(:created)
    end
  end

  describe "PATCH /chat-tags/:id" do
    it "altera" do
      tag = tag_for(name: "antiga")

      patch "/chat-tags/#{tag.id}", params: { chatTag: { name: "Nova", color: "#111111" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["chatTag"]).to include("name" => "nova", "color" => "#111111")
    end

    it "deixa trocar só a cor sem reclamar do próprio nome" do
      tag = tag_for(name: "mesma")

      patch "/chat-tags/#{tag.id}", params: { chatTag: { color: "#222222" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
    end

    it "responde 404 para a de outra organização" do
      patch "/chat-tags/#{tag_for(create(:organization)).id}", params: { chatTag: { name: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /chat-tags/:id" do
    it "apaga e tira de todas as conversas" do
      tag = tag_for
      chat = create(:chat, organization: organization, chat_tag_ids: [ tag.id ])

      delete "/chat-tags/#{tag.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(ChatTag.where(id: tag.id).exists?).to be(false)
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "não alcança a de outra organização" do
      other = tag_for(create(:organization))

      delete "/chat-tags/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(ChatTag.where(id: other.id).exists?).to be(true)
    end
  end

  describe "GET /chat-tags/:id/assigns" do
    it "conta as conversas com a etiqueta" do
      tag = tag_for
      create_list(:chat, 2, organization: organization, chat_tag_ids: [ tag.id ])
      create(:chat, organization: organization)

      get "/chat-tags/#{tag.id}/assigns", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to eq("count" => 2)
    end

    it "responde 404 para a de outra organização" do
      get "/chat-tags/#{tag_for(create(:organization)).id}/assigns", headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "recusa quem não tem chat nem contatos" do
      get "/chat-tags/#{tag_for.id}/assigns", headers: auth_headers(member_with(campaigns: "all"))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PUT e DELETE /chat-tags/:id/chats/:chat_id" do
    let(:tag) { tag_for }
    let(:chat) { create(:chat, organization: organization) }

    it "aplica uma vez só, mesmo pedindo de novo" do
      2.times { put "/chat-tags/#{tag.id}/chats/#{chat.id}", headers: headers, as: :json }

      expect(response).to have_http_status(:ok)
      expect(json["tagIds"]).to eq([ tag.id.to_s ])
      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
    end

    it "transmite a conversa para a lista ao aplicar" do
      chat
      tag
      stream = ApplicationCable::Channel.organization_stream(organization.id, "chat-list")

      expect {
        put "/chat-tags/#{tag.id}/chats/#{chat.id}", headers: headers, as: :json
      }.to have_broadcasted_to(stream).with(hash_including("action" => "upsert"))
    end

    it "não cria nota no histórico" do
      expect {
        put "/chat-tags/#{tag.id}/chats/#{chat.id}", headers: headers, as: :json
      }.not_to change { ChatMessage::Base.unscoped.where(chat_id: chat.id).count }
    end

    it "remove" do
      chat.add_to_set(chat_tag_ids: tag.id)

      delete "/chat-tags/#{tag.id}/chats/#{chat.id}", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["tagIds"]).to be_empty
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "não aplica etiqueta de outra organização" do
      other = tag_for(create(:organization))

      put "/chat-tags/#{other.id}/chats/#{chat.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "não alcança conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))

      put "/chat-tags/#{tag.id}/chats/#{foreign.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.chat_tag_ids).to be_empty
    end

    it "não alcança conversa que a pessoa não pode ver" do
      account = member_with(chat: "all", chat_list_to: "assigned")
      theirs = create(:chat, organization: organization, assigned_account_id: owner.id)

      put "/chat-tags/#{tag.id}/chats/#{theirs.id}", headers: auth_headers(account), as: :json

      expect(response).to have_http_status(:not_found)
      expect(theirs.reload.chat_tag_ids).to be_empty
    end

    it "exige a permissão de chat" do
      put "/chat-tags/#{tag.id}/chats/#{chat.id}", headers: auth_headers(member_with(contacts: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end
end
