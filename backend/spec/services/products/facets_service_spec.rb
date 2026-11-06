require "rails_helper"

RSpec.describe Products::FacetsService do
  let(:organization) { create(:organization) }

  def facets(field, org: organization) = described_class.new(org&.id, field).call

  describe "tags" do
    before do
      create(:product_item, organization: organization, tags: %w[azul promo])
      create(:product_item, organization: organization, tags: %w[azul])
    end

    it "conta, das mais frequentes para as menos" do
      expect(facets("tags")).to eq([ { value: "azul", count: 2 }, { value: "promo", count: 1 } ])
    end

    it "só de itens ativos" do
      create(:product_item, organization: organization, tags: %w[antiga], active: false)

      expect(facets("tags").map { |row| row[:value] }).not_to include("antiga")
    end
  end

  describe "campo personalizado" do
    before do
      create(:product_item, organization: organization, custom_fields: { "cor" => "preta" })
      create(:product_item, organization: organization, custom_fields: { "cor" => "preta" })
      create(:product_item, organization: organization, custom_fields: { "cor" => "branca" })
      create(:product_item, organization: organization, custom_fields: { "peso" => 10 })
      create(:product_item, organization: organization, custom_fields: { "cor" => "" })
    end

    it "conta os valores e ignora quem não tem" do
      expect(facets("cor")).to eq([ { value: "preta", count: 2 }, { value: "branca", count: 1 } ])
    end

    it "número vira texto" do
      expect(facets("peso")).to eq([ { value: "10", count: 1 } ])
    end

    it "campo que não existe não tem valores" do
      expect(facets("nada")).to eq([])
    end

    # A chave vem do script.
    it "o nome do campo é dado, nunca SQL" do
      expect(facets("x' OR 1=1; DROP TABLE product_items; --")).to eq([])
      expect(Products::Item.count).to eq(5)
    end
  end

  it "tem teto" do
    stub_const("#{described_class}::MAX_VALUES", 1)
    create(:product_item, organization: organization, tags: %w[a b c])

    expect(facets("tags").size).to eq(1)
  end

  it "fica na organização" do
    create(:product_item, organization: create(:organization), tags: %w[de-fora], custom_fields: { "cor" => "dourada" })

    expect(facets("tags")).to be_empty
    expect(facets("cor")).to be_empty
  end

  it "falha fechado: sem organização ou sem campo" do
    create(:product_item, organization: organization, tags: %w[a])

    expect(facets("tags", org: nil)).to eq([])
    expect(facets("")).to eq([])
  end
end
