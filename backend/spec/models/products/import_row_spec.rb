require "rails_helper"

RSpec.describe Products::ImportRow do
  let(:import) { create(:product_import) }

  it "guarda a linha que falhou, com o conteúdo cru" do
    row = described_class.create!(import: import, line_number: 7, error_message: "título vazio", raw: { "sku" => "A1" })

    expect(row.reload).to have_attributes(line_number: 7, error_message: "título vazio", raw: { "sku" => "A1" })
    expect(import.rows).to contain_exactly(row)
  end

  it "exige o número da linha e a mensagem" do
    row = described_class.new(import: import)

    expect(row).not_to be_valid
    expect(row.errors.attribute_names).to include(:line_number, :error_message)
  end
end
