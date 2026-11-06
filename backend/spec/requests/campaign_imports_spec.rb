require "rails_helper"

RSpec.describe "Importações de campanha", type: :request do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, organization: organization, connector_ids: [ connector.id.to_s ]) }
  let(:headers) { auth_headers(owner) }

  describe "POST /campaigns/:id/import-csv-contacts" do
    let(:contacts) do
      [
        { userName: "Alice", externalId: "5511999990001" },
        { userName: "Bob", externalId: "+55 (11) 99999-0002" }
      ]
    end

    def import(rows = contacts, target: campaign)
      post "/campaigns/#{target.id}/import-csv-contacts", params: { contacts: rows }, headers: headers, as: :json
    end

    it "cria os destinatários" do
      import

      expect(response).to have_http_status(:ok)
      expect(json).to eq("importedCount" => 2, "skippedCount" => 0, "invalidCount" => 0, "totalRecipients" => 2)
      expect(campaign.recipients.pluck(:phone, :name)).to contain_exactly([ "5511999990001", "Alice" ], [ "5511999990002", "Bob" ])
    end

    it "em lotes, como o assistente manda, o total vai somando" do
      import([ contacts.first ])
      import([ contacts.second ])

      expect(json["totalRecipients"]).to eq(2)
    end

    it "conta os repetidos" do
      import
      import

      expect(json).to include("importedCount" => 0, "skippedCount" => 2, "totalRecipients" => 2)
    end

    it "a outra forma do 9º dígito é a mesma pessoa" do
      import([ { userName: "Ana", externalId: "5531971810932" }, { userName: "Ana", externalId: "553171810932" } ])

      expect(json).to include("importedCount" => 1, "skippedCount" => 1)
    end

    it "conta quem veio sem telefone" do
      import([ { userName: "Sem número", externalId: "" } ])

      expect(json).to include("importedCount" => 0, "invalidCount" => 1)
    end

    it "guarda os dados do estabelecimento, em snake_case mesmo vindo em camelCase" do
      import([ { userName: "Padaria", externalId: "554133330000", contactMetadata: { placeId: "lugar-1", category_name: "Padaria", city: "Curitiba", website: nil } } ])

      expect(campaign.recipients.first.custom_variables).to eq("place_id" => "lugar-1", "category_name" => "Padaria", "city" => "Curitiba")
    end

    it "ignora metadados que não são um mapa" do
      import([ { userName: "Ana", externalId: "5531971810932", contactMetadata: "texto" } ])

      expect(campaign.recipients.first.custom_variables).to eq({})
    end

    it "ignora uma linha que não é um mapa" do
      import([ "lixo", { userName: "Ana", externalId: "5531971810932" } ])

      expect(json["importedCount"]).to eq(1)
    end

    %w[scheduled].each do |status|
      # O bug do agendamento: o assistente cria a campanha e só depois importa.
      it "aceita em #{status}" do
        campaign.set(status_cd: status)

        import

        expect(response).to have_http_status(:ok)
        expect(json["importedCount"]).to eq(2)
      end
    end

    %w[running paused completed cancelled].each do |status|
      it "recusa em #{status}" do
        campaign.set(status_cd: status)

        import

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotImportable")
      end
    end

    it "sem contatos, recusa" do
      import([])

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "contactsRequired", "field" => "contacts")
    end

    it "acima do limite, recusa" do
      stub_const("CampaignImportsController::MAX_CONTACTS_PER_IMPORT", 1)

      import

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "tooManyContacts", "details" => { "max" => 1 })
    end
  end

  describe "POST /campaigns/:id/import-contacts" do
    def chat(**attributes)
      create(:chat, connector: connector, organization_id: organization.id, **attributes)
    end

    def import(**body)
      post "/campaigns/#{campaign.id}/import-contacts", params: body, headers: headers, as: :json
    end

    it "traz as conversas escolhidas" do
      first = chat(external_id: "5531900000001@s.whatsapp.net", user_name: "Ana")
      chat(external_id: "5531900000002")

      import(selectAll: false, contactIds: [ first.id.to_s ])

      expect(response).to have_http_status(:ok)
      expect(json).to include("importedCount" => 1, "totalRecipients" => 1)
      expect(campaign.recipients.first).to have_attributes(phone: "5531900000001", name: "Ana", contact_id: first.id.to_s)
    end

    it "não alcança a conversa de outra organização" do
      foreign = create(:chat, :with_connector, organization: create(:organization))

      import(selectAll: false, contactIds: [ foreign.id.to_s ])

      expect(json["importedCount"]).to eq(0)
    end

    it "todas as que casam com os filtros" do
      tag = create(:chat_tag, organization_id: organization.id)
      chat(external_id: "5531900000001", chat_tag_ids: [ tag.id ])
      chat(external_id: "5531900000002")

      import(selectAll: true, filters: { tagIds: [ tag.id.to_s ] })

      expect(json["importedCount"]).to eq(1)
    end

    it "todas, sem filtro" do
      2.times { |index| chat(external_id: "553190000000#{index}") }

      import(selectAll: true)

      expect(json["importedCount"]).to eq(2)
    end

    it "os filtros de canal e de automação chegam em snake_case" do
      other = create(:connector_whatsapp_web, organization: organization)
      create(:chat, connector: other, organization_id: organization.id, external_id: "5531900000001", automation_enabled: false)
      chat(external_id: "5531900000002", automation_enabled: false)

      import(selectAll: true, filters: { connectorIds: [ other.id.to_s ], automationEnabled: false })

      expect(campaign.recipients.pluck(:phone)).to eq([ "5531900000001" ])
    end

    it "sem contatos e sem selecionar todos, recusa" do
      import(selectAll: false, contactIds: [])

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "contactsRequired", "field" => "contactIds")
    end

    it "acima do limite, recusa" do
      stub_const("Outreach::ChatAudience::MAX_CONTACTS", 1)
      2.times { |index| chat(external_id: "553190000000#{index}") }

      import(selectAll: true)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyContacts")
    end

    it "aceita na agendada" do
      campaign.set(status_cd: "scheduled")
      first = chat(external_id: "5531900000001")

      import(selectAll: false, contactIds: [ first.id.to_s ])

      expect(response).to have_http_status(:ok)
    end

    %w[running paused].each do |status|
      it "recusa em #{status}" do
        campaign.set(status_cd: status)

        import(selectAll: false, contactIds: [ "6925f3024c8311e4cee8369b" ])

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("campaignNotImportable")
      end
    end
  end

  describe "POST /campaigns/import-google-sheet" do
    let(:url) { "https://docs.google.com/spreadsheets/d/planilha-1/export?format=csv&gid=123" }
    let(:params) { { fileId: "planilha-1", sheetGid: 123, accessToken: "token-google" } }

    around { |example| with_env("GOOGLE_SHEETS_CLIENT_ID" => "cliente") { example.run } }

    def import(body = params)
      post "/campaigns/import-google-sheet", params: body, headers: headers, as: :json
    end

    it "devolve cabeçalhos e linhas, sem tocar nas chaves das colunas" do
      stub_request(:get, url).to_return(status: 200, body: "Nome Completo,telefone\nAna,5531971810932\n")

      import

      expect(response).to have_http_status(:ok)
      expect(json).to eq("headers" => [ "Nome Completo", "telefone" ], "data" => [ { "Nome Completo" => "Ana", "telefone" => "5531971810932" } ], "rowCount" => 1)
    end

    it "sem os parâmetros, recusa" do
      import({ fileId: "planilha-1" })

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "googleSheetParamsRequired", "field" => "sheetGid")
    end

    it "token vencido" do
      stub_request(:get, url).to_return(status: 401, body: "")

      import

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "googleTokenExpired")
      expect(json.dig("error", "message")).to include("Entre de novo")
    end

    it "tempo esgotado responde 504" do
      stub_request(:get, url).to_raise(Net::ReadTimeout)

      import

      expect(response).to have_http_status(:gateway_timeout)
      expect(json.dig("error", "code")).to eq("googleSheetTimeout")
    end

    it "sem a configuração do Google, responde 422 e não chama" do
      with_env("GOOGLE_SHEETS_CLIENT_ID" => nil) { import }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("googleSheetsNotConfigured")
    end

    it "o token da pessoa não aparece no log nem na resposta" do
      stub_request(:get, url).to_return(status: 403, body: "")

      import

      expect(response.body).not_to include("token-google")
    end
  end

  describe "POST /campaigns/apify-places-search" do
    let(:url) { "https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items" }

    around { |example| with_env("APIFY_API_TOKEN" => "chave-do-apify") { example.run } }

    def search(**body)
      post "/campaigns/apify-places-search", params: { searchQuery: "padaria", **body }, headers: headers, as: :json
    end

    it "devolve os lugares em camelCase" do
      stub_request(:post, url).to_return(json_reply([ { title: "Padaria", phone: "(41) 3333-0000", phoneUnformatted: "554133330000", postalCode: "80020-310", placeId: "lugar-1", openingHours: [ { day: "segunda", hours: "7h" } ] } ]))

      search

      expect(response).to have_http_status(:ok)
      expect(json["totalCount"]).to eq(1)
      expect(json["results"].first).to include("title" => "Padaria", "phoneUnformatted" => "554133330000", "postalCode" => "80020-310", "placeId" => "lugar-1", "openingHours" => [ { "day" => "segunda", "hours" => "7h" } ])
    end

    it "manda os filtros" do
      stub_request(:post, url).to_return(json_reply([]))

      search(location: "Curitiba", maxPlaces: 10, minScore: 4, skipClosedPlaces: true)

      expect(a_request(:post, url).with(body: hash_including("locationQuery" => "Curitiba", "maxCrawledPlacesPerSearch" => 10, "minScore" => 4.0, "skipClosedPlaces" => true))).to have_been_made.once
    end

    it "sem a busca, recusa" do
      post "/campaigns/apify-places-search", params: { searchQuery: " " }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "searchQueryRequired", "field" => "searchQuery")
    end

    it "sem a chave, responde 422" do
      with_env("APIFY_API_TOKEN" => nil) { search }

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("apifyNotConfigured")
    end

    it "chave inválida responde 422" do
      stub_request(:post, url).to_return(json_reply({}, status: 401))

      search

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("apifyInvalidToken")
    end

    it "sem créditos responde 402" do
      stub_request(:post, url).to_return(json_reply({}, status: 402))

      search

      expect(response).to have_http_status(:payment_required)
      expect(json.dig("error", "code")).to eq("apifyQuotaExceeded")
    end

    it "outro erro do Apify responde 502, com o que ele disse" do
      stub_request(:post, url).to_return(json_reply({ error: { message: "Ator fora do ar" } }, status: 500))

      search

      expect(response).to have_http_status(:bad_gateway)
      expect(json["error"]).to include("code" => "apifyFailed", "message" => "Ator fora do ar")
    end

    it "tempo esgotado responde 504" do
      stub_request(:post, url).to_raise(Net::ReadTimeout)

      search

      expect(response).to have_http_status(:gateway_timeout)
      expect(json.dig("error", "code")).to eq("apifyTimeout")
    end

    it "na requisição, espera menos que no job" do
      stub_request(:post, url).to_return(json_reply([]))
      allow(HTTParty).to receive(:post).and_call_original

      search

      expect(HTTParty).to have_received(:post).with(anything, hash_including(timeout: Outreach::ApifyPlacesSearchService::REQUEST_TIMEOUT))
    end
  end

  describe "o que o assistente oferece" do
    it "lista os canais que disparam, sem segredo nenhum" do
      web = create(:connector_whatsapp_web, organization: organization, api_key: "segredo-evolution")
      cloud = create(:connector_whatsapp_cloud, organization: organization, access_token: "segredo-meta")
      create(:connector_web_widget, organization: organization)
      create(:connector_whatsapp_web, organization: create(:organization))

      get "/campaigns/available-connectors", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["connectors"].map { |item| item["id"] }).to contain_exactly(web.id.to_s, cloud.id.to_s)
      expect(json["connectors"].map { |item| item["type"] }).to contain_exactly("whatsapp_web", "whatsapp_cloud")
      expect(response.body).not_to include("segredo")
    end

    it "lista as etiquetas da organização" do
      tag = create(:chat_tag, organization_id: organization.id, name: "vip", color: "#db2777")
      create(:chat_tag, organization_id: create(:organization).id)

      get "/campaigns/available-tags", headers: headers, as: :json

      expect(json["tags"].map { |item| item.slice("id", "name", "color") }).to eq([ { "id" => tag.id.to_s, "name" => "vip", "color" => "#db2777" } ])
    end

    # `Flow` é do domínio automation. Até ele chegar, a lista é vazia e a campanha funciona sem fluxo.
    it "lista os fluxos que podem responder" do
      get "/campaigns/available-flows", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to eq("flows" => [])
    end

    it "a resposta vem de um único ponto, que o domínio automation preenche" do
      allow(Outreach::AvailableFlows).to receive(:for).with(organization).and_return([ { id: "f1", name: "Boas-vindas" } ])

      get "/campaigns/available-flows", headers: headers, as: :json

      expect(json["flows"]).to eq([ { "id" => "f1", "name" => "Boas-vindas" } ])
    end

    describe "GET /campaigns/capabilities" do
      it "sem nenhuma chave, diz que não está disponível" do
        with_env("APIFY_API_TOKEN" => nil, "GOOGLE_SHEETS_CLIENT_ID" => nil, "GOOGLE_SHEETS_API_KEY" => nil, "GOOGLE_SHEETS_APP_ID" => nil) do
          get "/campaigns/capabilities", headers: headers, as: :json
        end

        expect(response).to have_http_status(:ok)
        expect(json["capabilities"]).to eq(
          "placeExtractions" => { "available" => false },
          "googleSheets" => { "available" => false, "clientId" => nil, "apiKey" => nil, "appId" => nil }
        )
      end

      it "com as chaves, entrega à tela o que o navegador precisa" do
        with_env("APIFY_API_TOKEN" => "segredo-apify", "GOOGLE_SHEETS_CLIENT_ID" => "cliente", "GOOGLE_SHEETS_API_KEY" => "chave", "GOOGLE_SHEETS_APP_ID" => "app") do
          get "/campaigns/capabilities", headers: headers, as: :json
        end

        expect(json["capabilities"]).to eq(
          "placeExtractions" => { "available" => true },
          "googleSheets" => { "available" => true, "clientId" => "cliente", "apiKey" => "chave", "appId" => "app" }
        )
      end

      it "a chave do Apify nunca sai daqui" do
        with_env("APIFY_API_TOKEN" => "segredo-apify") do
          get "/campaigns/capabilities", headers: headers, as: :json
        end

        expect(response.body).not_to include("segredo-apify")
      end
    end

    # Sem chave nenhuma, o resto das campanhas funciona.
    it "sem as chaves externas, criar e lançar funciona" do
      with_env("APIFY_API_TOKEN" => nil, "GOOGLE_SHEETS_CLIENT_ID" => nil) do
        create(:outreach_recipient, campaign: campaign)

        post "/campaigns/#{campaign.id}/launch", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end
    end
  end
end
