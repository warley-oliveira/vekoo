# frozen_string_literal: true

require "rails_helper"

RSpec.describe DynamicTable do
  it "pertence a uma organização, sempre" do
    table = described_class.new(name: "pedidos")

    expect(table).not_to be_valid
    expect(table.errors[:organization_id]).to be_present
  end

  it "exige nome" do
    expect(described_class.new(organization_id: "org")).not_to be_valid
  end

  it "o nome é único por organização" do
    described_class.create!(name: "pedidos", organization_id: "a")

    expect(described_class.new(name: "pedidos", organization_id: "a")).not_to be_valid
    expect(described_class.new(name: "pedidos", organization_id: "b")).to be_valid
  end

  it "apagar a tabela apaga os registros, só os dela" do
    table = described_class.create!(name: "a", organization_id: "org")
    other = described_class.create!(name: "b", organization_id: "org")
    DynamicRecord.create!(dynamic_table: table, data: { a: 1 })
    kept = DynamicRecord.create!(dynamic_table: other, data: { a: 2 })

    table.destroy

    expect(DynamicRecord.all.to_a).to eq([ kept ])
  end

  it "declara o índice único que protege o nome" do
    expect(described_class.index_specifications.map(&:key)).to include({ organization_id: 1, name: 1 })
    expect(described_class.index_specifications.first.options).to include(unique: true)
  end
end

RSpec.describe DynamicRecord do
  let(:table) { DynamicTable.create!(name: "pedidos", organization_id: "org") }

  it "precisa de uma tabela" do
    expect(described_class.new(data: {})).not_to be_valid
  end

  it "to_data junta os dados e o id em texto" do
    record = described_class.create!(dynamic_table: table, data: { "a" => 1 })

    expect(record.to_data).to eq("a" => 1, "id" => record.id.to_s)
  end

  it "o id do registro ganha do campo id que estiver nos dados" do
    record = described_class.create!(dynamic_table: table, data: { "id" => "falso" })

    expect(record.to_data["id"]).to eq(record.id.to_s)
  end

  it "declara o índice que serve à consulta padrão" do
    expect(described_class.index_specifications.map(&:key)).to include({ dynamic_table_id: 1, _id: 1 })
  end
end
