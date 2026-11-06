require "rails_helper"

RSpec.describe Products::EmbedItemsJob, type: :job do
  let(:organization) { create(:organization) }
  let(:item) { create(:product_item, organization: organization, title: "Cadeira") }

  it "roda na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  context "sem chave" do
    around { |example| with_openai_key(nil) { example.run } }

    it "não enfileira nada, para a fila não encher de job vazio" do
      expect { described_class.enqueue_for([ item.id ]) }.not_to have_enqueued_job(described_class)
    end

    it "se já estava na fila, termina sem chamar a API nem gravar" do
      expect { described_class.perform_now([ item.id ]) }.not_to change(Products::Embedding, :count)

      expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
    end
  end

  context "com chave" do
    around { |example| with_openai_key("sk-teste") { example.run } }

    before { stub_openai_embeddings }

    it "grava o vetor com organização, modelo e hash do texto" do
      described_class.perform_now([ item.id ])

      embedding = Products::Embedding.find_by!(product_item_id: item.id)
      expect(embedding.organization_id).to eq(organization.id)
      expect(embedding.model).to eq(Products::Embedder::MODEL)
      expect(embedding.source_hash).to eq(Products::Embedder.source_hash(item.embedding_source_text))
      expect(embedding.embedding.size).to eq(Products::Embedder::DIMENSIONS)
    end

    # Item salvo com o texto indexável igual não paga um centavo de OpenAI.
    it "não chama a API de novo se o texto não mudou" do
      described_class.perform_now([ item.id ])
      described_class.perform_now([ item.id ])

      expect(a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL)).to have_been_made.once
    end

    it "atualiza o mesmo registro quando o texto muda" do
      described_class.perform_now([ item.id ])
      original_hash = Products::Embedding.find_by!(product_item_id: item.id).source_hash

      item.update!(title: "Cadeira Gamer")

      expect { described_class.perform_now([ item.id ]) }.not_to change(Products::Embedding, :count)
      expect(Products::Embedding.find_by!(product_item_id: item.id).source_hash).not_to eq(original_hash)
    end

    it "associa cada vetor ao item certo" do
      second = create(:product_item, organization: organization, title: "Mesa")

      described_class.perform_now([ item.id, second.id ])

      expect(Products::Embedding.where(product_item_id: [ item.id, second.id ]).count).to eq(2)
      expect(Products::Embedding.find_by!(product_item_id: second.id).source_hash)
        .to eq(Products::Embedder.source_hash(second.embedding_source_text))
    end

    it "usa só os campos pesquisáveis da organização do item" do
      create(:product_field_definition, organization: organization, name: "Cor")
      other = create(:organization)
      create(:product_field_definition, organization: other, name: "Material")
      item.update!(custom_fields: { "cor" => "Azul", "material" => "Couro" })

      described_class.perform_now([ item.id ])

      expect(
        a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).with do |request|
          sent = JSON.parse(request.body)["input"].first
          sent.include?("Azul") && !sent.include?("Couro")
        end
      ).to have_been_made.once
    end

    it "não consulta a API por item que já foi apagado" do
      expect { described_class.perform_now([ SecureRandom.uuid ]) }.not_to change(Products::Embedding, :count)

      expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
    end

    it "enfileira em lotes" do
      stub_const("#{described_class}::BATCH_SIZE", 2)

      expect { described_class.enqueue_for(%w[a b c]) }.to have_enqueued_job(described_class).twice
    end

    describe "quando a API falha" do
      include ActiveJob::TestHelper

      before { stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(status: 500, body: "{}") }

      it "tenta de novo depois" do
        expect { described_class.perform_now([ item.id ]) }.to have_enqueued_job(described_class)
      end

      # A varredura recorrente alcança o item depois; aqui, só não pode virar erro sem fim.
      it "desiste depois das tentativas, sem levantar" do
        perform_enqueued_jobs { described_class.perform_later([ item.id ]) }

        expect(a_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL)).to have_been_made.times(3)
        expect(Products::Embedding.count).to eq(0)
      end
    end
  end
end
