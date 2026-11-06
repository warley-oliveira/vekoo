require "rails_helper"

RSpec.describe "Importação de contatos", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }

  def csv_file(content, name: "contatos.csv", type: "text/csv")
    Rack::Test::UploadedFile.new(StringIO.new(content), type, original_filename: name)
  end

  it "exige sessão" do
    get "/contact-imports"
    expect(response).to have_http_status(:unauthorized)

    post "/contact-imports", params: { connectorId: "x" }, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  it "exige contatos ou configuração" do
    headers = auth_headers(member_with(chat: "all"))

    get "/contact-imports", headers: headers
    expect(response).to have_http_status(:forbidden)

    post "/contact-imports", params: { connectorId: connector.id.to_s, contacts: [ { externalId: "1", userName: "x" } ] }, headers: headers, as: :json
    expect(response).to have_http_status(:forbidden)
  end

  it "deixa quem configura os canais importar: é onde a tela da origem oferecia" do
    post "/contact-imports",
         params: { connectorId: connector.id.to_s, contacts: [ { externalId: "5531971810932", userName: "Fernanda" } ] },
         headers: auth_headers(member_with(core_settings: "all")), as: :json

    expect(response).to have_http_status(:created)
  end

  describe "POST /contact-imports" do
    let(:contacts) { [ { externalId: "5531971810932", userName: "Fernanda", assignedUserName: "Marina Duarte" }, { externalId: "5541999990000", userName: "Roberto" } ] }

    it "guarda as linhas e manda processar" do
      expect {
        post "/contact-imports", params: { connectorId: connector.id.to_s, contacts: contacts, includeCountryCode: false }, headers: headers, as: :json
      }.to have_enqueued_job(ProcessContactImportJob)

      expect(response).to have_http_status(:created)
      expect(json).to include("importedCount" => 2, "totalContacts" => 2)
      expect(json["contactImport"]).to include("connectorId" => connector.id.to_s, "status" => "pending", "totalContacts" => 2, "accountId" => owner.id)

      contact_import = ContactImport.find(json["contactImport"]["id"])
      expect(contact_import.organization).to eq(organization)
      expect(contact_import.contact_import_rows.pluck(:name)).to contain_exactly("Fernanda", "Roberto")
      row = contact_import.contact_import_rows.find_by(name: "Fernanda")
      expect(row.additional_data).to include("assigned_user_name" => "Marina Duarte")
    end

    it "guarda o nome do arquivo que a tela leu, para o histórico" do
      post "/contact-imports", params: { connectorId: connector.id.to_s, contacts: contacts, fileName: "clientes.csv" }, headers: headers, as: :json

      expect(json["contactImport"]).to include("fileName" => "clientes.csv")
    end

    it "acrescenta o DDI quando pedido" do
      post "/contact-imports",
           params: { connectorId: connector.id.to_s, contacts: [ { externalId: "31971810932", userName: "Fernanda" }, { externalId: "5541999990000", userName: "Roberto" } ], includeCountryCode: true },
           headers: headers, as: :json

      phones = ContactImport.find(json["contactImport"]["id"]).contact_import_rows.pluck(:phone)
      expect(phones).to contain_exactly("5531971810932", "5541999990000")
    end

    it "guarda de qual lote veio" do
      post "/contact-imports",
           params: { connectorId: connector.id.to_s, contacts: contacts, batchIndex: 1, totalBatches: 3 },
           headers: headers, as: :json

      expect(json["contactImport"]).to include("batchIndex" => 1, "totalBatches" => 3)
    end

    it "conta quem ficou de fora por não ter telefone ou nome" do
      post "/contact-imports",
           params: { connectorId: connector.id.to_s, contacts: [ { externalId: "5531971810932", userName: "Fernanda" }, { externalId: "", userName: "Sem número" }, { externalId: "5541" } ] },
           headers: headers, as: :json

      expect(json).to include("importedCount" => 1, "totalContacts" => 3)
      expect(json["contactImport"]["errorsCount"]).to eq(2)
    end

    it "responde 422 sem contatos" do
      post "/contact-imports", params: { connectorId: connector.id.to_s, contacts: [] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "noContactsProvided", "field" => "contacts")
    end

    it "responde 422 quando nenhum contato presta" do
      post "/contact-imports", params: { connectorId: connector.id.to_s, contacts: [ { userName: "Sem número" } ] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("noValidContacts")
    end

    it "responde 422 acima de 1000 por lote" do
      stub_const("ContactImportsController::BATCH_SIZE", 1)

      post "/contact-imports", params: { connectorId: connector.id.to_s, contacts: contacts }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("tooManyContacts")
    end

    it "não usa canal de outra organização" do
      foreign = create(:connector_whatsapp_web, organization: create(:organization))

      post "/contact-imports", params: { connectorId: foreign.id.to_s, contacts: contacts }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidConnector", "field" => "connectorId")
      expect(ContactImport.count).to eq(0)
    end
  end

  describe "POST /contact-imports/file" do
    it "lê o CSV e manda processar" do
      expect {
        post "/contact-imports/file",
             params: { connectorId: connector.id.to_s, file: csv_file("external_id,user_name\n5531971810932,Fernanda\n") },
             headers: headers
      }.to have_enqueued_job(ProcessContactImportJob)

      expect(response).to have_http_status(:created)
      expect(json).to include("importedCount" => 1, "totalContacts" => 1, "totalBatches" => 1, "fileName" => "contatos.csv")
      expect(json["contactImports"].first["fileName"]).to eq("contatos.csv")
    end

    it "entende planilha do Excel brasileiro: `;`, BOM e cabeçalho em português" do
      post "/contact-imports/file",
           params: { connectorId: connector.id.to_s, file: csv_file("﻿Nome;Telefone;Responsável\nFernanda;5531971810932;Marina\n") },
           headers: headers

      expect(response).to have_http_status(:created)
      row = ContactImport.find(json["contactImports"].first["id"]).contact_import_rows.first
      expect(row).to have_attributes(name: "Fernanda", phone: "5531971810932")
      expect(row.additional_data).to include("assigned_user_name" => "Marina")
    end

    it "lê arquivo em ISO-8859-1" do
      post "/contact-imports/file",
           params: { connectorId: connector.id.to_s, file: csv_file("nome,telefone\nJoão,5531971810932\n".encode("ISO-8859-1")) },
           headers: headers

      expect(response).to have_http_status(:created)
      expect(ContactImport.find(json["contactImports"].first["id"]).contact_import_rows.first.name).to eq("João")
    end

    it "divide listas grandes em lotes" do
      stub_const("ContactImportsController::BATCH_SIZE", 2)
      content = "external_id,user_name\n" + (1..5).map { |n| "553197181093#{n},Pessoa #{n}" }.join("\n")

      post "/contact-imports/file", params: { connectorId: connector.id.to_s, file: csv_file(content) }, headers: headers

      expect(json).to include("importedCount" => 5, "totalContacts" => 5, "totalBatches" => 3)
      expect(json["contactImports"].map { |i| i["batchIndex"] }).to eq([ 0, 1, 2 ])
    end

    it "responde 422 sem arquivo" do
      post "/contact-imports/file", params: { connectorId: connector.id.to_s }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "fileRequired", "field" => "file")
    end

    it "responde 422 com o que não é CSV" do
      post "/contact-imports/file", params: { connectorId: connector.id.to_s, file: csv_file("x", name: "foto.png", type: "image/png") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("invalidCsv")
    end

    it "responde 422 com CSV quebrado" do
      post "/contact-imports/file", params: { connectorId: connector.id.to_s, file: csv_file("a,b\n\"nunca fecha,1\n") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("malformedCsv")
    end

    it "responde 422 sem nenhum contato válido" do
      post "/contact-imports/file", params: { connectorId: connector.id.to_s, file: csv_file("cidade\nCuritiba\n") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("noValidContacts")
    end

    it "não usa canal de outra organização" do
      foreign = create(:connector_whatsapp_web, organization: create(:organization))

      post "/contact-imports/file", params: { connectorId: foreign.id.to_s, file: csv_file("nome,telefone\nA,1\n") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "GET /contact-imports" do
    it "lista as da organização, da mais recente para a mais antiga" do
      older = create(:contact_import, organization: organization, created_at: 2.days.ago)
      newer = create(:contact_import, organization: organization)
      create(:contact_import)

      get "/contact-imports", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["contactImports"].map { |i| i["id"] }).to eq([ newer.id, older.id ])
      expect(json["meta"]).to include("total" => 2)
    end
  end

  describe "GET /contact-imports/:id" do
    it "traz o andamento" do
      contact_import = create(:contact_import, organization: organization, total_contacts: 4, imported_contacts_count: 2, errors_count: 1)

      get "/contact-imports/#{contact_import.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["contactImport"]).to include("totalContacts" => 4, "progressPercentage" => 75.0, "successRate" => 50.0)
    end

    it "responde 404 para a de outra organização" do
      get "/contact-imports/#{create(:contact_import).id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end
end
