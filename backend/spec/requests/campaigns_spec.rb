require "rails_helper"

# Origem: spec/requests/api/platform/campaigns_spec.rb e campaigns_lifecycle_spec.rb. Lá eram dublês;
# aqui a requisição entra como a API manda, e tudo é de verdade até o provedor.
RSpec.describe "Campanhas", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:headers) { auth_headers(owner) }

  def payload(**extra)
    {
      name: "Recompra de novembro",
      messageType: "text",
      campaignMode: "text",
      messages: [ "Oi {{nome}}, tudo bem?" ],
      connectorIds: [ connector.id.to_s ],
      phoneNumberIds: [],
      templateIds: [],
      templateParams: {},
      chatTagIds: [],
      raiseChats: true,
      sendWindowStart: "09:00",
      sendWindowEnd: "18:00",
      sendDays: [ 1, 2, 3, 4, 5 ],
      intervalMin: 300,
      intervalMax: 1800,
      dailyLimitPerConnector: 500,
      timezone: "America/Sao_Paulo"
    }.merge(extra)
  end

  def campaign_of(**attributes)
    create(:outreach_campaign, organization: organization, connector_ids: [ connector.id.to_s ], **attributes)
  end

  describe "sessão e permissão" do
    let(:campaign) { campaign_of }

    it "sem sessão, responde 401" do
      get "/campaigns", as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(json.dig("error", "code")).to eq("unauthorized")
    end

    it "sem sessão, nenhuma ação passa" do
      post "/campaigns/#{campaign.id}/launch", as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(campaign.reload.status_cd).to eq("draft")
    end

    context "sem a permissão de campanhas" do
      let(:role) { create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS) }
      let(:member) { create(:account, organization: organization, role: "member", access_role: role) }

      it "não lista" do
        get "/campaigns", headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
        expect(json.dig("error", "code")).to eq("forbidden")
      end

      it "não cria" do
        expect { post "/campaigns", params: payload, headers: auth_headers(member), as: :json }
          .not_to(change { Outreach::Campaign.count })

        expect(response).to have_http_status(:forbidden)
      end

      it "não lança" do
        post "/campaigns/#{campaign.id}/launch", headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
      end

      %w[summary capabilities available-connectors available-tags available-flows].each do |path|
        it "não lê #{path}" do
          get "/campaigns/#{path}", headers: auth_headers(member), as: :json

          expect(response).to have_http_status(:forbidden)
        end
      end

      it "não importa" do
        post "/campaigns/#{campaign.id}/import-csv-contacts", params: { contacts: [ { userName: "Ana", externalId: "5531971810932" } ] }, headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end

    it "o grupo padrão de usuários não tem campanhas" do
      member = create(:account, organization: organization, role: "member", access_role: create(:access_role, :member, organization: organization))

      get "/campaigns", headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "isolamento entre organizações" do
    let(:foreign) { create(:outreach_campaign, organization: create(:organization), status_cd: "draft") }

    it "a lista só traz as da organização" do
      campaign_of(name: "Minha")
      foreign

      get "/campaigns", headers: headers, as: :json

      expect(json["campaigns"].map { |item| item["name"] }).to eq([ "Minha" ])
    end

    {
      "GET /campaigns/:id" => [ :get, "" ],
      "PATCH /campaigns/:id" => [ :patch, "" ],
      "DELETE /campaigns/:id" => [ :delete, "" ],
      "POST launch" => [ :post, "/launch" ],
      "POST pause" => [ :post, "/pause" ],
      "POST resume" => [ :post, "/resume" ],
      "POST cancel" => [ :post, "/cancel" ],
      "GET stats" => [ :get, "/stats" ],
      "GET recipients" => [ :get, "/recipients" ],
      "POST import-contacts" => [ :post, "/import-contacts" ],
      "POST import-csv-contacts" => [ :post, "/import-csv-contacts" ]
    }.each do |label, (verb, suffix)|
      it "#{label} de outra organização responde 404" do
        public_send(verb, "/campaigns/#{foreign.id}#{suffix}", headers: headers, as: :json)

        expect(response).to have_http_status(:not_found)
        expect(foreign.reload.status_cd).to eq("draft")
      end
    end

    it "um id que não existe responde 404" do
      get "/campaigns/nao-existe", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "não dá para criar disparando pelo canal de outra organização" do
      other_connector = create(:connector_whatsapp_web, organization: create(:organization))

      post "/campaigns", params: payload(connectorIds: [ other_connector.id.to_s ]), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("connectorIds")
    end

    it "a campanha nasce na organização da sessão, mesmo que o corpo diga outra" do
      post "/campaigns", params: payload(organizationId: create(:organization).id), headers: headers, as: :json

      expect(Outreach::Campaign.find(json.dig("campaign", "id")).organization_id).to eq(organization.id)
    end
  end

  describe "GET /campaigns" do
    it "lista da mais nova para a mais antiga, com a paginação da API" do
      older = campaign_of(name: "Antiga", created_at: 2.days.ago)
      newer = campaign_of(name: "Nova")

      get "/campaigns", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["campaigns"].map { |item| item["id"] }).to eq([ newer.id.to_s, older.id.to_s ])
      expect(json["meta"]).to include("page" => 1, "total" => 2, "totalPages" => 1, "hasMore" => false)
    end

    it "pagina" do
      3.times { campaign_of }

      get "/campaigns", params: { page: 2, perPage: 2 }, headers: headers

      expect(json["campaigns"].size).to eq(1)
      expect(json["meta"]).to include("page" => 2, "perPage" => 2, "total" => 3)
    end

    it "filtra por situação" do
      campaign_of(name: "Rascunho")
      campaign_of(name: "No ar", status_cd: "running")

      get "/campaigns", params: { status: "running" }, headers: headers

      expect(json["campaigns"].map { |item| item["name"] }).to eq([ "No ar" ])
    end

    it "filtra por canal, inclusive a conta oficial" do
      other = create(:connector_whatsapp_web, organization: organization)
      waba = create(:connector_whatsapp_cloud, organization: organization)
      template = create(:whatsapp_template, connector: waba)
      campaign_of(name: "Pelo meu")
      create(:outreach_campaign, organization: organization, name: "Pelo outro", connector_ids: [ other.id.to_s ])
      create(:outreach_campaign, organization: organization, name: "Oficial", campaign_mode_cd: "template", messages: [], waba_connector_id: waba.id.to_s, phone_number_ids: [ "1" ], template_ids: [ template.id.to_s ])

      get "/campaigns", params: { connectorId: other.id.to_s }, headers: headers
      expect(json["campaigns"].map { |item| item["name"] }).to eq([ "Pelo outro" ])

      get "/campaigns", params: { connectorId: waba.id.to_s }, headers: headers
      expect(json["campaigns"].map { |item| item["name"] }).to eq([ "Oficial" ])
    end

    it "busca pelo nome, tratando o texto como texto" do
      campaign_of(name: "Natal (loja)")
      campaign_of(name: "Páscoa")

      get "/campaigns", params: { q: "natal (" }, headers: headers

      expect(json["campaigns"].map { |item| item["name"] }).to eq([ "Natal (loja)" ])
    end

    it "camelCase, milissegundos e sem nada interno" do
      campaign = campaign_of(run_token: "segredo", started_at: Time.utc(2026, 11, 6, 12))

      get "/campaigns", headers: headers, as: :json

      item = json["campaigns"].first
      expect(item).to include("id" => campaign.id.to_s, "sendWindowStart" => "00:00", "dailyLimitPerConnector" => 300, "startedAt" => Time.utc(2026, 11, 6, 12).to_i * 1000)
      expect(item.keys).not_to include("run_token", "runToken", "planned_at", "plannedAt")
    end

    it "a lista não paga o conteúdo das mensagens nem a atividade" do
      campaign_of

      get "/campaigns", headers: headers, as: :json

      expect(json["campaigns"].first.keys).not_to include("messages", "activityEvents")
    end
  end

  describe "GET /campaigns/summary" do
    it "soma a organização inteira, não só a página" do
      campaign_of(status_cd: "running", sent_count: 10, read_count: 5, delivered_count: 8, failed_count: 1)
      campaign_of(status_cd: "completed", sent_count: 30, read_count: 15, delivered_count: 20)
      campaign_of(status_cd: "draft")
      create(:outreach_campaign, organization: create(:organization), sent_count: 999)

      get "/campaigns/summary", headers: headers, as: :json

      expect(json["summary"]).to include(
        "total" => 3,
        "sent" => 40,
        "delivered" => 28,
        "read" => 20,
        "failed" => 1,
        "openRate" => 0.5,
        "byStatus" => { "draft" => 1, "scheduled" => 0, "running" => 1, "paused" => 0, "completed" => 1, "cancelled" => 0 }
      )
    end

    it "sem campanhas, tudo zerado" do
      get "/campaigns/summary", headers: headers, as: :json

      expect(json["summary"]).to include("total" => 0, "openRate" => 0.0)
    end
  end

  describe "POST /campaigns" do
    context "sem agendamento" do
      it "cria em rascunho" do
        post "/campaigns", params: payload, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json["campaign"]).to include("status" => "draft", "scheduledAt" => nil, "name" => "Recompra de novembro")
      end

      it "traduz o que a tela manda para o modelo" do
        post "/campaigns", params: payload, headers: headers, as: :json

        campaign = Outreach::Campaign.find(json.dig("campaign", "id"))
        expect(campaign).to have_attributes(
          send_start_hour: 9,
          send_end_hour: 18,
          buffer_min_seconds: 300,
          buffer_max_seconds: 1800,
          daily_limit_per_connector: 500,
          created_by_account_id: owner.id,
          connector_ids: [ connector.id.to_s ]
        )
      end

      it "devolve o que recebeu" do
        post "/campaigns", params: payload, headers: headers, as: :json

        expect(json["campaign"]).to include(
          "sendWindowStart" => "09:00",
          "sendWindowEnd" => "18:00",
          "intervalMin" => 300,
          "intervalMax" => 1800,
          "messages" => [ "Oi {{nome}}, tudo bem?" ],
          "connectorIds" => [ connector.id.to_s ],
          "createdByAccountId" => owner.id,
          "batchSize" => 50
        )
      end

      it "registra na atividade" do
        post "/campaigns", params: payload, headers: headers, as: :json

        expect(json.dig("campaign", "activityEvents").map { |event| event["action"] }).to eq([ "created" ])
      end

      it "não agenda nada" do
        expect { post "/campaigns", params: payload, headers: headers, as: :json }
          .not_to have_enqueued_job(Outreach::ScheduledLaunchJob)
      end

      it "guarda o fluxo que responde" do
        flow_id = SecureRandom.uuid

        post "/campaigns", params: payload(flowId: flow_id), headers: headers, as: :json

        expect(json.dig("campaign", "flowId")).to eq(flow_id)
      end

      it "os parâmetros do modelo passam com as chaves intactas" do
        waba = create(:connector_whatsapp_cloud, organization: organization)
        template = create(:whatsapp_template, connector: waba)

        post "/campaigns", params: payload(
          campaignMode: "template", messages: [], connectorIds: [],
          wabaConnectorId: waba.id.to_s, phoneNumberIds: [ "111" ], templateIds: [ template.id.to_s ],
          templateParams: { template.id.to_s => { "1" => "{{nome}}", "2" => 7 } }
        ), headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json.dig("campaign", "templateParams")).to eq(template.id.to_s => { "1" => "{{nome}}", "2" => "7" })
      end
    end

    context "agendada para o futuro" do
      let(:scheduled_at) { 1.day.from_now.change(usec: 0) }

      it "cria agendada" do
        post "/campaigns", params: payload(scheduledAt: scheduled_at.iso8601), headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json["campaign"]).to include("status" => "scheduled", "scheduledAt" => scheduled_at.to_i * 1000)
      end

      it "enfileira o lançamento no horário, com o token" do
        expect { post "/campaigns", params: payload(scheduledAt: scheduled_at.iso8601), headers: headers, as: :json }
          .to have_enqueued_job(Outreach::ScheduledLaunchJob).at(scheduled_at).on_queue("campaigns")
      end

      it "registra o agendamento, com a frase pronta" do
        post "/campaigns", params: payload(scheduledAt: scheduled_at.iso8601), headers: headers, as: :json

        event = json.dig("campaign", "activityEvents").find { |item| item["action"] == "scheduled" }
        expect(event["details"]).to start_with("Agendada para ")
      end

      it "sem fuso no texto, vale o da campanha" do
        post "/campaigns", params: payload(scheduledAt: "2030-01-15T10:00"), headers: headers, as: :json

        expect(json.dig("campaign", "scheduledAt")).to eq(ActiveSupport::TimeZone["America/Sao_Paulo"].local(2030, 1, 15, 10).to_i * 1000)
      end

      it "aceita em milissegundos, como a API responde" do
        post "/campaigns", params: payload(scheduledAt: scheduled_at.to_i * 1000), headers: headers, as: :json

        expect(json["campaign"]).to include("status" => "scheduled", "scheduledAt" => scheduled_at.to_i * 1000)
      end
    end

    it "agendada para o passado, fica em rascunho" do
      post "/campaigns", params: payload(scheduledAt: 1.hour.ago.iso8601), headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json.dig("campaign", "status")).to eq("draft")
    end

    it "uma data inválida responde 422" do
      post "/campaigns", params: payload(scheduledAt: "ontem de tarde"), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidScheduledAt", "field" => "scheduledAt")
    end

    describe "validação" do
      def expect_invalid(field, **extra)
        post "/campaigns", params: payload(**extra), headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "unprocessable", "field" => field)
        expect(json.dig("error", "details", field)).to be_present
      end

      it("sem nome") { expect_invalid("name", name: "") }
      it("sem mensagem") { expect_invalid("messages", messages: [ "  " ]) }
      it("intervalo invertido") { expect_invalid("bufferMaxSeconds", intervalMin: 10, intervalMax: 5) }
      it("intervalo zerado") { expect_invalid("bufferMinSeconds", intervalMin: 0) }
      it("limite diário zerado") { expect_invalid("dailyLimitPerConnector", dailyLimitPerConnector: 0) }
      it("sem dia de envio") { expect_invalid("sendDays", sendDays: []) }
      it("dia que não existe") { expect_invalid("sendDays", sendDays: [ 9 ]) }
      it("dia que não é número") { expect_invalid("sendDays", sendDays: [ "segunda" ]) }
      it("hora impossível") { expect_invalid("sendStartHour", sendWindowStart: "25:00") }
      it("hora ilegível") { expect_invalid("sendEndHour", sendWindowEnd: "de tarde") }
      it("fuso que não existe") { expect_invalid("timezone", timezone: "Marte/Olympus") }
      it("tipo de mensagem desconhecido") { expect_invalid("messageType", messageType: "fax") }
      it("modo desconhecido") { expect_invalid("campaignMode", campaignMode: "pombo") }
      it("etiqueta que não existe") { expect_invalid("chatTagIds", chatTagIds: [ BSON::ObjectId.new.to_s ]) }
      it("lote grande demais") { expect_invalid("batchSize", batchSize: 500) }

      it "a mensagem de erro vem traduzida" do
        post "/campaigns", params: payload(messages: []), headers: headers.merge("Accept-Language" => "en"), as: :json

        expect(json.dig("error", "message")).to eq("Messages need at least one message")
      end
    end

    describe "mídia" do
      let(:blob) { Struct.new(:content_type, :filename).new("image/png", "promo.png") }
      let(:attachment) { Struct.new(:id, :file_url, :name, :file).new("anexo-1", "https://arquivos.vekoo.app/promo.png", "Promoção", Struct.new(:blob).new(blob)) }

      before { allow(Media::AttachmentLookup).to receive(:find).and_return(nil) }

      it "preenche URL, tipo e nome a partir do anexo" do
        allow(Media::AttachmentLookup).to receive(:find).with("anexo-1", organization_id: organization.id).and_return(attachment)

        post "/campaigns", params: payload(messageType: "media", messages: [], attachmentId: "anexo-1"), headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json["campaign"]).to include(
          "attachmentId" => "anexo-1",
          "mediaUrl" => "https://arquivos.vekoo.app/promo.png",
          "mediaContentType" => "image/png",
          "mediaFileName" => "Promoção"
        )
      end

      it "o anexo que não é da organização responde 422" do
        post "/campaigns", params: payload(messageType: "media", messages: [], attachmentId: "de-outra-organizacao"), headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "mediaNotFound", "field" => "attachmentId")
      end

      it "sem anexo, a validação recusa" do
        post "/campaigns", params: payload(messageType: "media", messages: []), headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "field")).to eq("attachmentId")
      end

      it "não aceita URL crua: a mídia vem sempre do anexo" do
        post "/campaigns", params: payload(mediaUrl: "https://scontent.whatsapp.net/foto.jpg"), headers: headers, as: :json

        expect(json.dig("campaign", "mediaUrl")).to be_nil
      end
    end
  end

  describe "GET /campaigns/:id" do
    it "devolve o detalhe, com a atividade da mais nova para a mais antiga" do
      campaign = campaign_of
      campaign.log_activity!("created", account_id: owner.id)
      travel(1.minute) { campaign.log_activity!("paused") }

      get "/campaigns/#{campaign.id}", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json.dig("campaign", "activityEvents").map { |event| event["action"] }).to eq(%w[paused created])
      expect(json.dig("campaign", "activityEvents").first.keys).to include("id", "occurredAt", "details", "accountId", "metadata")
    end

    it "explica a pausa automática, no idioma de quem lê" do
      campaign = campaign_of(status_cd: "paused", pause_reason: "no_active_connectors")
      campaign.log_activity!("paused", metadata: { "reason" => "no_active_connectors" })

      get "/campaigns/#{campaign.id}", headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json["campaign"]).to include("pauseReason" => "no_active_connectors")
      expect(json.dig("campaign", "activityEvents").first["details"]).to eq("Paused by the platform: no channel is connected.")
    end
  end

  describe "PATCH /campaigns/:id" do
    it "atualiza o rascunho" do
      campaign = campaign_of

      patch "/campaigns/#{campaign.id}", params: { name: "Novo nome", sendWindowStart: "10:00" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["campaign"]).to include("name" => "Novo nome", "sendWindowStart" => "10:00")
    end

    %w[scheduled running paused completed cancelled].each do |status|
      it "não edita #{status}" do
        campaign = campaign_of(status_cd: status)

        patch "/campaigns/#{campaign.id}", params: { name: "X" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotEditable")
      end
    end

    it "valida" do
      campaign = campaign_of

      patch "/campaigns/#{campaign.id}", params: { name: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "só o que veio muda" do
      campaign = campaign_of(messages: [ "Original" ])

      patch "/campaigns/#{campaign.id}", params: { name: "Novo" }, headers: headers, as: :json

      expect(campaign.reload.messages).to eq([ "Original" ])
    end

    it "não muda o estado por aqui" do
      campaign = campaign_of

      patch "/campaigns/#{campaign.id}", params: { status: "running", statusCd: "running" }, headers: headers, as: :json

      expect(campaign.reload.status_cd).to eq("draft")
    end
  end

  describe "DELETE /campaigns/:id" do
    it "apaga o rascunho, com tudo que é dele" do
      campaign = campaign_of
      create(:outreach_recipient, campaign: campaign)

      delete "/campaigns/#{campaign.id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(Outreach::Campaign.where(_id: campaign.id).exists?).to be(false)
      expect(Outreach::Recipient.count).to eq(0)
    end

    %w[scheduled running paused completed cancelled].each do |status|
      it "não apaga #{status}" do
        campaign = campaign_of(status_cd: status)

        delete "/campaigns/#{campaign.id}", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotDeletable")
      end
    end
  end

  describe "POST /campaigns/:id/launch" do
    let(:campaign) { campaign_of }

    before { create(:outreach_recipient, campaign: campaign) }

    it "põe no ar e agenda um job por canal" do
      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["campaign"]).to include("status" => "running")
      expect(json["campaign"]["startedAt"]).to be_present
      expect(json["warnings"]).to eq([])
      expect(json["estimatedCompletionAt"]).to be_present
      expect(enqueued_steps.size).to eq(1)
    end

    it "registra quem lançou" do
      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(campaign.activity_logs.where(action: "launched").take.account_id).to eq(owner.id)
    end

    # Origem: 'enfileira o primeiro CampaignSendJob por volta do horário atual'.
    it "o primeiro envio sai agora, com a janela aberta" do
      freeze_time do
        post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

        expect(Time.iso8601(enqueued_steps.first["scheduled_at"])).to eq(Time.current)
      end
    end

    it "lança também a agendada, antes da hora" do
      campaign.set(status_cd: "scheduled", scheduled_at: 1.day.from_now, run_token: "t")

      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(json.dig("campaign", "status")).to eq("running")
    end

    # Dois cliques: o segundo já acha a campanha no ar, e só um plano é montado.
    it "lançar de novo responde 422 e não monta dois planos" do
      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json
      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("campaignNotLaunchable")
      expect(campaign.batches.count).to eq(1)
    end

    %w[running paused completed cancelled].each do |status|
      it "não lança #{status}" do
        campaign.set(status_cd: status)

        post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotLaunchable")
      end
    end

    it "sem destinatários, recusa" do
      empty = campaign_of

      post "/campaigns/#{empty.id}/launch", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("noRecipients")
    end

    it "sem canal, recusa" do
      campaign.set(connector_ids: [])

      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(json["error"]).to include("code" => "connectorsRequired", "field" => "connectorIds")
    end

    it "com todos os canais desconectados, recusa, e a campanha fica como está" do
      connector.set(status_cd: "closed")

      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorsDisconnected")
      expect(campaign.reload.status_cd).to eq("draft")
    end

    it "com um canal desconectado, segue pelos outros e avisa" do
      other = create(:connector_whatsapp_web, organization: organization, profile_name: "Filial Centro", status: :closed)
      campaign.set(connector_ids: [ connector.id.to_s, other.id.to_s ])

      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["warnings"].first).to include("code" => "connectorsSkipped", "connectorIds" => [ other.id.to_s ])
      expect(json["warnings"].first["message"]).to include("Filial Centro")
      expect(campaign.batches.pluck(:connector_id).uniq).to eq([ connector.id.to_s ])
    end

    it "um canal de outra organização gravado no documento não entra" do
      foreign = create(:connector_whatsapp_web, organization: create(:organization))
      campaign.set(connector_ids: [ foreign.id.to_s ])

      post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorsDisconnected")
    end

    describe "modo modelo" do
      let(:waba) { create(:connector_whatsapp_cloud, organization: organization) }
      let(:template) { create(:whatsapp_template, connector: waba) }
      let(:campaign) do
        create(
          :outreach_campaign,
          organization: organization, campaign_mode_cd: "template", messages: [],
          waba_connector_id: waba.id.to_s, phone_number_ids: %w[111 222], template_ids: [ template.id.to_s ]
        )
      end

      it "um job por número" do
        post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(campaign.batches.pluck(:phone_number_id)).to eq([ "111" ])
        expect(enqueued_steps.size).to eq(1)
      end

      it "conta desconectada recusa" do
        waba.set(status_cd: "closed")

        post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

        expect(json.dig("error", "code")).to eq("wabaDisconnected")
      end

      it "conta apagada recusa" do
        campaign
        waba.delete

        post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

        expect(json.dig("error", "code")).to eq("wabaNotFound")
      end
    end

    it "em inglês, a mensagem vem em inglês" do
      empty = campaign_of

      post "/campaigns/#{empty.id}/launch", headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json.dig("error", "message")).to eq("Add at least one contact before launching.")
    end
  end

  describe "POST /campaigns/:id/pause" do
    let(:campaign) { campaign_of(status_cd: "running", run_token: "vigente") }

    it "pausa e troca o token" do
      post "/campaigns/#{campaign.id}/pause", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json.dig("campaign", "status")).to eq("paused")
      expect(campaign.reload.run_token).not_to eq("vigente")
    end

    it "registra quem pausou" do
      post "/campaigns/#{campaign.id}/pause", headers: headers, as: :json

      expect(campaign.activity_logs.where(action: "paused").take.account_id).to eq(owner.id)
    end

    %w[draft scheduled paused completed cancelled].each do |status|
      it "não pausa #{status}" do
        campaign.set(status_cd: status)

        post "/campaigns/#{campaign.id}/pause", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotRunning")
      end
    end
  end

  describe "POST /campaigns/:id/resume" do
    let(:campaign) { campaign_of(status_cd: "paused", run_token: "vigente", pause_reason: "no_active_connectors") }

    it "retoma, com token novo, um job e sem o motivo da pausa" do
      create(:outreach_recipient, campaign: campaign)

      post "/campaigns/#{campaign.id}/resume", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["campaign"]).to include("status" => "running", "pauseReason" => nil)
      expect(campaign.reload.run_token).not_to eq("vigente")
      expect(enqueued_steps.size).to eq(1)
    end

    it "sem nenhum canal conectado, recusa e continua pausada" do
      create(:outreach_recipient, campaign: campaign)
      connector.set(status_cd: "closed")

      post "/campaigns/#{campaign.id}/resume", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("noActiveConnectors")
      expect(campaign.reload.status_cd).to eq("paused")
    end

    it "sem ninguém faltando, conclui" do
      create(:outreach_recipient, campaign: campaign, status_cd: "sent")

      post "/campaigns/#{campaign.id}/resume", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json.dig("campaign", "status")).to eq("completed")
    end

    %w[draft scheduled running completed cancelled].each do |status|
      it "não retoma #{status}" do
        campaign.set(status_cd: status)

        post "/campaigns/#{campaign.id}/resume", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotPaused")
      end
    end
  end

  describe "POST /campaigns/:id/cancel" do
    %w[running paused scheduled].each do |status|
      it "cancela #{status}" do
        campaign = campaign_of(status_cd: status, run_token: "vigente")

        post "/campaigns/#{campaign.id}/cancel", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["campaign"]).to include("status" => "cancelled")
        expect(json["campaign"]["completedAt"]).to be_present
        expect(campaign.reload.run_token).not_to eq("vigente")
      end
    end

    %w[draft completed cancelled].each do |status|
      it "não cancela #{status}" do
        campaign = campaign_of(status_cd: status)

        post "/campaigns/#{campaign.id}/cancel", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotCancellable")
      end
    end

    it "quem não foi tomado vira ignorado, e quem está no meio do envio termina" do
      campaign = campaign_of(status_cd: "running", run_token: "vigente")
      pending = create(:outreach_recipient, campaign: campaign)
      sending = create(:outreach_recipient, campaign: campaign, status_cd: "sending")
      sent = create(:outreach_recipient, campaign: campaign, status_cd: "sent")

      post "/campaigns/#{campaign.id}/cancel", headers: headers, as: :json

      expect([ pending, sending, sent ].map { |item| item.reload.status_cd }).to eq(%w[skipped sending sent])
    end

    it "apaga os lotes que não terminaram, e o job que sobrou não acha nada" do
      campaign = campaign_of(status_cd: "running", run_token: "vigente")
      batch = create(:outreach_batch, campaign: campaign, status_cd: "scheduled")
      done = create(:outreach_batch, campaign: campaign, status_cd: "completed")

      post "/campaigns/#{campaign.id}/cancel", headers: headers, as: :json

      expect(Outreach::Batch.where(_id: batch.id).exists?).to be(false)
      expect(Outreach::Batch.where(_id: done.id).exists?).to be(true)
    end
  end

  describe "GET /campaigns/:id/stats" do
    let(:campaign) do
      campaign_of(status_cd: "running", sent_count: 10, delivered_count: 8, read_count: 4, failed_count: 1, recipients_count: 12, started_at: 2.hours.ago, estimated_completion_at: Time.utc(2030, 1, 1))
    end

    it "calcula as taxas" do
      get "/campaigns/#{campaign.id}/stats", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["stats"]).to include(
        "totalContacts" => 12,
        "sent" => 10,
        "delivered" => 8,
        "read" => 4,
        "failed" => 1,
        "deliveryRate" => 0.8,
        "openRate" => 0.5,
        "messagesPerHour" => 5.0,
        "estimatedCompletion" => Time.utc(2030, 1, 1).to_i * 1000
      )
    end

    it "conta quem falta e quem foi ignorado" do
      create(:outreach_recipient, campaign: campaign, status_cd: "pending")
      create(:outreach_recipient, campaign: campaign, status_cd: "sending")
      create(:outreach_recipient, campaign: campaign, status_cd: "skipped")

      get "/campaigns/#{campaign.id}/stats", headers: headers, as: :json

      expect(json["stats"]).to include("pending" => 2, "skipped" => 1)
    end

    it "sem envio nenhum, não divide por zero" do
      get "/campaigns/#{campaign_of.id}/stats", headers: headers, as: :json

      expect(json["stats"]).to include("deliveryRate" => 0.0, "openRate" => 0.0, "messagesPerHour" => 0.0)
    end
  end

  describe "GET /campaigns/:id/recipients" do
    let(:campaign) { campaign_of }

    it "lista na ordem de entrada, com a paginação" do
      first = create(:outreach_recipient, campaign: campaign, name: "Ana", phone: "5531900000001")
      create(:outreach_recipient, campaign: campaign, name: "Bia", phone: "5531900000002")

      get "/campaigns/#{campaign.id}/recipients", params: { perPage: 1 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["recipients"].first).to include("id" => first.id.to_s, "contactName" => "Ana", "phoneNumber" => "5531900000001", "status" => "pending", "sentAt" => nil)
      expect(json["meta"]).to include("total" => 2, "hasMore" => true)
    end

    it "filtra por situação" do
      create(:outreach_recipient, campaign: campaign, status_cd: "failed", name: "Falhou")
      create(:outreach_recipient, campaign: campaign, status_cd: "sent", name: "Foi")

      get "/campaigns/#{campaign.id}/recipients", params: { status: "failed" }, headers: headers

      expect(json["recipients"].map { |item| item["contactName"] }).to eq([ "Falhou" ])
    end

    it "busca por nome ou telefone" do
      create(:outreach_recipient, campaign: campaign, name: "Ana", phone: "5531900000001")
      create(:outreach_recipient, campaign: campaign, name: "Bia", phone: "5531900000002")

      get "/campaigns/#{campaign.id}/recipients", params: { q: "bia" }, headers: headers

      expect(json["recipients"].map { |item| item["contactName"] }).to eq([ "Bia" ])
    end

    it "traduz o motivo da falha pelo código, no idioma de quem lê" do
      create(:outreach_recipient, campaign: campaign, status_cd: "failed", error_code: "numberNotFound")

      get "/campaigns/#{campaign.id}/recipients", headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json["recipients"].first).to include("errorCode" => "numberNotFound", "errorMessage" => "This number isn't on WhatsApp.")
    end

    it "o que o canal disse tem prioridade" do
      create(:outreach_recipient, campaign: campaign, status_cd: "failed", error_code: "whatsappError", error_message: "Fora da janela de 24 horas")

      get "/campaigns/#{campaign.id}/recipients", headers: headers, as: :json

      expect(json["recipients"].first["errorMessage"]).to eq("Fora da janela de 24 horas")
    end

    it "só traz os da campanha" do
      create(:outreach_recipient, campaign: campaign_of)

      get "/campaigns/#{campaign.id}/recipients", headers: headers, as: :json

      expect(json["recipients"]).to eq([])
    end
  end

  # Origem: 'Fluxo completo de agendamento'. O ciclo de vida completo, pela API.
  describe "ciclo de vida completo" do
    include ActiveJob::TestHelper

    before { stub_channel_working(connector) }

    def step_all
      until enqueued_steps.empty?
        job = enqueued_steps.first
        enqueued_jobs.delete(job)
        travel_to(Time.iso8601(job["scheduled_at"]) + 1.second)
        Outreach::BatchJob.new(*job["arguments"]).perform_now
      end
    end

    it "rascunho, importação, lançamento, pausa, retomada e conclusão" do
      post "/campaigns", params: payload(sendWindowStart: "00:00", sendWindowEnd: "00:00", sendDays: [ 0, 1, 2, 3, 4, 5, 6 ], intervalMin: 1, intervalMax: 1, batchSize: 2), headers: headers, as: :json
      id = json.dig("campaign", "id")

      post "/campaigns/#{id}/import-csv-contacts", params: { contacts: Array.new(5) { |index| { userName: "Pessoa #{index}", externalId: "553197181090#{index}" } } }, headers: headers, as: :json
      expect(json).to include("importedCount" => 5, "totalRecipients" => 5)

      post "/campaigns/#{id}/launch", headers: headers, as: :json
      expect(json.dig("campaign", "status")).to eq("running")

      # Duas mensagens saem, e a pessoa pausa.
      2.times do
        job = enqueued_steps.first
        enqueued_jobs.delete(job)
        travel_to(Time.iso8601(job["scheduled_at"]) + 1.second)
        Outreach::BatchJob.new(*job["arguments"]).perform_now
      end
      old_step = enqueued_steps.first

      post "/campaigns/#{id}/pause", headers: headers, as: :json
      expect(json.dig("campaign", "status")).to eq("paused")

      # O job que estava agendado chega depois da pausa e não faz nada.
      enqueued_jobs.delete(old_step)
      travel 1.minute
      Outreach::BatchJob.new(*old_step["arguments"]).perform_now
      expect(a_request(:post, evolution_text_url(connector))).to have_been_made.twice

      post "/campaigns/#{id}/resume", headers: headers, as: :json
      expect(json.dig("campaign", "status")).to eq("running")

      # O mesmo job velho continua sem valer depois da retomada.
      Outreach::BatchJob.new(*old_step["arguments"]).perform_now
      expect(a_request(:post, evolution_text_url(connector))).to have_been_made.twice

      step_all

      get "/campaigns/#{id}", headers: headers, as: :json
      expect(json["campaign"]).to include("status" => "completed", "sentCount" => 5, "failedCount" => 0)
      expect(json["campaign"]["activityEvents"].map { |event| event["action"] }).to eq(%w[completed resumed paused launched created])

      # Cada um recebeu exatamente uma vez.
      expect(a_request(:post, evolution_text_url(connector))).to have_been_made.times(5)
      get "/campaigns/#{id}/recipients", headers: headers, as: :json
      expect(json["recipients"].map { |item| item["status"] }).to all(eq("sent"))
    end

    it "agendada: criar, importar e o job lançar" do
      post "/campaigns", params: payload(scheduledAt: 2.hours.from_now.iso8601, sendWindowStart: "00:00", sendWindowEnd: "00:00", sendDays: [ 0, 1, 2, 3, 4, 5, 6 ], intervalMin: 1, intervalMax: 1), headers: headers, as: :json
      id = json.dig("campaign", "id")
      expect(json.dig("campaign", "status")).to eq("scheduled")
      launch_job = enqueued_jobs.find { |job| job["job_class"] == "Outreach::ScheduledLaunchJob" }

      # O bug do agendamento: a campanha agendada precisa aceitar contatos.
      post "/campaigns/#{id}/import-csv-contacts", params: { contacts: [ { userName: "Alice", externalId: "5511999990001" }, { userName: "Bob", externalId: "5511999990002" } ] }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(json).to include("importedCount" => 2, "totalRecipients" => 2)

      travel 2.hours
      Outreach::ScheduledLaunchJob.new(*launch_job["arguments"]).perform_now
      step_all

      expect(Outreach::Campaign.find(id)).to have_attributes(status_cd: "completed", sent_count: 2)
    end

    it "cancelar a agendada: o job chega no horário e não lança" do
      post "/campaigns", params: payload(scheduledAt: 2.hours.from_now.iso8601), headers: headers, as: :json
      id = json.dig("campaign", "id")
      launch_job = enqueued_jobs.find { |job| job["job_class"] == "Outreach::ScheduledLaunchJob" }

      post "/campaigns/#{id}/cancel", headers: headers, as: :json

      travel 2.hours
      Outreach::ScheduledLaunchJob.new(*launch_job["arguments"]).perform_now

      expect(Outreach::Campaign.find(id).status_cd).to eq("cancelled")
      expect(enqueued_steps).to be_empty
    end

    it "canal cai no meio: a campanha pausa sozinha, ninguém se perde, e retoma depois de reconectar" do
      post "/campaigns", params: payload(sendWindowStart: "00:00", sendWindowEnd: "00:00", sendDays: [ 0, 1, 2, 3, 4, 5, 6 ], intervalMin: 1, intervalMax: 1), headers: headers, as: :json
      id = json.dig("campaign", "id")
      post "/campaigns/#{id}/import-csv-contacts", params: { contacts: Array.new(3) { |index| { userName: "Pessoa #{index}", externalId: "553197181090#{index}" } } }, headers: headers, as: :json
      post "/campaigns/#{id}/launch", headers: headers, as: :json

      job = enqueued_steps.first
      enqueued_jobs.delete(job)
      travel_to(Time.iso8601(job["scheduled_at"]) + 1.second)
      Outreach::BatchJob.new(*job["arguments"]).perform_now

      connector.set(status_cd: "closed")
      step_all

      get "/campaigns/#{id}", headers: headers, as: :json
      expect(json["campaign"]).to include("status" => "paused", "pauseReason" => "no_active_connectors", "sentCount" => 1, "failedCount" => 0)

      post "/campaigns/#{id}/resume", headers: headers, as: :json
      expect(json.dig("error", "code")).to eq("noActiveConnectors")

      connector.set(status_cd: "active")
      post "/campaigns/#{id}/resume", headers: headers, as: :json
      expect(json.dig("campaign", "status")).to eq("running")

      step_all

      expect(Outreach::Campaign.find(id)).to have_attributes(status_cd: "completed", sent_count: 3, failed_count: 0)
      expect(a_request(:post, evolution_text_url(connector))).to have_been_made.times(3)
    end
  end
end
