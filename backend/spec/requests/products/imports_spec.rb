require "rails_helper"

RSpec.describe "Products: importação", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:csv) { "SKU;Nome do Produto;Preço;Fotos\nA1;Camiseta Básica;39,90;https://ex.com/a.png\nA2;Vestido Midi;129,90;\n" }

  def import(**attributes)
    create(:product_import, { organization: organization }.merge(attributes))
  end

  describe "sessão e permissão" do
    [
      [ :get, "/products/imports" ],
      [ :post, "/products/imports" ],
      [ :get, "/products/imports/qualquer" ],
      [ :post, "/products/imports/qualquer/start" ],
      [ :delete, "/products/imports/qualquer" ]
    ].each do |verb, path|
      it "#{verb.upcase} #{path} exige sessão" do
        public_send(verb, path, as: :json)

        expect(response).to have_http_status(:unauthorized)
      end

      it "#{verb.upcase} #{path} exige o recurso catalog" do
        role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
        member = create(:account, organization: organization, role: "member", access_role: role)

        public_send(verb, path, headers: auth_headers(member), as: :json)

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "POST /products/imports (fase A)" do
    it "guarda o arquivo e devolve o que a tela de mapeamento precisa" do
      create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")

      expect {
        post "/products/imports", params: { file: csv_upload(csv) }, headers: headers
      }.to change(Products::Import, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "status" => "ready", "filename" => "catalogo.csv", "delimiter" => ";", "percentage" => 0,
        "totalRows" => 0, "processedRows" => 0, "createdAt" => a_kind_of(Integer), "completedAt" => nil
      )
      expect(json["headers"]).to eq([ "SKU", "Nome do Produto", "Preço", "Fotos" ])
      expect(json["sampleRows"].first).to include("SKU" => "A1", "Preço" => "39,90")
      # As chaves são nomes de coluna: saem como vieram, sem virar camelCase.
      expect(json["suggestedMapping"]).to eq("SKU" => "external_id", "Nome do Produto" => "title", "Fotos" => "images")
      expect(json["targets"]).to include(
        { "value" => "title", "label" => "Título", "kind" => "native" },
        { "value" => "custom:preco", "label" => "Preço", "kind" => "custom", "valueType" => "number" }
      )
    end

    it "liga a importação à organização e a quem enviou" do
      post "/products/imports", params: { file: csv_upload(csv) }, headers: headers

      record = Products::Import.find(json["id"])
      expect(record.organization).to eq(organization)
      expect(record.account).to eq(account)
      expect(record.file).to be_attached
    end

    it "traduz os rótulos dos alvos" do
      post "/products/imports", params: { file: csv_upload(csv) }, headers: headers.merge("Accept-Language" => "en")

      expect(json["targets"].first).to eq("value" => "title", "label" => "Title", "kind" => "native")
    end

    # Regressão: `CSV.parse(..., encoding: 'bom|utf-8')`, como na origem, levanta nesta
    # versão do csv e faria toda importação ser recusada como ilegível.
    it "lê BOM e acento do Excel" do
      post "/products/imports", params: { file: csv_upload("\xEF\xBB\xBFDescrição;Preço\nCamisão;10\n") }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["headers"]).to eq(%w[Descrição Preço])
      expect(json["sampleRows"]).to eq([ { "Descrição" => "Camisão", "Preço" => "10" } ])
    end

    it "lê Windows-1252" do
      post "/products/imports", params: { file: csv_upload("Descri\xE7\xE3o;Pre\xE7o\nCamis\xE3o;10\n") }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json["headers"]).to eq(%w[Descrição Preço])
    end

    it "422 para binário, sem guardar nada" do
      expect {
        post "/products/imports", params: { file: csv_upload("PK\x03\x04\x00\x00", "planilha.xlsx", "application/zip") }, headers: headers
      }.not_to change(Products::Import, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "unreadableFile", "field" => "file")
      expect(json.dig("error", "details", "file")).to be_present
    end

    it "422 para arquivo vazio" do
      post "/products/imports", params: { file: csv_upload("") }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("unreadableFile")
    end

    it "422 acima do teto, dizendo o limite" do
      stub_const("Products::Import::MAX_FILE_BYTES", 2.megabytes)
      big = csv_upload("sku\n" + "a" * 3.megabytes)

      post "/products/imports", params: { file: big }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "fileTooLarge", "field" => "file")
      expect(json.dig("error", "message")).to include("2 MB")
    end

    it "400 sem arquivo" do
      post "/products/imports", headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "422 com `file` em texto" do
      post "/products/imports", params: { file: "nao-e-arquivo" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "fala no idioma da requisição" do
      post "/products/imports", params: { file: csv_upload("") }, headers: headers.merge("Accept-Language" => "en")

      expect(json.dig("error", "message")).to match(/couldn't read/)
    end
  end

  describe "POST /products/imports/:id/start (fase B)" do
    let(:record) { import }
    let(:mapping) { { "SKU" => "external_id", "Nome do Produto" => "title" } }

    it "guarda o mapeamento e enfileira o job, sem camelizar nome de coluna" do
      expect {
        post "/products/imports/#{record.id}/start",
          params: { mapping: mapping, options: { dedupeByTitle: true, mirrorImages: false } },
          headers: headers, as: :json
      }.to have_enqueued_job(Products::ImportJob).with(record.id).on_queue("low")

      expect(response).to have_http_status(:accepted)
      expect(json["mapping"]).to eq(mapping)
      expect(json["options"]).to eq("dedupeByTitle" => true, "mirrorImages" => false)
      expect(record.reload.mapping).to eq(mapping)
      expect(record.options).to eq("dedupe_by_title" => true, "mirror_images" => false)
    end

    it "só guarda as opções conhecidas" do
      post "/products/imports/#{record.id}/start",
        params: { mapping: mapping, options: { dedupeByTitle: true, apagarTudo: true } }, headers: headers, as: :json

      expect(record.reload.options).to eq("dedupe_by_title" => true)
    end

    it "422 sem coluna de título: é o único campo obrigatório" do
      expect {
        post "/products/imports/#{record.id}/start",
          params: { mapping: { "SKU" => "external_id" } }, headers: headers, as: :json
      }.not_to have_enqueued_job(Products::ImportJob)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "titleNotMapped", "field" => "mapping")
      expect(record.reload).to be_ready
    end

    it "422 sem mapeamento nenhum" do
      post "/products/imports/#{record.id}/start", params: {}, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("titleNotMapped")
    end

    it "422 se já foi iniciada, sem enfileirar de novo" do
      started = import(status: "processing")

      expect {
        post "/products/imports/#{started.id}/start", params: { mapping: mapping }, headers: headers, as: :json
      }.not_to have_enqueued_job(Products::ImportJob)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("importAlreadyStarted")
    end

    it "404 em importação de outra organização" do
      foreign = create(:product_import)

      expect {
        post "/products/imports/#{foreign.id}/start", params: { mapping: mapping }, headers: headers, as: :json
      }.not_to have_enqueued_job(Products::ImportJob)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "de ponta a ponta" do
    it "do arquivo cru aos itens no catálogo, com a preview servindo de mapeamento" do
      create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")

      post "/products/imports", params: { file: csv_upload(csv) }, headers: headers
      id = json["id"]
      mapping = json["suggestedMapping"].merge("Preço" => "custom:preco")

      perform_enqueued_jobs(only: Products::ImportJob) do
        post "/products/imports/#{id}/start",
          params: { mapping: mapping, options: { dedupeByTitle: true } }, headers: headers, as: :json
      end

      get "/products/imports/#{id}", headers: headers

      expect(json).to include("status" => "completed", "createdCount" => 2, "errorCount" => 0, "percentage" => 100.0, "errorSample" => [])

      get "/products/search", params: { q: "A1" }, headers: headers

      item = json["items"].first
      expect(item).to include("title" => "Camiseta Básica", "customFields" => { "preco" => 39.9 })
      expect(item["images"].first).to include("url" => "https://ex.com/a.png", "hosted" => false)
    end

    it "uma importação parcial não apaga o que a planilha não trouxe" do
      create(:product_item, organization: organization, external_id: "A1", title: "Antiga", description: "Couro legítimo")

      post "/products/imports", params: { file: csv_upload(csv) }, headers: headers

      perform_enqueued_jobs(only: [ Products::ImportJob, Products::ReindexItemsJob ]) do
        post "/products/imports/#{json["id"]}/start",
          params: { mapping: { "SKU" => "external_id", "Nome do Produto" => "title" } }, headers: headers, as: :json
      end

      get "/products/search", params: { q: "couro" }, headers: headers

      expect(json["items"].map { |item| item["externalId"] }).to eq(%w[A1])
    end

    it "a transmissão do canal chega na stream da organização" do
      post "/products/imports", params: { file: csv_upload(csv) }, headers: headers
      id = json["id"]
      stream = ProductImportChannel.organization_stream(organization.id, ProductImportChannel::STREAM)

      expect {
        perform_enqueued_jobs(only: Products::ImportJob) do
          post "/products/imports/#{id}/start",
            params: { mapping: { "Nome do Produto" => "title" } }, headers: headers, as: :json
        end
      }.to have_broadcasted_to(stream).at_least(:once)
    end

    it "espelha as imagens quando pedido" do
      post "/products/imports", params: { file: csv_upload(csv) }, headers: headers

      expect {
        perform_enqueued_jobs(only: Products::ImportJob) do
          post "/products/imports/#{json["id"]}/start",
            params: { mapping: { "SKU" => "external_id", "Nome do Produto" => "title", "Fotos" => "images" }, options: { mirrorImages: true } },
            headers: headers, as: :json
        end
      }.to have_enqueued_job(Products::MirrorImageJob).once
    end
  end

  describe "GET /products/imports" do
    it "lista as da organização, das mais novas para as mais antigas, sem a amostra de erros" do
      old = import(created_at: 2.days.ago)
      recent = import(created_at: 1.day.ago)
      create(:product_import)

      get "/products/imports", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["imports"].map { |entry| entry["id"] }).to eq([ recent.id, old.id ])
      expect(json["imports"].first.keys).not_to include("errorSample")
      expect(json["meta"]).to include("total" => 2, "perPage" => 20)
    end
  end

  describe "GET /products/imports/:id" do
    it "devolve o estado, com a amostra de erros" do
      record = import(status: "completed", processed_rows: 2, total_rows: 2, error_count: 1,
        error_sample: [ { "line" => 3, "message" => "título vazio" } ])

      get "/products/imports/#{record.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("status" => "completed", "percentage" => 100.0, "errorCount" => 1)
      expect(json["errorSample"]).to eq([ { "line" => 3, "message" => "título vazio" } ])
    end

    it "404 em importação de outra organização" do
      get "/products/imports/#{create(:product_import).id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /products/imports/:id" do
    it "204 e some, com as linhas de erro" do
      record = import(status: "completed")
      Products::ImportRow.create!(import: record, line_number: 2, error_message: "x")

      delete "/products/imports/#{record.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Products::Import.exists?(record.id)).to be(false)
      expect(Products::ImportRow.count).to eq(0)
    end

    it "422 enquanto está em andamento" do
      record = import(status: "processing")

      delete "/products/imports/#{record.id}", headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("importInProgress")
      expect(Products::Import.exists?(record.id)).to be(true)
    end

    it "404 em importação de outra organização" do
      foreign = create(:product_import)

      delete "/products/imports/#{foreign.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Products::Import.exists?(foreign.id)).to be(true)
    end
  end
end
