require "rails_helper"

RSpec.describe Products::SaveItem do
  let(:organization) { create(:organization) }
  let(:category) { create(:product_category, organization: organization, name: "Móveis") }
  let(:item) { organization.product_items.new }

  def save(target = item, attributes = { title: "Cadeira" }, **options)
    described_class.new(target, attributes, **options).call
  end

  it "grava o item e os vínculos juntos" do
    expect(save(category_ids: [ category.id ])).to be(true)

    expect(item.reload.categories).to contain_exactly(category)
    expect(category.reload.items_count).to eq(1)
  end

  # Os vínculos são gravados depois do item, e o índice os reúne: sem refazê-lo aqui, o
  # item recém-criado só seria achado pela própria categoria depois de um segundo salvamento.
  it "deixa o item achável pela categoria desde o primeiro salvamento" do
    save(category_ids: [ category.id ])

    expect(item.reload.index_text_secondary).to include("moveis")
    expect(Products::Item.where("search_document @@ to_tsquery('portuguese', 'moveis')")).to include(item)
  end

  it "sai da busca pela categoria quando o vínculo é desfeito" do
    save(category_ids: [ category.id ])

    save(item, { title: "Cadeira" }, category_ids: [])

    expect(item.reload.categories).to be_empty
    expect(item.index_text_secondary).not_to include("moveis")
  end

  it "sem `category_ids`, os vínculos ficam como estão" do
    save(category_ids: [ category.id ])

    save(item, { title: "Cadeira Nova" })

    expect(item.reload.categories).to contain_exactly(category)
  end

  it "falha sem gravar nada, nem vínculo, nem job" do
    invalid = organization.product_items.new

    with_openai_key("sk-teste") do
      expect { expect(save(invalid, { title: "" }, category_ids: [ category.id ])).to be(false) }
        .not_to have_enqueued_job(Products::EmbedItemsJob)
    end
    expect(invalid.errors[:title]).to be_present
    expect(Products::ItemCategory.count).to eq(0)
  end

  it "desfaz o item se os vínculos falharem" do
    allow(item).to receive(:sync_categories).and_raise(ActiveRecord::RecordInvalid)

    expect { save(category_ids: [ category.id ]) }.to raise_error(ActiveRecord::RecordInvalid)
    expect(Products::Item.exists?(item.id)).to be(false)
  end

  it "enfileira o embedding com chave" do
    with_openai_key("sk-teste") do
      expect { save }.to have_enqueued_job(Products::EmbedItemsJob)
    end
  end

  it "não enfileira sem chave" do
    with_openai_key(nil) do
      expect { save }.not_to have_enqueued_job(Products::EmbedItemsJob)
    end
  end
end
