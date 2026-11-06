require "rails_helper"

RSpec.describe "Chat: conversas", type: :request do
  include ConnectorHelpers
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:team) { create(:team, organization: organization) }

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def ids
    json["chats"].map { |chat| chat["id"] }
  end

  describe "sessão e permissão" do
    let!(:chat) { chat_for }

    it "exige sessão" do
      get "/chats"
      expect(response).to have_http_status(:unauthorized)

      get "/chats/#{chat.id}"
      expect(response).to have_http_status(:unauthorized)

      patch "/chats/#{chat.id}", params: { chat: { status: "closed" } }, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão de chat" do
      headers = auth_headers(member_with(contacts: "all"))

      get "/chats", headers: headers
      expect(response).to have_http_status(:forbidden)

      get "/chats/#{chat.id}", headers: headers
      expect(response).to have_http_status(:forbidden)

      patch "/chats/#{chat.id}", params: { chat: { status: "closed" } }, headers: headers, as: :json
      expect(response).to have_http_status(:forbidden)

      delete "/chats/#{chat.id}", headers: headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /chats" do
    it "lista da mais recente para a mais antiga, sem a de teste nem a de outra organização" do
      older = chat_for(last_message_at: 2.days.ago)
      newer = chat_for(last_message_at: 1.hour.ago)
      chat_for(external_id: Chat::TEST_EXTERNAL_ID)
      create(:chat, organization: create(:organization))

      get "/chats", headers: headers

      expect(response).to have_http_status(:ok)
      expect(ids).to eq([ newer.id.to_s, older.id.to_s ])
      expect(json["chats"].first).to include("userName" => "Maria Souza", "status" => "open", "customAttributes" => {})
      expect(json["chats"].first["lastMessageAt"]).to be_a(Integer)
    end

    it "pagina sem contar o total" do
      3.times { |n| chat_for(last_message_at: n.hours.ago) }

      get "/chats", params: { perPage: 2 }, headers: headers
      expect(ids.size).to eq(2)
      expect(json["meta"]).to eq("page" => 1, "perPage" => 2, "hasMore" => true)

      get "/chats", params: { perPage: 2, page: 2 }, headers: headers
      expect(ids.size).to eq(1)
      expect(json["meta"]["hasMore"]).to be(false)
    end

    it "busca por nome, nome de exibição e telefone com máscara" do
      by_name = chat_for(user_name: "Fernanda Lima", external_id: "5541900000001")
      by_display = chat_for(user_name: "Outra", display_name: "Fernanda (trabalho)", external_id: "5541900000002")
      by_phone = chat_for(user_name: "Cliente", external_id: "5531971810932")
      chat_for(user_name: "Roberto", external_id: "5541900000004")

      get "/chats", params: { q: "fernanda" }, headers: headers
      expect(ids).to contain_exactly(by_name.id.to_s, by_display.id.to_s)

      get "/chats", params: { q: "(31) 97181-0932" }, headers: headers
      expect(ids).to contain_exactly(by_phone.id.to_s)
    end

    it "não interpreta a busca como regex" do
      chat_for(user_name: "Fernanda")

      get "/chats", params: { q: ".*" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(ids).to be_empty
    end

    it "filtra por situação, ignorando valor que não existe" do
      closed = chat_for(status: "closed")
      opened = chat_for(status: "open")

      get "/chats", params: { status: "closed" }, headers: headers
      expect(ids).to eq([ closed.id.to_s ])

      get "/chats", params: { status: "all" }, headers: headers
      expect(ids).to contain_exactly(closed.id.to_s, opened.id.to_s)
    end

    it "filtra por atribuição" do
      mine = chat_for(assigned_account_id: owner.id)
      unassigned = chat_for
      colleague = create(:account, organization: organization, role: "member")
      theirs = chat_for(assigned_account_id: colleague.id)

      get "/chats", params: { assignedUser: "me" }, headers: headers
      expect(ids).to eq([ mine.id.to_s ])

      get "/chats", params: { assignedUser: "unassigned" }, headers: headers
      expect(ids).to eq([ unassigned.id.to_s ])

      get "/chats", params: { assignedUser: colleague.id }, headers: headers
      expect(ids).to eq([ theirs.id.to_s ])
    end

    it "filtra por canal e por etiqueta" do
      connector = create(:connector_web_widget, organization: organization)
      tag = create(:chat_tag, organization_id: organization.id)
      in_connector = chat_for(connector: connector)
      tagged = chat_for(chat_tag_ids: [ tag.id ])

      get "/chats", params: { connectorIds: [ connector.id.to_s ] }, headers: headers
      expect(ids).to eq([ in_connector.id.to_s ])

      get "/chats", params: { tagIds: [ tag.id.to_s ] }, headers: headers
      expect(ids).to eq([ tagged.id.to_s ])
    end

    it "aplica filtros avançados vindos da query" do
      found = chat_for(custom_attributes: { "idade" => "30" })
      chat_for(custom_attributes: { "idade" => "9" })

      get "/chats",
          params: { filters: { "0" => { attributeKey: "custom_attributes.idade", filterOperator: "is_greater_than", values: [ "10" ], valueType: "number", queryOperator: "and" } } },
          headers: headers

      expect(response).to have_http_status(:ok)
      expect(ids).to eq([ found.id.to_s ])
    end

    it "não deixa o filtro escapar da organização" do
      foreign = create(:chat, organization: create(:organization))

      get "/chats",
          params: { filters: { "0" => { attributeKey: "organization_id", filterOperator: "equal_to", values: [ foreign.organization_id ], queryOperator: "and" } } },
          headers: headers

      expect(response).to have_http_status(:ok)
      expect(ids).not_to include(foreign.id.to_s)
    end

    it "junta filtro com `or`, busca e visibilidade sem que um apague o outro" do
      account = member_with(chat: "all", chat_list_to: "assigned")
      visible = chat_for(user_name: "Ana", assigned_account_id: account.id, status: "open")
      chat_for(user_name: "Ana", assigned_account_id: owner.id, status: "open")
      chat_for(user_name: "Bia", assigned_account_id: account.id, status: "open")

      get "/chats",
          params: {
            q: "ana",
            filters: {
              "0" => { attributeKey: "status", filterOperator: "equal_to", values: [ "open" ], queryOperator: "and" },
              "1" => { attributeKey: "audience_type", filterOperator: "equal_to", values: [ "web" ], queryOperator: "or" }
            }
          },
          headers: auth_headers(account)

      expect(ids).to eq([ visible.id.to_s ])
    end

    it "fixa a conversa pedida em `cid`, mesmo fora da busca" do
      pinned = chat_for(user_name: "Fixada")
      chat_for(user_name: "Procurada")

      get "/chats", params: { q: "procurada", cid: pinned.id.to_s }, headers: headers

      expect(json["chats"].map { |chat| chat["userName"] }).to eq(%w[Procurada Fixada])
    end

    it "não duplica a conversa fixada que já está na página" do
      pinned = chat_for

      get "/chats", params: { cid: pinned.id.to_s }, headers: headers

      expect(ids).to eq([ pinned.id.to_s ])
    end

    it "ignora `cid` de outra organização e de conversa que a pessoa não vê" do
      foreign = create(:chat, organization: create(:organization))

      get "/chats", params: { cid: foreign.id.to_s }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(ids).to be_empty
    end
  end

  describe "POST /chats/search" do
    it "aceita os filtros no corpo, para os que não cabem na URL" do
      found = chat_for(status: "closed")
      chat_for(status: "open")

      post "/chats/search",
           params: { filters: [ { attributeKey: "status", filterOperator: "equal_to", values: [ "closed" ], queryOperator: "and" } ] },
           headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(ids).to eq([ found.id.to_s ])
    end
  end

  # A regra que a origem só aplicava na lista.
  describe "visibilidade por chat_list_to" do
    let(:colleague) { create(:account, organization: organization, role: "member") }
    let!(:unowned) { chat_for }
    let!(:in_team) { chat_for(team_id: team.id) }
    let!(:other_team) { chat_for(team_id: create(:team, organization: organization).id) }
    let!(:assigned_to_colleague) { chat_for(assigned_account_id: colleague.id, team_id: team.id) }

    context "com `assigned`" do
      let(:account) { member_with(chat: "all", chat_list_to: "assigned") }
      let!(:mine) { chat_for(assigned_account_id: account.id) }
      let(:headers) { auth_headers(account) }

      it "a lista traz as dela e as sem dono" do
        get "/chats", headers: headers

        expect(ids).to contain_exactly(unowned.id.to_s, mine.id.to_s)
      end

      it "abrir a de outra pessoa responde 404" do
        get "/chats/#{assigned_to_colleague.id}", headers: headers

        expect(response).to have_http_status(:not_found)
      end

      it "alterar a de outra pessoa responde 404 e não muda nada" do
        patch "/chats/#{assigned_to_colleague.id}", params: { chat: { status: "closed" } }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
        expect(assigned_to_colleague.reload.status).to eq("open")
      end

      it "apagar a de outra pessoa responde 404 e não apaga" do
        delete "/chats/#{assigned_to_colleague.id}", headers: headers

        expect(response).to have_http_status(:not_found)
        expect(Chat.where(id: assigned_to_colleague.id).exists?).to be(true)
      end

      it "o histórico e os atributos da de outra pessoa respondem 404" do
        get "/chats/#{assigned_to_colleague.id}/messages", headers: headers
        expect(response).to have_http_status(:not_found)

        put "/chats/#{assigned_to_colleague.id}/attributes", params: { customAttributes: {} }, headers: headers, as: :json
        expect(response).to have_http_status(:not_found)
      end

      it "/chats/access conta o nível" do
        get "/chats/access", headers: headers

        expect(json).to eq("access" => "assigned", "accountId" => account.id)
      end
    end

    context "com `team`" do
      let(:account) { member_of_team(team, chat: "all", chat_list_to: "team") }
      let(:headers) { auth_headers(account) }

      it "a lista traz as do departamento e as sem departamento" do
        get "/chats", headers: headers

        expect(ids).to contain_exactly(unowned.id.to_s, in_team.id.to_s, assigned_to_colleague.id.to_s)
      end

      it "abre a do próprio departamento" do
        get "/chats/#{in_team.id}", headers: headers

        expect(response).to have_http_status(:ok)
      end

      it "a de outro departamento responde 404" do
        get "/chats/#{other_team.id}", headers: headers

        expect(response).to have_http_status(:not_found)
      end

      it "/chats/access conta os departamentos" do
        get "/chats/access", headers: headers

        expect(json).to eq("access" => "team", "teamIds" => [ team.id ])
      end
    end

    context "com `all`" do
      let(:headers) { auth_headers(member_with(chat: "all", chat_list_to: "all")) }

      it "traz todas e /chats/access diz isso" do
        get "/chats", headers: headers
        expect(ids.size).to eq(4)

        get "/chats/access", headers: headers
        expect(json).to eq("access" => "all")
      end
    end
  end

  describe "GET /chats/lookup" do
    let!(:chat) { chat_for(user_name: "Fernanda Lima", display_name: "Fê") }

    it "traz só o necessário para escolher" do
      get "/chats/lookup", params: { q: "fernanda" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["chats"]).to eq(
        [ { "id" => chat.id.to_s, "userName" => "Fernanda Lima", "displayName" => "Fê", "externalId" => chat.external_id, "profilePictureUrl" => nil } ]
      )
    end

    it "tem teto de 10" do
      11.times { chat_for }

      get "/chats/lookup", headers: headers

      expect(json["chats"].size).to eq(10)
    end

    it "serve a pipelines e agenda, sem a permissão de chat" do
      get "/chats/lookup", headers: auth_headers(member_with(pipelines: "all"))
      expect(response).to have_http_status(:ok)

      get "/chats/lookup", headers: auth_headers(member_with(calendar: "all"))
      expect(response).to have_http_status(:ok)
    end

    it "recusa quem não tem nenhuma delas" do
      get "/chats/lookup", headers: auth_headers(member_with(catalog: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    it "respeita chat_list_to e a organização" do
      foreign = create(:chat, organization: create(:organization), user_name: "Fernanda Lima")
      assigned = chat_for(user_name: "Fernanda Lima", assigned_account_id: owner.id)

      get "/chats/lookup", params: { q: "fernanda" }, headers: auth_headers(member_with(chat: "all", chat_list_to: "assigned"))

      returned = json["chats"].map { |entry| entry["id"] }
      expect(returned).to eq([ chat.id.to_s ])
      expect(returned).not_to include(foreign.id.to_s, assigned.id.to_s)
    end
  end

  describe "GET /chats/:id" do
    it "traz a conversa, os campos personalizados e o provedor" do
      connector = create(:connector_whatsapp_web, organization: organization)
      chat = chat_for(connector: connector, custom_attributes: { "cidade" => "Curitiba" })
      create(:custom_field, organization_id: organization.id, name: "Cidade", value_type: "list", option_values: %w[Curitiba])
      create(:custom_field, name: "De fora")

      get "/chats/#{chat.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["chat"]).to include("id" => chat.id.to_s, "customAttributes" => { "cidade" => "Curitiba" })
      expect(json["connectorProvider"]).to eq("evolution_api")
      expect(json["attributeList"]).to eq(
        [ { "name" => "Cidade", "key" => "cidade", "description" => nil, "valueType" => "list", "optionValues" => %w[Curitiba] } ]
      )
    end

    it "não muda nada ao ler" do
      chat = chat_for(unread_messages: 3)

      get "/chats/#{chat.id}", headers: headers

      expect(chat.reload.unread_messages).to eq(3)
    end

    it "responde 404 para a de outra organização" do
      get "/chats/#{create(:chat, organization: create(:organization)).id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(json["error"]["code"]).to eq("notFound")
    end

    it "responde 404 para id que não é id" do
      get "/chats/isto-nao-e-id", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /chats" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }

    it "cria a conversa no canal, com a automação padrão da organização" do
      organization.update_automation_settings!(default_automation_enabled: false)

      expect {
        post "/chats", params: { connectorId: connector.id.to_s, externalId: "+55 (31) 97181-0932", userName: "Fernanda" }, headers: headers, as: :json
      }.to change(Chat, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json["chat"]).to include("externalId" => "5531971810932", "userName" => "Fernanda", "connectorId" => connector.id.to_s, "automationEnabled" => false)
    end

    it "acha a que já existe pelas variantes do número, sobe na lista e responde 200" do
      existing = chat_for(connector: connector, external_id: "5531971810932@s.whatsapp.net", last_message_at: 3.days.ago)

      expect {
        post "/chats", params: { connectorId: connector.id.to_s, externalId: "553171810932" }, headers: headers, as: :json
      }.not_to change(Chat, :count)

      expect(response).to have_http_status(:ok)
      expect(json["chat"]["id"]).to eq(existing.id.to_s)
      expect(existing.reload.last_message_at).to be > 1.minute.ago
    end

    it "na WABA, usa o número pedido ou o principal" do
      connector = create(:connector_whatsapp_cloud, organization: organization, phone_number_id: 111)

      post "/chats", params: { connectorId: connector.id.to_s, externalId: "5531971810932" }, headers: headers, as: :json
      expect(json["chat"]["senderPhoneNumberId"]).to eq("111")

      post "/chats", params: { connectorId: connector.id.to_s, externalId: "5531971810933", phoneNumberId: "222" }, headers: headers, as: :json
      expect(json["chat"]["senderPhoneNumberId"]).to eq("222")
    end

    it "não usa canal de outra organização" do
      foreign = create(:connector_whatsapp_web, organization: create(:organization))

      post "/chats", params: { connectorId: foreign.id.to_s, externalId: "5531971810932" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidConnector", "field" => "connectorId")
    end

    it "responde 422 em canal que não começa conversa pelo número" do
      widget = create(:connector_web_widget, organization: organization)

      post "/chats", params: { connectorId: widget.id.to_s, externalId: "5531971810932" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("connectorTypeMismatch")
    end

    it "responde 422 sem número" do
      post "/chats", params: { connectorId: connector.id.to_s, externalId: "abc" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidPhone", "field" => "externalId")
    end
  end

  describe "PATCH /chats/:id" do
    let(:chat) { chat_for }

    it "altera o que a tela edita" do
      patch "/chats/#{chat.id}", params: { chat: { status: "closed", notes: "Ligar amanhã", displayName: "Fê" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["chat"]).to include("status" => "closed", "notes" => "Ligar amanhã", "displayName" => "Fê")
    end

    it "não deixa mudar campo fora da lista" do
      patch "/chats/#{chat.id}", params: { chat: { externalId: "999", organizationId: "outra", notes: "ok" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(chat.reload.external_id).not_to eq("999")
      expect(chat.organization_id).to eq(organization.id)
    end

    it "responde 422 com situação inválida" do
      patch "/chats/#{chat.id}", params: { chat: { status: "arquivada" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("field" => "status", "message" => "situação não está na lista")
    end

    it "responde 422 com nome de exibição longo demais" do
      patch "/chats/#{chat.id}", params: { chat: { displayName: "x" * 121 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("displayName")
    end

    it "responde 400 sem o envelope" do
      patch "/chats/#{chat.id}", params: { status: "closed" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json["error"]["code"]).to eq("parameterMissing")
    end

    it "transmite para a lista" do
      chat
      stream = ApplicationCable::Channel.organization_stream(organization.id, "chat-list")

      expect {
        patch "/chats/#{chat.id}", params: { chat: { notes: "x" } }, headers: headers, as: :json
      }.to have_broadcasted_to(stream).with(hash_including("action" => "upsert"))
    end

    describe "atribuição" do
      let(:attendant) { create(:account, organization: organization, role: "member", name: "Camila Rocha") }

      it "atribui e registra quem foi, na nota do histórico" do
        patch "/chats/#{chat.id}", params: { chat: { assignedAccountId: attendant.id } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["chat"]["assignedAccountId"]).to eq(attendant.id)
        note = ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "assigned-user-notation").take
        expect(note.content).to include("Marina Duarte", "Camila Rocha")
      end

      it "tira a atribuição" do
        chat.update(assigned_account_id: attendant.id)

        patch "/chats/#{chat.id}", params: { chat: { assignedAccountId: nil } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(chat.reload.assigned_account_id).to be_nil
      end

      it "recusa quem está em setupOnly: administra, mas não atende" do
        setup = create(:account, organization: organization, role: "member", setup_only: true)

        patch "/chats/#{chat.id}", params: { chat: { assignedAccountId: setup.id } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidAssignee", "field" => "assignedAccountId")
        expect(chat.reload.assigned_account_id).to be_nil
      end

      it "recusa quem perdeu o acesso" do
        attendant.revoke!

        patch "/chats/#{chat.id}", params: { chat: { assignedAccountId: attendant.id } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "recusa pessoa de outra organização" do
        foreign = create(:account, organization: create(:organization))

        patch "/chats/#{chat.id}", params: { chat: { assignedAccountId: foreign.id } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end

      it "não barra a edição de uma conversa de quem virou setupOnly depois" do
        chat.update(assigned_account_id: attendant.id)
        attendant.update!(setup_only: true)

        patch "/chats/#{chat.id}", params: { chat: { assignedAccountId: attendant.id, notes: "ok" } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end

      it "transfere para um departamento da organização" do
        patch "/chats/#{chat.id}", params: { chat: { teamId: team.id } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["chat"]["teamId"]).to eq(team.id)
      end

      it "recusa departamento de outra organização" do
        foreign = create(:team, organization: create(:organization))

        patch "/chats/#{chat.id}", params: { chat: { teamId: foreign.id } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidTeam", "field" => "teamId")
      end
    end

    describe "automação" do
      it "registra quem pausou" do
        patch "/chats/#{chat.id}", params: { chat: { automationEnabled: false } }, headers: headers, as: :json

        note = ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").take
        expect(note.content).to include("Marina Duarte")
      end

      # Sem isto, uma pausa decidida à mão se desfazia quando o agendamento de uma pausa anterior chegasse.
      it "uma mudança à mão invalida o religamento agendado" do
        chat.update(automation_enabled: false, active_job_id: "token-antigo", automation_resume_at: 1.hour.from_now)

        patch "/chats/#{chat.id}", params: { chat: { automationEnabled: false } }, headers: headers, as: :json

        expect(chat.reload).to have_attributes(active_job_id: nil, automation_resume_at: nil)

        EnableContactJob.perform_now(chat.id.to_s, organization.id, "token-antigo")

        expect(chat.reload.automation_enabled).to be(false)
      end
    end
  end

  describe "DELETE /chats/:id" do
    let(:connector) { create(:connector_web_widget, organization: organization) }
    let(:chat) { chat_for(connector: connector) }

    it "apaga a conversa com tudo o que é dela, inclusive o que o escopo padrão esconde" do
      create(:chat_text_message, chat: chat)
      ChatMessage::Text.create!(chat: chat, role: "base", role_base_type: "automation-toggle-notation", content: "nota")
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "parte", is_span: true)
      ChatMessage::Text.create!(chat: chat, role: "user", content: "antes da limpeza", active: false)
      field = create(:custom_field, organization_id: organization.id)
      create(:custom_field_value, custom_field: field, chat: chat)

      delete "/chats/#{chat.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Chat.where(id: chat.id).exists?).to be(false)
      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id).count).to eq(0)
      expect(CustomFieldValue.where(chat_id: chat.id).count).to eq(0)
    end

    it "apaga o arquivo da mensagem" do
      blob = Media::Storage.store_io(StringIO.new("audio"), filename: "a.ogg", content_type: "audio/ogg")
      ChatMessage::Audio.create!(chat: chat, role: "user", content: "-", audio_url: "/x", media_blob_id: blob.id.to_s)

      perform_enqueued_jobs(only: ActiveStorage::PurgeJob) { delete "/chats/#{chat.id}", headers: headers }

      expect(ActiveStorage::Blob.find_by(id: blob.id)).to be_nil
    end

    it "avisa a lista" do
      chat
      stream = ApplicationCable::Channel.organization_stream(organization.id, "chat-list")

      expect {
        delete "/chats/#{chat.id}", headers: headers
      }.to have_broadcasted_to(stream).with(action: "remove", event: { id: chat.id.to_s })
    end

    it "não alcança a de outra organização" do
      foreign = create(:chat, organization: create(:organization))

      delete "/chats/#{foreign.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Chat.where(id: foreign.id).exists?).to be(true)
    end
  end

  describe "PUT /chats/:id/attributes" do
    let(:chat) { chat_for(custom_attributes: { "antigo" => "x" }) }

    it "substitui o mapa e guarda número como texto, como todo o produto espera" do
      put "/chats/#{chat.id}/attributes", params: { customAttributes: { "cidade" => "Curitiba", "idade" => 30, "ativo" => true } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["customAttributes"]).to eq("cidade" => "Curitiba", "idade" => "30", "ativo" => "true")
      expect(chat.reload.custom_attributes).to eq("cidade" => "Curitiba", "idade" => "30", "ativo" => "true")
    end

    it "mantém as chaves como vieram, sem virar snake_case" do
      put "/chats/#{chat.id}/attributes", params: { customAttributes: { "faixaEtaria" => "30" } }, headers: headers, as: :json

      expect(chat.reload.custom_attributes).to eq("faixaEtaria" => "30")
    end

    it "aplica a normalização do campo" do
      create(:custom_field, organization_id: organization.id, name: "Volume", auto_normalize: true)

      put "/chats/#{chat.id}/attributes", params: { customAttributes: { "volume" => "R$ 50.000,00" } }, headers: headers, as: :json

      expect(json["customAttributes"]["volume"]).to eq("50000")
    end

    it "responde 422 sem mapa" do
      put "/chats/#{chat.id}/attributes", params: { customAttributes: "texto" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidAttributes", "field" => "customAttributes")
    end

    it "responde 422 com chave que não dá para consultar depois" do
      put "/chats/#{chat.id}/attributes", params: { customAttributes: { "a.b" => "x" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      put "/chats/#{chat.id}/attributes", params: { customAttributes: { "$set" => "x" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para a de outra organização" do
      put "/chats/#{create(:chat, organization: create(:organization)).id}/attributes", params: { customAttributes: {} }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /chats/:id/read" do
    it "zera as não lidas" do
      chat = chat_for(unread_messages: 4)

      post "/chats/#{chat.id}/read", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["chat"]["unreadMessages"]).to eq(0)
    end
  end

  describe "GET /chats/self-filter" do
    it "traz os canais que conversam, sem segredos" do
      widget = create(:connector_web_widget, organization: organization)
      web = create(:connector_whatsapp_web, organization: organization)
      create(:connector_web_widget, organization: create(:organization))

      get "/chats/self-filter", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["connectors"].map { |connector| connector["id"] }).to eq([ widget.id.to_s, web.id.to_s ])
      expect(json.to_json).not_to include("chave-evolution")
    end
  end

  describe "GET /chats/people" do
    it "traz só quem pode receber atendimento" do
      attendant = create(:account, organization: organization, role: "member", name: "Camila")
      create(:account, organization: organization, role: "member", name: "Beatriz", setup_only: true)
      create(:account, organization: organization, role: "member", name: "Revogada").revoke!
      create(:account, organization: create(:organization), name: "De fora")
      owner

      get "/chats/people", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["people"].map { |person| person["id"] }).to contain_exactly(owner.id, attendant.id)
      expect(json["people"].first.keys).to contain_exactly("id", "name", "email", "avatarUrl", "teamIds", "setupOnly")
    end
  end

  describe "GET /chats/teams" do
    it "diz quais departamentos a pessoa enxerga" do
      account = member_of_team(team, chat: "all", chat_list_to: "team")
      other = create(:team, organization: organization)

      get "/chats/teams", headers: auth_headers(account)

      expect(json["teams"]).to contain_exactly(
        { "id" => team.id, "name" => team.name, "visible" => true },
        { "id" => other.id, "name" => other.name, "visible" => false }
      )
    end

    it "quem vê tudo enxerga todos" do
      team

      get "/chats/teams", headers: headers

      expect(json["teams"].map { |entry| entry["visible"] }).to all(be(true))
    end
  end
end
