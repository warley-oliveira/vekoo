require "rails_helper"

RSpec.describe Products::Embedding do
  let(:item) { create(:product_item) }

  it "guarda e devolve o vetor de 512 dimensões" do
    embedding = create(:product_embedding, item: item, vector: embedding_vector(3))

    expect(embedding.reload.embedding).to eq(embedding_vector(3))
    expect(embedding.embedding.size).to eq(Products::Embedder::DIMENSIONS)
  end

  it "recusa vetor de outro tamanho, que não caberia na coluna" do
    expect { create(:product_embedding, item: item, vector: [ 1.0, 2.0 ]) }.to raise_error(ActiveRecord::RecordInvalid)
  end

  it "exige o hash do texto e o modelo" do
    embedding = build(:product_embedding, item: item, source_hash: nil, model: nil)

    expect(embedding).not_to be_valid
    expect(embedding.errors.attribute_names).to include(:source_hash, :model)
  end

  it "um item tem um vetor só" do
    create(:product_embedding, item: item)

    expect { create(:product_embedding, item: item) }.to raise_error(ActiveRecord::RecordNotUnique)
  end

  it "acha o vizinho mais próximo pelo cosseno" do
    near = create(:product_embedding, vector: embedding_vector(0))
    create(:product_embedding, vector: embedding_vector(1))

    expect(described_class.nearest_neighbors(:embedding, embedding_vector(0), distance: "cosine").first).to eq(near)
  end
end
