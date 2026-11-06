require "rails_helper"

RSpec.describe ChatTagSerializer do
  let(:organization) { create(:organization) }

  it "traz a etiqueta em camelCase, com a data em milissegundos" do
    tag = create(:chat_tag, organization_id: organization.id, name: "vip", description: "Cliente VIP", color: "#7c3aed")

    expect(described_class.one(tag)).to eq(
      id: tag.id.to_s,
      name: "vip",
      description: "Cliente VIP",
      color: "#7c3aed",
      createdAt: (tag.created_at.to_f * 1000).round
    )
  end

  it "não vaza a organização" do
    expect(described_class.one(create(:chat_tag, organization_id: organization.id))).not_to include(:organizationId)
  end

  it ".many serializa a lista" do
    tags = [ create(:chat_tag, organization_id: organization.id), create(:chat_tag, organization_id: organization.id) ]

    expect(described_class.many(tags).map { |item| item[:name] }).to eq(tags.map(&:name))
  end
end
