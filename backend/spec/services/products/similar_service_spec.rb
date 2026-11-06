require "rails_helper"

RSpec.describe Products::SimilarService do
  let(:organization) { create(:organization) }
  let(:item) { create(:product_item, organization: organization, title: "Origem") }

  def with_embedding(title, axis, org: organization, **attributes)
    create(:product_item, organization: org, title: title, **attributes).tap do |created|
      create(:product_embedding, item: created, vector: embedding_vector(axis))
    end
  end

  def similar(limit: 5) = described_class.new(organization.id, item.id, limit: limit).call

  before { create(:product_embedding, item: item, vector: embedding_vector(0)) }

  it "traz da mais parecida para a menos, sem o próprio item" do
    far = with_embedding("Longe", 9)
    near = create(:product_item, organization: organization, title: "Perto")
    create(:product_embedding, item: near, vector: embedding_vector(0).tap { |vector| vector[1] = 0.1 })

    expect(similar.map(&:title)).to eq([ near.title, far.title ])
  end

  it "respeita o limite, com teto" do
    3.times { |i| with_embedding("Item #{i}", i + 1) }

    expect(similar(limit: 2).size).to eq(2)
    expect(described_class.new(organization.id, item.id, limit: 999).instance_variable_get(:@limit)).to eq(described_class::MAX_LIMIT)
  end

  it "sem vetor, nenhum vizinho" do
    without = create(:product_item, organization: organization)

    expect(described_class.new(organization.id, without.id).call).to eq([])
  end

  it "ignora inativos" do
    with_embedding("Inativo", 1, active: false)

    expect(similar).to be_empty
  end

  it "fica na organização" do
    with_embedding("De fora", 0, org: create(:organization))

    expect(similar).to be_empty
  end

  it "não parte de item de outra organização" do
    foreign = with_embedding("De fora", 0, org: create(:organization))

    expect(described_class.new(organization.id, foreign.id).call).to eq([])
  end

  it "não arrasta as colunas de índice" do
    with_embedding("Vizinho", 1)

    expect(similar.first.attributes).not_to include("search_document")
  end
end
