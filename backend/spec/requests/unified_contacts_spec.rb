require "rails_helper"

# Contra o Mongo de verdade: a origem testava com a agregação simulada, e assim nenhum cast
# errado aparece.
RSpec.describe "Contatos unificados", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:phone) { "5531971810932" }

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def connector
    create(:connector_web_widget, organization: organization)
  end

  describe "GET /unified-contacts" do
    it "exige sessão" do
      get "/unified-contacts"

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão de chat" do
      get "/unified-contacts", headers: auth_headers(member_with(contacts: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    # Decisão: sem a chave `unified_contacts_enabled` da origem.
    it "funciona sem nenhuma chave ligada na organização" do
      expect(organization.features).to be_blank

      get "/unified-contacts", headers: headers

      expect(response).to have_http_status(:ok)
    end

    it "agrupa por contato, com uma aba por conversa, somando as não lidas" do
      connector_a = connector
      connector_b = connector
      older = chat_for(connector: connector_a, external_id: phone, user_name: "Fernanda", unread_messages: 1, last_message_at: 2.hours.ago, last_message_content: "antiga", last_message_by: "user")
      newer = chat_for(connector: connector_b, external_id: phone, user_name: "Fernanda Lima", display_name: "Fê", unread_messages: 2, last_message_at: 1.hour.ago, last_message_content: "nova", last_message_by: "assistant", profile_picture_url: "https://cdn.exemplo.com/f.jpg")

      get "/unified-contacts", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["contacts"].size).to eq(1)
      contact = json["contacts"].first
      expect(contact).to include(
        "externalId" => phone, "name" => "Fê", "totalUnread" => 3, "lastMessageContent" => "nova", "lastMessageBy" => "assistant",
        "profilePictureUrl" => "https://cdn.exemplo.com/f.jpg"
      )
      expect(contact["lastMessageAt"]).to be_a(Integer)
      expect(contact["audienceId"]).to eq(older.reload.audience_id.to_s)
      expect(contact["chats"].map { |c| c["chatId"] }).to eq([ newer.id.to_s, older.id.to_s ])
      expect(contact["chats"].first).to include("connectorId" => connector_b.id.to_s, "unread" => 2, "status" => "open", "matched" => true)
      expect(json["meta"]).to include("filtered" => false, "hasMore" => false, "page" => 1, "perPage" => 25)
    end

    it "ordena pelo contato com mensagem mais recente" do
      chat_for(external_id: "1", last_message_at: 3.hours.ago)
      chat_for(external_id: "2", last_message_at: 1.hour.ago)
      chat_for(external_id: "1", last_message_at: 2.hours.ago)

      get "/unified-contacts", headers: headers

      expect(json["contacts"].map { |c| c["externalId"] }).to eq(%w[2 1])
    end

    it "deixa de fora a de teste e a de outra organização" do
      chat_for(external_id: Chat::TEST_EXTERNAL_ID)
      create(:chat, organization: create(:organization), external_id: phone)

      get "/unified-contacts", headers: headers

      expect(json["contacts"]).to be_empty
    end

    it "pagina, sem contar o total" do
      stub_const("UnifiedContactsController::PER_PAGE", 2)
      3.times { |n| chat_for(external_id: "55#{n}", last_message_at: n.hours.ago) }

      get "/unified-contacts", headers: headers
      expect(json["contacts"].map { |c| c["externalId"] }).to eq(%w[550 551])
      expect(json["meta"]["hasMore"]).to be(true)

      get "/unified-contacts", params: { page: 2 }, headers: headers
      expect(json["contacts"].map { |c| c["externalId"] }).to eq(%w[552])
      expect(json["meta"]["hasMore"]).to be(false)
    end

    it "busca e situação valem por conversa antes de agrupar" do
      chat_for(external_id: "1", user_name: "Fernanda", status: "open")
      chat_for(external_id: "2", user_name: "Roberto", status: "open")
      chat_for(external_id: "3", user_name: "Fernanda", status: "closed")

      get "/unified-contacts", params: { q: "fernanda", status: "open" }, headers: headers

      expect(json["contacts"].map { |c| c["externalId"] }).to eq(%w[1])
    end

    describe "filtros avançados" do
      let(:connector_a) { connector }
      let(:connector_b) { connector }
      let!(:matching) { chat_for(connector: connector_a, external_id: phone, last_message_at: 3.hours.ago, status: "open") }
      let!(:other_tab) { chat_for(connector: connector_b, external_id: phone, last_message_at: 1.hour.ago, status: "closed") }
      let!(:unrelated) { chat_for(external_id: "5511900000000", status: "closed") }

      def filter(key, operator, *values, **extra)
        { filters: { "0" => { attributeKey: key, filterOperator: operator, values: values, queryOperator: "and" }.merge(extra) } }
      end

      it "mantém a aba que não casa, em cinza, e põe a que casa primeiro" do
        get "/unified-contacts", params: filter("connector_id", "equal_to", connector_a.id.to_s), headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["meta"]["filtered"]).to be(true)
        expect(json["contacts"].size).to eq(1)
        contact = json["contacts"].first
        expect(contact["matchCount"]).to eq(1)
        expect(contact["chats"].map { |c| [ c["chatId"], c["matched"] ] }).to eq([ [ matching.id.to_s, true ], [ other_tab.id.to_s, false ] ])
      end

      it "só traz contatos com ao menos uma conversa que casa" do
        get "/unified-contacts", params: filter("status", "equal_to", "open"), headers: headers

        expect(json["contacts"].map { |c| c["externalId"] }).to eq([ phone ])
      end

      it "converte campo personalizado numérico" do
        matching.update(custom_attributes: { "idade" => "30" })

        get "/unified-contacts", params: filter("custom_attributes.idade", "is_greater_than", "10", valueType: "number"), headers: headers

        expect(json["contacts"].first["chats"].first["chatId"]).to eq(matching.id.to_s)
      end

      it "não quebra com campo personalizado que não existe" do
        get "/unified-contacts", params: filter("custom_attributes.nada", "is_set"), headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["contacts"]).to be_empty
      end

      it "filtra por etiqueta, com ObjectId convertido" do
        tag = create(:chat_tag, organization_id: organization.id)
        matching.update(chat_tag_ids: [ tag.id ])

        get "/unified-contacts", params: filter("chat_tag_ids", "contains", tag.id.to_s), headers: headers

        expect(json["contacts"].first["matchCount"]).to eq(1)
      end

      it "não deixa o filtro apontar para outra organização" do
        get "/unified-contacts", params: filter("organization_id", "equal_to", "outra"), headers: headers

        expect(json["meta"]["filtered"]).to be(false)
      end
    end

    describe "visibilidade por chat_list_to" do
      let(:colleague) { create(:account, organization: organization, role: "member") }

      it "com `assigned`, só vê as próprias e as sem dono, e só essas abas" do
        account = member_with(chat: "all", chat_list_to: "assigned")
        mine = chat_for(external_id: phone, assigned_account_id: account.id)
        chat_for(external_id: phone, assigned_account_id: colleague.id)
        chat_for(external_id: "5511900000000", assigned_account_id: colleague.id)

        get "/unified-contacts", headers: auth_headers(account)

        expect(json["contacts"].map { |c| c["externalId"] }).to eq([ phone ])
        expect(json["contacts"].first["chats"].map { |c| c["chatId"] }).to eq([ mine.id.to_s ])
      end

      it "com `team`, só as do departamento e as sem departamento" do
        team = create(:team, organization: organization)
        account = member_of_team(team, chat: "all", chat_list_to: "team")
        mine = chat_for(external_id: phone, team_id: team.id)
        chat_for(external_id: "5511900000000", team_id: create(:team, organization: organization).id)

        get "/unified-contacts", headers: auth_headers(account)

        expect(json["contacts"].map { |c| c["chats"].first["chatId"] }).to eq([ mine.id.to_s ])
      end
    end
  end

  describe "GET /unified-contacts/:external_id/messages" do
    let(:connector_a) { connector }
    let(:connector_b) { connector }
    let(:first_chat) { chat_for(connector: connector_a, external_id: phone) }
    let(:second_chat) { chat_for(connector: connector_b, external_id: phone, sender_phone_number_id: 123) }

    it "exige sessão" do
      get "/unified-contacts/#{phone}/messages"

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão de chat" do
      get "/unified-contacts/#{phone}/messages", headers: auth_headers(member_with(contacts: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    it "mistura as conversas do contato em ordem, cada mensagem com a origem" do
      older = create(:chat_text_message, chat: first_chat, created_at: 2.minutes.ago, content: "pelo site")
      newer = create(:chat_text_message, chat: second_chat, created_at: 1.minute.ago, content: "pelo WhatsApp")
      create(:chat_text_message, chat: chat_for(external_id: "outro"), content: "de outra pessoa")

      get "/unified-contacts/#{phone}/messages", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["messages"].map { |m| m["id"] }).to eq([ older.id.to_s, newer.id.to_s ])
      expect(json["messages"].last).to include("chatId" => second_chat.id.to_s, "connectorId" => connector_b.id.to_s, "senderPhoneNumberId" => "123")
      expect(json).to include("hasMore" => false, "oldestId" => older.id.to_s)
    end

    it "pagina por cursor" do
      older = create(:chat_text_message, chat: first_chat, created_at: 2.minutes.ago)
      newer = create(:chat_text_message, chat: second_chat, created_at: 1.minute.ago)

      get "/unified-contacts/#{phone}/messages", params: { limit: 1 }, headers: headers
      expect(json["messages"].map { |m| m["id"] }).to eq([ newer.id.to_s ])
      expect(json["hasMore"]).to be(true)

      get "/unified-contacts/#{phone}/messages", params: { limit: 1, beforeId: newer.id.to_s }, headers: headers
      expect(json["messages"].map { |m| m["id"] }).to eq([ older.id.to_s ])
    end

    it "aceita identificador com arroba e ponto" do
      jid = "5531971810932@s.whatsapp.net"
      message = create(:chat_text_message, chat: chat_for(external_id: jid))

      get "/unified-contacts/#{ERB::Util.url_encode(jid)}/messages", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["messages"].map { |m| m["id"] }).to eq([ message.id.to_s ])
    end

    it "lista vazia para contato que não existe nesta organização" do
      create(:chat_text_message, chat: create(:chat, organization: create(:organization), external_id: phone))

      get "/unified-contacts/#{phone}/messages", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to eq("messages" => [], "hasMore" => false, "oldestId" => nil)
    end

    it "só mistura as conversas que a pessoa pode ver" do
      account = member_with(chat: "all", chat_list_to: "assigned")
      colleague = create(:account, organization: organization, role: "member")
      visible = create(:chat_text_message, chat: chat_for(external_id: phone, assigned_account_id: account.id))
      create(:chat_text_message, chat: chat_for(external_id: phone, assigned_account_id: colleague.id))

      get "/unified-contacts/#{phone}/messages", headers: auth_headers(account)

      expect(json["messages"].map { |m| m["id"] }).to eq([ visible.id.to_s ])
    end

    it "responde 422 com cursor de outro contato" do
      first_chat
      other = create(:chat_text_message, chat: chat_for(external_id: "outro"))

      get "/unified-contacts/#{phone}/messages", params: { beforeId: other.id.to_s }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("invalidCursor")
    end
  end
end
