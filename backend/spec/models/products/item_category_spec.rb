require "rails_helper"

RSpec.describe Products::ItemCategory do
  let(:organization) { create(:organization) }
  let(:item) { create(:product_item, organization: organization) }
  let(:category) { create(:product_category, organization: organization) }

  it "mantém o contador da categoria ao ligar e desligar" do
    link = described_class.create!(item: item, category: category)
    expect(category.reload.items_count).to eq(1)

    link.destroy!
    expect(category.reload.items_count).to eq(0)
  end

  it "não liga o mesmo item duas vezes à mesma categoria" do
    described_class.create!(item: item, category: category)

    expect(described_class.new(item: item, category: category)).not_to be_valid
  end

  it "o índice recusa a duplicata que escapar da validação" do
    described_class.create!(item: item, category: category)
    duplicate = described_class.new(item: item, category: category)

    expect { duplicate.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
  end
end
