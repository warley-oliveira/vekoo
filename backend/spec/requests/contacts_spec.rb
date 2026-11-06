require "rails_helper"
require "csv"

RSpec.describe "Contatos", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def tag_for(org = organization, **attributes)
    create(:chat_tag, organization_id: org.id, **attributes)
  end

  def ids
    json["contacts"].map { |contact| contact["id"] }
  end

  describe "sessão e permissão" do
    it "exige sessão" do
      get "/contacts"
      expect(response).to have_http_status(:unauthorized)

      post "/contacts/bulk-update-status", params: { status: "open" }, as: :json
      expect(response).to have_http_status(:unauthorized)

      get "/contacts/export"
      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão de contatos" do
      headers = auth_headers(member_with(chat: "all"))

      [ "/contacts", "/contacts/filters", "/contacts/export" ].each do |path|
        get path, headers: headers
        expect(response).to have_http_status(:forbidden)
      end

      post "/contacts/bulk-update-status", params: { status: "open", chatIds: [ "x" ] }, headers: headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /contacts" do
    it "lista com o canal, em camelCase, e paginado com total" do
      connector = create(:connector_whatsapp_web, organization: organization, profile_name: "Doma Store")
      tag = tag_for
      chat = chat_for(connector: connector, user_name: "Fernanda", external_id: "5531971810932@s.whatsapp.net", chat_tag_ids: [ tag.id ], last_message_at: 1.hour.ago)
      chat_for(last_message_at: 2.hours.ago)

      get "/contacts", params: { perPage: 1 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["contacts"].first).to include(
        "id" => chat.id.to_s, "userName" => "Fernanda", "phoneNumber" => "5531971810932", "connectorId" => connector.id.to_s,
        "connectorName" => "Doma Store", "connectorType" => "whatsapp_web", "tagIds" => [ tag.id.to_s ], "lastMessageFrom" => "1h"
      )
      expect(json["contacts"].first["createdAt"]).to be_a(Integer)
      expect(json["meta"]).to eq("page" => 1, "perPage" => 1, "total" => 2, "totalPages" => 2, "hasMore" => true)
    end

    it "deixa de fora a de teste e a de outra organização" do
      chat_for(external_id: Chat::TEST_EXTERNAL_ID)
      create(:chat, organization: create(:organization))

      get "/contacts", headers: headers

      expect(ids).to be_empty
    end

    it "filtra" do
      connector = create(:connector_web_widget, organization: organization)
      tag = tag_for
      colleague = create(:account, organization: organization, role: "member")
      a = chat_for(user_name: "Ana", status: "closed", automation_enabled: false, connector: connector)
      b = chat_for(user_name: "Bia", chat_tag_ids: [ tag.id ], assigned_account_id: colleague.id, session_start_at: 1.hour.ago)
      c = chat_for(user_name: "Cris", assigned_account_id: owner.id, session_start_at: 3.days.ago)

      {
        { q: "ana" } => [ a ],
        { status: "closed" } => [ a ],
        { automationEnabled: "false" } => [ a ],
        { connectorIds: [ connector.id.to_s ] } => [ a ],
        { tagIds: [ tag.id.to_s ] } => [ b ],
        { assignedUser: "me" } => [ c ],
        { assignedUser: "unassigned" } => [ a ],
        { assignedUser: colleague.id } => [ b ],
        { hasSession: "true" } => [ b ]
      }.each do |filter, expected|
        get "/contacts", params: filter, headers: headers
        expect(ids).to match_array(expected.map { |chat| chat.id.to_s }), "filtro #{filter}"
      end
    end

    it "filtra por data no fuso da organização, até o fim do dia" do
      inside = chat_for
      inside.set(created_at: ActiveSupport::TimeZone["America/Sao_Paulo"].parse("2026-01-10 23:30"))
      after = chat_for
      after.set(created_at: ActiveSupport::TimeZone["America/Sao_Paulo"].parse("2026-01-11 00:30"))

      get "/contacts", params: { dateFrom: "2026-01-10", dateTo: "2026-01-10" }, headers: headers

      expect(ids).to eq([ inside.id.to_s ])
    end

    it "ignora data inválida em vez de estourar" do
      chat_for

      get "/contacts", params: { dateFrom: "não-é-data" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(ids.size).to eq(1)
    end

    it "ordena pelo campo pedido, e só pelos conhecidos" do
      a = chat_for(user_name: "Ana")
      b = chat_for(user_name: "Bia")

      get "/contacts", params: { sortBy: "user_name", sortDir: "asc" }, headers: headers
      expect(ids).to eq([ a.id.to_s, b.id.to_s ])

      get "/contacts", params: { sortBy: "user_name", sortDir: "desc" }, headers: headers
      expect(ids).to eq([ b.id.to_s, a.id.to_s ])

      get "/contacts", params: { sortBy: "organization_id; drop" }, headers: headers
      expect(response).to have_http_status(:ok)
    end

    it "respeita chat_list_to: na origem esta lista ignorava a permissão" do
      account = member_with(contacts: "all", chat_list_to: "assigned")
      mine = chat_for(assigned_account_id: account.id)
      chat_for(assigned_account_id: owner.id)

      get "/contacts", headers: auth_headers(account)

      expect(ids).to eq([ mine.id.to_s ])
    end
  end

  describe "GET /contacts/filters" do
    it "traz as opções da organização" do
      connector = create(:connector_web_widget, organization: organization)
      tag = tag_for(name: "vip")
      team = create(:team, organization: organization, name: "Comercial")
      owner
      create(:connector_web_widget, organization: create(:organization))
      tag_for(create(:organization))

      get "/contacts/filters", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["connectors"].map { |c| c["id"] }).to eq([ connector.id.to_s ])
      expect(json["tags"].map { |t| t["id"] }).to eq([ tag.id.to_s ])
      expect(json["teams"]).to eq([ { "id" => team.id, "name" => "Comercial" } ])
      expect(json["users"]).to eq([ { "id" => owner.id, "name" => owner.name } ])
    end
  end

  describe "ações em lote" do
    let(:tag) { tag_for }
    let!(:first) { chat_for(user_name: "Ana", status: "open") }
    let!(:second) { chat_for(user_name: "Bia", status: "open") }
    let(:foreign) { create(:chat, organization: create(:organization), status: "open") }

    describe "POST /contacts/bulk-add-tags" do
      it "aplica nos marcados" do
        post "/contacts/bulk-add-tags", params: { chatIds: [ first.id.to_s ], tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json).to eq("updatedCount" => 1)
        expect(first.reload.chat_tag_ids).to eq([ tag.id ])
        expect(second.reload.chat_tag_ids).to be_empty
      end

      it "aplica em todos do filtro, menos os desmarcados" do
        third = chat_for(user_name: "Ana Clara")

        post "/contacts/bulk-add-tags",
             params: { selectAll: true, filters: { q: "ana" }, excludedIds: [ third.id.to_s ], tagIds: [ tag.id.to_s ] },
             headers: headers, as: :json

        expect(json).to eq("updatedCount" => 1)
        expect(first.reload.chat_tag_ids).to eq([ tag.id ])
        expect(third.reload.chat_tag_ids).to be_empty
        expect(second.reload.chat_tag_ids).to be_empty
      end

      it "não repete etiqueta nem conta quem já tinha" do
        first.add_to_set(chat_tag_ids: tag.id)

        post "/contacts/bulk-add-tags", params: { chatIds: [ first.id.to_s ], tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 0)
        expect(first.reload.chat_tag_ids).to eq([ tag.id ])
      end

      # Na origem os ids marcados iam direto para o banco, sem escopo.
      it "não alcança conversa de outra organização, mesmo pelo id" do
        post "/contacts/bulk-add-tags", params: { chatIds: [ foreign.id.to_s ], tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 0)
        expect(foreign.reload.chat_tag_ids).to be_empty
      end

      it "não aplica etiqueta de outra organização" do
        post "/contacts/bulk-add-tags", params: { chatIds: [ first.id.to_s ], tagIds: [ tag_for(create(:organization)).id.to_s ] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidTags", "field" => "tagIds")
        expect(first.reload.chat_tag_ids).to be_empty
      end

      it "responde 422 sem etiquetas" do
        post "/contacts/bulk-add-tags", params: { chatIds: [ first.id.to_s ], tagIds: [] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]["code"]).to eq("noTagsSelected")
      end

      it "responde 422 sem seleção" do
        post "/contacts/bulk-add-tags", params: { tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "noChatsSelected", "field" => "chatIds")
      end

      it "responde 422 acima do teto de marcados" do
        stub_const("Contacts::Selection::MAX_IDS", 1)

        post "/contacts/bulk-add-tags", params: { chatIds: [ first.id.to_s, second.id.to_s ], tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]["code"]).to eq("tooManyRecipients")
      end
    end

    describe "POST /contacts/bulk-remove-tags" do
      it "tira dos marcados" do
        first.add_to_set(chat_tag_ids: tag.id)

        post "/contacts/bulk-remove-tags", params: { chatIds: [ first.id.to_s ], tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 1)
        expect(first.reload.chat_tag_ids).to be_empty
      end

      it "não alcança conversa de outra organização" do
        foreign_tag = tag_for(foreign.organization)
        foreign.add_to_set(chat_tag_ids: foreign_tag.id)

        post "/contacts/bulk-remove-tags", params: { chatIds: [ foreign.id.to_s ], tagIds: [ tag.id.to_s ] }, headers: headers, as: :json

        expect(foreign.reload.chat_tag_ids).to eq([ foreign_tag.id ])
      end
    end

    describe "POST /contacts/bulk-assign-user" do
      let(:attendant) { create(:account, organization: organization, role: "member") }

      it "atribui" do
        post "/contacts/bulk-assign-user", params: { chatIds: [ first.id.to_s, second.id.to_s ], accountId: attendant.id }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 2)
        expect(first.reload.assigned_account_id).to eq(attendant.id)
      end

      it "tira a atribuição" do
        first.update(assigned_account_id: attendant.id)

        post "/contacts/bulk-assign-user", params: { chatIds: [ first.id.to_s ], accountId: nil }, headers: headers, as: :json

        expect(first.reload.assigned_account_id).to be_nil
      end

      it "recusa quem está em setupOnly" do
        setup = create(:account, organization: organization, role: "member", setup_only: true)

        post "/contacts/bulk-assign-user", params: { chatIds: [ first.id.to_s ], accountId: setup.id }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidAssignee", "field" => "accountId")
      end

      it "recusa pessoa de outra organização" do
        post "/contacts/bulk-assign-user", params: { chatIds: [ first.id.to_s ], accountId: create(:account, organization: create(:organization)).id }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
      end
    end

    describe "POST /contacts/bulk-update-status" do
      it "muda a situação" do
        post "/contacts/bulk-update-status", params: { chatIds: [ first.id.to_s ], status: "closed" }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 1)
        expect(first.reload.status).to eq("closed")
      end

      it "responde 422 com situação inválida" do
        post "/contacts/bulk-update-status", params: { chatIds: [ first.id.to_s ], status: "arquivada" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "invalidStatus", "field" => "status")
      end

      it "não alcança conversa de outra organização" do
        post "/contacts/bulk-update-status", params: { chatIds: [ foreign.id.to_s ], status: "closed" }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 0)
        expect(foreign.reload.status).to eq("open")
      end

      it "`selectAll` respeita chat_list_to" do
        account = member_with(contacts: "all", chat_list_to: "assigned")
        mine = chat_for(assigned_account_id: account.id)
        theirs = chat_for(assigned_account_id: owner.id)

        post "/contacts/bulk-update-status", params: { selectAll: true, status: "closed" }, headers: auth_headers(account), as: :json

        expect(mine.reload.status).to eq("closed")
        expect(theirs.reload.status).to eq("open")
      end

      it "os marcados respeitam chat_list_to" do
        account = member_with(contacts: "all", chat_list_to: "assigned")
        theirs = chat_for(assigned_account_id: owner.id)

        post "/contacts/bulk-update-status", params: { chatIds: [ theirs.id.to_s ], status: "closed" }, headers: auth_headers(account), as: :json

        expect(json).to eq("updatedCount" => 0)
        expect(theirs.reload.status).to eq("open")
      end
    end

    describe "POST /contacts/bulk-toggle-automation" do
      it "muda a automação e invalida o religamento agendado" do
        first.update(automation_enabled: true, active_job_id: "token", automation_resume_at: 1.hour.from_now)

        post "/contacts/bulk-toggle-automation", params: { chatIds: [ first.id.to_s ], automationEnabled: false }, headers: headers, as: :json

        expect(json).to eq("updatedCount" => 1)
        expect(first.reload).to have_attributes(automation_enabled: false, active_job_id: nil, automation_resume_at: nil)
      end

      it "responde 422 sem o valor" do
        post "/contacts/bulk-toggle-automation", params: { chatIds: [ first.id.to_s ] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]["field"]).to eq("automationEnabled")
      end
    end
  end

  describe "GET /contacts/export" do
    def rows
      CSV.parse(response.body)
    end

    it "não repete nem perde ninguém entre os lotes, mesmo com a mesma data de criação" do
      stub_const("Contacts::CsvExport::BATCH_SIZE", 2)
      moment = Time.utc(2026, 9, 1, 10, 30)
      names = %w[Ana Bia Caio Dani Elis]
      names.each { |name| chat_for(user_name: name, created_at: moment) }

      get "/contacts/export", headers: headers

      expect(rows.drop(1).map(&:first)).to match_array(names)
    end

    it "gera o CSV, com o fuso da organização e os campos personalizados" do
      create(:custom_field, organization_id: organization.id, name: "Cidade")
      connector = create(:connector_whatsapp_web, organization: organization, profile_name: "Doma Store")
      team = create(:team, organization: organization, name: "Comercial")
      tag = tag_for(name: "vip")
      chat_for(
        connector: connector, user_name: "Fernanda", external_id: "5531971810932@s.whatsapp.net", assigned_account_id: owner.id, team_id: team.id,
        chat_tag_ids: [ tag.id ], custom_attributes: { "cidade" => "Curitiba" }, created_at: Time.utc(2026, 9, 1, 10, 30), last_message_at: Time.utc(2026, 9, 2, 11, 45)
      )

      get "/contacts/export", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.headers["Content-Type"]).to include("text/csv")
      expect(response.headers["Content-Disposition"]).to include("attachment", "contatos-")
      expect(rows.first).to eq([ "Nome", "Telefone", "Canal", "Situação", "Automação", "Atribuído a", "Departamento", "Etiquetas", "Última mensagem", "Criado em", "Cidade" ])
      expect(rows.last).to eq([ "Fernanda", "5531971810932", "Doma Store", "Aberta", "Sim", "Marina Duarte", "Comercial", "vip", "02/09/2026 08:45", "01/09/2026 07:30", "Curitiba" ])
    end

    it "sai no idioma pedido" do
      chat_for(status: "closed", automation_enabled: false)

      get "/contacts/export", params: { locale: "en" }, headers: headers

      expect(rows.first.first(4)).to eq(%w[Name Phone Channel Status])
      expect(rows.last[3..4]).to eq(%w[Closed No])
    end

    it "não deixa fórmula passar como fórmula" do
      chat_for(user_name: "=1+1")

      get "/contacts/export", headers: headers

      expect(rows.last.first).to eq("'=1+1")
    end

    it "exporta só os marcados, dentro do que a pessoa pode ver" do
      account = member_with(contacts: "all", chat_list_to: "assigned")
      mine = chat_for(user_name: "Minha", assigned_account_id: account.id)
      theirs = chat_for(user_name: "Dela", assigned_account_id: owner.id)
      foreign = create(:chat, organization: create(:organization), user_name: "De fora")

      get "/contacts/export", params: { chatIds: [ mine.id.to_s, theirs.id.to_s, foreign.id.to_s ] }, headers: auth_headers(account)

      expect(rows.drop(1).map(&:first)).to eq([ "Minha" ])
    end

    it "exporta todos do filtro, menos os desmarcados" do
      chat_for(user_name: "Ana")
      skipped = chat_for(user_name: "Ana B")
      chat_for(user_name: "Bia")

      get "/contacts/export", params: { selectAll: "true", q: "ana", excludedIds: [ skipped.id.to_s ] }, headers: headers

      expect(rows.drop(1).map(&:first)).to eq([ "Ana" ])
    end

    it "sem seleção, vale o filtro" do
      chat_for(user_name: "Ana", status: "closed")
      chat_for(user_name: "Bia", status: "open")

      get "/contacts/export", params: { status: "closed" }, headers: headers

      expect(rows.drop(1).map(&:first)).to eq([ "Ana" ])
    end

    it "manda listas grandes para o segundo plano" do
      stub_const("ContactsController::MAX_SYNC_EXPORT", 1)
      2.times { chat_for }

      get "/contacts/export", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("exportTooLarge")
    end
  end

  describe "GET /contacts/download-export" do
    include ActiveSupport::Testing::TimeHelpers

    let(:blob) { Media::Storage.store_io(StringIO.new("Nome\nFernanda\n"), filename: "contatos-2026-11-06.csv", content_type: "text/csv") }

    def token(account_id: owner.id, organization_id: organization.id)
      Contacts::ExportToken.generate(blob_id: blob.id, account_id: account_id, organization_id: organization_id)
    end

    it "com o token, entrega sem sessão, como anexo" do
      get "/contacts/download-export", params: { token: token }

      expect(response).to have_http_status(:found)
      follow_redirect!
      expect(response).to have_http_status(:ok)
      expect(response.body).to include("Fernanda")
      expect(response.headers["Content-Disposition"]).to include("attachment")
    end

    it "responde 400 sem token" do
      get "/contacts/download-export"

      expect(response).to have_http_status(:bad_request)
      expect(json["error"]["code"]).to eq("exportTokenMissing")
    end

    it "responde 403 com token adulterado" do
      get "/contacts/download-export", params: { token: "#{token}x" }

      expect(response).to have_http_status(:forbidden)
      expect(json["error"]["code"]).to eq("exportTokenInvalid")
    end

    it "responde 410 com o link vencido" do
      issued = token

      travel_to(2.hours.from_now) { get "/contacts/download-export", params: { token: issued } }

      expect(response).to have_http_status(:gone)
      expect(json["error"]["code"]).to eq("exportExpired")
    end

    it "responde 404 quando o arquivo já saiu" do
      issued = token
      blob.purge

      get "/contacts/download-export", params: { token: issued }

      expect(response).to have_http_status(:not_found)
      expect(json["error"]["code"]).to eq("exportNotFound")
    end

    it "responde 403 para quem perdeu o acesso depois" do
      issued = token
      owner.revoke!

      get "/contacts/download-export", params: { token: issued }

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 403 para quem perdeu a permissão de contatos" do
      account = member_with(contacts: "all")
      issued = token(account_id: account.id)
      account.access_role.update!(permissions: AccessRole::BLANK_PERMISSIONS)

      get "/contacts/download-export", params: { token: issued }

      expect(response).to have_http_status(:forbidden)
    end
  end
end
