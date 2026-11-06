require "rails_helper"

RSpec.describe Products::ImportJob, type: :job do
  let(:organization) { create(:organization) }
  let(:stream) { ProductImportChannel.organization_stream(organization.id, ProductImportChannel::STREAM) }

  let(:csv) do
    <<~CSV
      sku,nome,resumo,categoria,etiquetas,fotos,cor
      SKU-1,Cadeira Gamer Pró,Conforto máximo,Cadeiras,gamer|promoção,https://ex.com/a.png,Preta
      SKU-2,Mesa de Escritório,Tampo de vidro,Mesas,home-office,https://ex.com/c.png,Branca
      SKU-1,Cadeira Gamer Pró v2,Resumo novo,Cadeiras,gamer,https://ex.com/a.png,Vermelha
      ,Item sem SKU,Sem código,Diversos,,,Azul
      SKU-4,,Sem título mesmo,Mesas,,,
    CSV
  end

  let(:mapping) do
    { "sku" => "external_id", "nome" => "title", "resumo" => "summary", "categoria" => "categories",
      "etiquetas" => "tags", "fotos" => "images", "cor" => "custom:cor" }
  end

  before do
    Products::FieldDefinition.find_or_create_by!(organization: organization, name: "Cor") { |field| field.value_type = "text" }
  end

  def build_import(options = { "dedupe_by_title" => true }, body: csv, map: mapping, **attributes)
    create_import(organization, body, mapping: map, options: options, **attributes)
  end

  def items = Products::Item.for_organization(organization.id)

  it "roda na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  it "importa as linhas válidas e conclui" do
    import = build_import

    described_class.perform_now(import.id)

    expect(import.reload).to be_completed
    expect(import).to have_attributes(created_count: 3, updated_count: 0, error_count: 1, processed_rows: 5, total_rows: 5)
    expect(import.completed_at).to be_present
    expect(import.progress_percentage).to eq(100.0)
  end

  # Um CSV real repete SKU; sem dedupe o Postgres recusa o INSERT inteiro com
  # "ON CONFLICT DO UPDATE command cannot affect row a second time".
  it "deduplica SKU repetido no mesmo lote, vencendo a última ocorrência" do
    described_class.perform_now(build_import.id)

    item = items.find_by(external_id: "SKU-1")
    expect(item.title).to eq("Cadeira Gamer Pró v2")
    expect(item.custom_fields["cor"]).to eq("Vermelha")
  end

  it "registra a linha que falhou, com o número dela, sem abortar a importação" do
    import = build_import

    described_class.perform_now(import.id)

    row = Products::ImportRow.find_by!(import: import)
    expect(row.error_message).to eq("título vazio")
    expect(row.line_number).to eq(6)
    expect(row.raw["sku"]).to eq("SKU-4")
    expect(import.reload.error_sample).to eq([ { "line" => 6, "message" => "título vazio" } ])
  end

  it "é idempotente: reimportar atualiza em vez de duplicar" do
    described_class.perform_now(build_import.id)
    second = build_import

    described_class.perform_now(second.id)

    expect(second.reload.created_count).to eq(0)
    expect(second.updated_count).to eq(3)
    expect(items.count).to eq(3)
  end

  it "dá a linha sem SKU uma chave estável, que não duplica ao reimportar" do
    2.times { described_class.perform_now(build_import.id) }

    expect(items.where("external_id LIKE ?", "auto:%").count).to eq(1)
  end

  it "sem `dedupe_by_title`, reimportar o mesmo arquivo ainda converge pela linha" do
    2.times { described_class.perform_now(build_import({}).id) }

    expect(items.where("external_id LIKE ?", "auto:%").count).to eq(1)
  end

  it "cria as categorias que a planilha cita, com o contador certo" do
    described_class.perform_now(build_import.id)

    categories = Products::Category.for_organization(organization.id)
    expect(categories.pluck(:name)).to contain_exactly("Cadeiras", "Mesas", "Diversos")
    expect(categories.find_by(name: "Cadeiras").items_count).to eq(1)
  end

  it "grava as imagens como URL, sem baixar nada" do
    described_class.perform_now(build_import.id)

    expect(items.find_by(external_id: "SKU-1").images.map(&:source_url)).to eq([ "https://ex.com/a.png" ])
    expect(a_request(:any, /ex\.com/)).not_to have_been_made
  end

  it "não alcança outra organização" do
    foreign = create(:product_item, external_id: "SKU-1", title: "Alheio")

    described_class.perform_now(build_import.id)

    expect(foreign.reload.title).to eq("Alheio")
  end

  describe "arquivos da vida real" do
    it "lê planilha em Windows-1252 com ponto e vírgula, sem duplicar nem somar duas vezes" do
      body = "sku;nome\nA1;Cal\xE7a\nA2;Camis\xE3o\n".b

      import = build_import(body: body, map: { "sku" => "external_id", "nome" => "title" }, delimiter: ";")
      described_class.perform_now(import.id)

      expect(items.find_by(external_id: "A1").title).to eq("Calça")
      expect(import.reload).to have_attributes(processed_rows: 2, created_count: 2, error_count: 0)
    end

    it "ignora o BOM do Excel no cabeçalho" do
      body = "\xEF\xBB\xBFsku,nome\nA1,Camiseta\n".b

      described_class.perform_now(build_import(body: body, map: { "sku" => "external_id", "nome" => "title" }).id)

      expect(items.find_by(external_id: "A1").title).to eq("Camiseta")
    end

    it "linha vazia e rodapé de Excel não viram erro" do
      body = "sku;nome\nA1;Camiseta\n\n;;\n"

      import = build_import(body: body, map: { "sku" => "external_id", "nome" => "title" }, delimiter: ";")
      described_class.perform_now(import.id)

      expect(import.reload).to have_attributes(processed_rows: 1, error_count: 0, total_rows: 1)
    end

    it "CSV malformado falha dizendo a linha, com o que veio antes já gravado por lote" do
      stub_const("#{described_class}::BATCH_SIZE", 1)
      body = "sku,nome\nA1,Camiseta\nA2,\"sem fechar\nA3,Vestido\n"

      import = build_import(body: body, map: { "sku" => "external_id", "nome" => "title" })
      described_class.perform_now(import.id)

      expect(import.reload).to be_failed
      expect(import.error_sample.last["message"]).to match(/linha \d+/)
      expect(items.find_by(external_id: "A1")).to be_present
    end
  end

  describe "lotes" do
    before { stub_const("#{described_class}::BATCH_SIZE", 2) }

    it "grava em mais de um lote, somando os contadores" do
      body = "sku,nome\n" + (1..5).map { |n| "S#{n},Item #{n}\n" }.join

      import = build_import(body: body, map: { "sku" => "external_id", "nome" => "title" })
      described_class.perform_now(import.id)

      expect(import.reload).to have_attributes(created_count: 5, processed_rows: 5, total_rows: 5)
    end

    # O SKU que se repete em lotes diferentes atualiza em vez de quebrar o INSERT.
    it "SKU repetido em lotes diferentes conta como atualização" do
      body = "sku,nome\nS1,Um\nS2,Dois\nS1,Um de novo\n"

      import = build_import(body: body, map: { "sku" => "external_id", "nome" => "title" })
      described_class.perform_now(import.id)

      expect(import.reload).to have_attributes(created_count: 2, updated_count: 1)
      expect(items.find_by(external_id: "S1").title).to eq("Um de novo")
    end
  end

  describe "disponibilidade" do
    let!(:hidden) { create(:product_item, organization: organization, external_id: "SKU-2", active: false, title: "Oculto") }

    # Sem isto, reimportar uma tabela de preços reativaria o que a pessoa desativou à mão.
    it "não reativa o item quando a planilha não tem a coluna" do
      described_class.perform_now(build_import.id)

      expect(hidden.reload).not_to be_active
    end

    it "obedece a coluna quando ela vem" do
      body = "sku,nome,disponivel\nSKU-2,Oculto,sim\n"
      map = { "sku" => "external_id", "nome" => "title", "disponivel" => "active" }

      described_class.perform_now(build_import(body: body, map: map).id)

      expect(hidden.reload).to be_active
    end
  end

  describe "uma execução só" do
    # Dois cliques em "Importar", ou uma reentrega da fila.
    it "a segunda execução não reprocessa nem soma nos contadores" do
      import = build_import

      2.times { described_class.perform_now(import.id) }

      expect(import.reload).to have_attributes(processed_rows: 5, created_count: 3, updated_count: 0)
    end

    it "não toca em importação em andamento" do
      import = build_import(status: "processing")

      described_class.perform_now(import.id)

      expect(import.reload).to be_processing
      expect(items.count).to eq(0)
    end

    it "termina em silêncio se a importação foi excluída" do
      expect { described_class.perform_now(SecureRandom.uuid) }.not_to raise_error
    end
  end

  describe "trabalho encadeado" do
    context "com chave" do
      around { |example| with_openai_key("sk-teste") { example.run } }

      it "enfileira o embedding dos itens criados" do
        import = build_import

        expect { described_class.perform_now(import.id) }
          .to have_enqueued_job(Products::EmbedItemsJob).with { |ids| expect(ids.size).to eq(3) }
      end
    end

    context "sem chave" do
      around { |example| with_openai_key(nil) { example.run } }

      it "conclui sem enfileirar embedding" do
        import = build_import

        expect { described_class.perform_now(import.id) }.not_to have_enqueued_job(Products::EmbedItemsJob)
        expect(import.reload).to be_completed
      end
    end

    # O índice do upsert sai só das colunas mapeadas. Sem refazê-lo do banco, a reimportação
    # parcial faria o item parar de ser achado pelo que a planilha não trouxe.
    it "reindexa os itens atualizados" do
      existing = create(:product_item, organization: organization, external_id: "SKU-1", description: "Couro legítimo")

      expect { described_class.perform_now(build_import.id) }
        .to have_enqueued_job(Products::ReindexItemsJob).with(organization.id, [ existing.id ])
    end

    it "uma reimportação parcial mantém o item achável pela descrição" do
      existing = create(:product_item, organization: organization, external_id: "SKU-1", description: "Couro legítimo")

      perform_enqueued_jobs_for(Products::ReindexItemsJob) { described_class.perform_now(build_import.id) }

      expect(existing.reload.index_text_secondary).to include("couro legitimo")
    end

    it "não reindexa quem foi criado agora" do
      expect { described_class.perform_now(build_import.id) }.not_to have_enqueued_job(Products::ReindexItemsJob)
    end

    def perform_enqueued_jobs_for(job_class)
      adapter = ActiveJob::Base.queue_adapter
      start = adapter.enqueued_jobs.size
      yield
      adapter.enqueued_jobs.drop(start)
        .select { |job| job["job_class"] == job_class.name }
        .each { |job| ActiveJob::Base.execute(job) }
    end

    describe "espelhamento de imagens" do
      # Na origem a opção existia na tela, mas o job nunca era enfileirado.
      it "enfileira uma cópia por imagem externa quando a opção está ligada" do
        import = build_import({ "mirror_images" => true })

        expect { described_class.perform_now(import.id) }
          .to have_enqueued_job(Products::MirrorImageJob).exactly(2).times
      end

      it "não enfileira com a opção desligada" do
        expect { described_class.perform_now(build_import({ "mirror_images" => false }).id) }
          .not_to have_enqueued_job(Products::MirrorImageJob)
      end
    end
  end

  describe "progresso" do
    it "transmite a conclusão pelo canal, escopado à organização" do
      import = build_import

      expect { described_class.perform_now(import.id) }.to have_broadcasted_to(stream).with { |message|
        next unless message["action"] == "completed"

        expect(message["data"]).to include(
          "importId" => import.id, "status" => "completed", "processed" => 5, "total" => 5,
          "created" => 3, "updated" => 0, "errors" => 1, "percentage" => 100.0
        )
      }.at_least(:once)
    end

    it "transmite o andamento no começo, já com a estimativa de linhas" do
      import = build_import
      messages = []
      allow(ProductImportChannel).to receive(:broadcast_event) { |_, action, data| messages << [ action, data ] }

      described_class.perform_now(import.id)

      expect(messages.first(2).map(&:first)).to eq(%w[progress progress])
      expect(messages.second.last).to include(total: 5, status: "processing")
      expect(messages.last.first).to eq("completed")
    end

    it "não transmite para outra organização" do
      other = ProductImportChannel.organization_stream(create(:organization).id, ProductImportChannel::STREAM)

      expect { described_class.perform_now(build_import.id) }.not_to have_broadcasted_to(other)
    end
  end

  describe "quando algo dá errado" do
    let(:import) { build_import }

    before do
      allow(Products::ItemUpserter).to receive(:new).and_raise(ActiveRecord::StatementInvalid, "PG::Error: SELECT segredo")
    end

    it "marca como falha" do
      described_class.perform_now(import.id)

      expect(import.reload).to be_failed
    end

    # A mensagem da exceção pode carregar SQL e caminho interno.
    it "diz o que houve sem vazar o erro interno, na resposta nem no canal" do
      messages = []
      allow(ProductImportChannel).to receive(:broadcast_event) { |_, action, data| messages << [ action, data ] }

      described_class.perform_now(import.id)

      expect(import.reload.error_sample.last["message"]).to eq("Não foi possível terminar a importação. Tente de novo.")
      action, data = messages.last
      expect(action).to eq("error")
      expect(data).to include(importId: import.id, code: "importFailed")
      expect(data[:message]).not_to include("segredo")
    end

    it "fala no idioma de quem começou" do
      I18n.with_locale(:en) { described_class.perform_now(import.id) }

      expect(import.reload.error_sample.last["message"]).to eq("We couldn't finish the import. Try again.")
    end
  end
end
