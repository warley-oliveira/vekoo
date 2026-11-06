require "rails_helper"

RSpec.describe Products::ReindexItemsJob, type: :job do
  let(:organization) { create(:organization) }
  let(:category) { create(:product_category, organization: organization, name: "Móveis") }
  let(:item) { create(:product_item, organization: organization, title: "Cadeira") }

  before do
    item.sync_categories([ category.id ])
    item.refresh_index_text!
  end

  it "roda na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  it "refaz o índice pelo estado atual do banco" do
    category.update_columns(path: "escritorio", name: "Escritório")

    described_class.perform_now(organization.id, [ item.id ])

    expect(item.reload.index_text_secondary).to eq("escritorio")
    expect(Products::Item.where("search_document @@ to_tsquery('portuguese', 'escritorio')")).to include(item)
  end

  it "só altera o que mudou" do
    expect { described_class.perform_now(organization.id, [ item.id ]) }
      .not_to(change { item.reload.updated_at })
  end

  it "sem lista, pega o catálogo inteiro da organização, e só dela" do
    create(:product_field_definition, organization: organization, name: "Cor")
    foreign = create(:product_item, title: "Alheio")
    second = create(:product_item, organization: organization, title: "Mesa")
    second.update_columns(custom_fields: { "cor" => "Azul" }, index_text_secondary: nil)
    foreign.update_columns(index_text_secondary: "intacto")

    described_class.perform_now(organization.id)

    expect(second.reload.index_text_secondary).to eq("azul")
    expect(foreign.reload.index_text_secondary).to eq("intacto")
  end

  it "não alcança item de outra organização, mesmo com o id na lista" do
    foreign = create(:product_item, title: "Alheio")
    foreign.update_columns(index_text_secondary: "intacto")

    described_class.perform_now(organization.id, [ foreign.id ])

    expect(foreign.reload.index_text_secondary).to eq("intacto")
  end

  it "encadeia o embedding quando há chave" do
    with_openai_key("sk-teste") do
      expect { described_class.perform_now(organization.id, [ item.id ]) }
        .to have_enqueued_job(Products::EmbedItemsJob).with([ item.id ])
    end
  end

  it "não enfileira embedding sem chave" do
    with_openai_key(nil) do
      expect { described_class.perform_now(organization.id, [ item.id ]) }
        .not_to have_enqueued_job(Products::EmbedItemsJob)
    end
  end

  describe ".enqueue_for" do
    it "divide em lotes" do
      stub_const("#{described_class}::BATCH_SIZE", 2)

      expect { described_class.enqueue_for(organization.id, %w[a b c]) }.to have_enqueued_job(described_class).twice
    end

    it "não enfileira nada sem itens" do
      expect { described_class.enqueue_for(organization.id, []) }.not_to have_enqueued_job(described_class)
      expect { described_class.enqueue_for(organization.id, nil) }.not_to have_enqueued_job(described_class)
    end
  end
end
