require "rails_helper"

RSpec.describe Products::FieldDefinition do
  let(:organization) { create(:organization) }

  def definition(value_type, **attributes)
    build(:product_field_definition, organization: organization, value_type: value_type, **attributes)
  end

  describe "chave" do
    it "deriva do nome" do
      field = create(:product_field_definition, organization: organization, name: "Preço de Venda")

      expect(field.key).to eq("preco_de_venda")
    end

    it "não muda ao renomear: é a chave do valor em todo item" do
      field = create(:product_field_definition, organization: organization, name: "Cor")

      field.update!(name: "Cor Principal")

      expect(field.reload.key).to eq("cor")
    end

    it "acusa nome repetido no campo de nome, que é o que a pessoa preenche" do
      create(:product_field_definition, organization: organization, name: "Cor")
      duplicate = definition("text", name: "cor")

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:name]).to be_present
    end

    it "permite o mesmo nome em outra organização" do
      create(:product_field_definition, name: "Cor")

      expect(definition("text", name: "Cor")).to be_valid
    end
  end

  describe "validações" do
    it "recusa tipo desconhecido" do
      expect(definition("foguete")).not_to be_valid
    end

    it "lista exige ao menos uma opção" do
      field = definition("list", option_values: [])

      expect(field).not_to be_valid
      expect(field.errors[:option_values]).to be_present
    end

    it "limpa opções em branco e repetidas" do
      field = create(:product_field_definition, organization: organization, value_type: "list",
        option_values: [ "Preto", "", "  Azul  ", "Azul" ])

      expect(field.option_values).to eq(%w[Preto Azul])
    end
  end

  describe "#numeric?" do
    it "só o tipo número" do
      expect(definition("number")).to be_numeric
      expect(definition("text")).not_to be_numeric
    end
  end

  describe "#cast" do
    it "número aceita o formato de planilha brasileira" do
      field = definition("number")

      expect(field.cast("10")).to eq(10.0)
      expect(field.cast("10,5")).to eq(10.5)
      expect(field.cast("10.5")).to eq(10.5)
      expect(field.cast("1.234,56")).to eq(1234.56)
      expect(field.cast("1,234.56")).to eq(1234.56)
      expect(field.cast("R$ 1.234,56")).to eq(1234.56)
      expect(field.cast("-3,5")).to eq(-3.5)
      expect(field.cast(42)).to eq(42.0)
    end

    it "número inválido vira nil" do
      expect(definition("number").cast("caro")).to be_nil
    end

    # O `ActiveModel::Type::Boolean` só conhece false/f/0/off: "Não" viraria verdadeiro.
    it "checkbox entende o português da planilha" do
      field = definition("checkbox")

      expect(field.cast("sim")).to be(true)
      expect(field.cast("true")).to be(true)
      expect(field.cast(true)).to be(true)
      expect(field.cast("Não")).to be(false)
      expect(field.cast("nao")).to be(false)
      expect(field.cast("false")).to be(false)
      expect(field.cast(false)).to be(false)
      expect(field.cast("0")).to be(false)
    end

    it "data vira ISO, e o inválido, nil" do
      field = definition("date")

      expect(field.cast("31/12/2026")).to eq("2026-12-31")
      expect(field.cast("2026-12-31")).to eq("2026-12-31")
      expect(field.cast("qualquer dia")).to be_nil
    end

    it "url só aceita http(s)" do
      field = definition("url")

      expect(field.cast(" https://loja.com/manual.pdf ")).to eq("https://loja.com/manual.pdf")
      expect(field.cast("javascript:alert(1)")).to be_nil
    end

    it "texto e lista ficam como string limpa" do
      expect(definition("text").cast("  Azul  ")).to eq("Azul")
      expect(definition("list", option_values: %w[Azul]).cast(" Azul ")).to eq("Azul")
      expect(definition("text").cast(10)).to eq("10")
    end

    it "valor vazio vira nil em qualquer tipo" do
      Products::FieldDefinition::VALUE_TYPES.each do |value_type|
        expect(definition(value_type).cast("   ")).to be_nil
        expect(definition(value_type).cast(nil)).to be_nil
      end
    end
  end

  describe ".ordered" do
    # Com UUID, desempatar pelo id embaralharia a ordem de criação.
    it "desempata pela ordem de criação" do
      first = create(:product_field_definition, organization: organization, name: "Zebra", created_at: 2.days.ago)
      second = create(:product_field_definition, organization: organization, name: "Alfa", created_at: 1.day.ago)
      placed = create(:product_field_definition, organization: organization, name: "Meio", position: -1)

      expect(described_class.for_organization(organization.id).ordered).to eq([ placed, first, second ])
    end
  end

  describe "reindexação dos itens" do
    let!(:field) { create(:product_field_definition, organization: organization, name: "Cor") }

    it "reindexa quando o campo deixa de ser pesquisável" do
      expect { field.update!(searchable: false) }
        .to have_enqueued_job(Products::ReindexItemsJob).with(organization.id)
    end

    it "reindexa quando um campo pesquisável é excluído" do
      expect { field.destroy! }
        .to have_enqueued_job(Products::ReindexItemsJob).with(organization.id)
    end

    it "não reindexa ao excluir um campo que já não era pesquisável" do
      internal = create(:product_field_definition, organization: organization, name: "Interno", searchable: false)

      expect { internal.destroy! }.not_to have_enqueued_job(Products::ReindexItemsJob)
    end

    it "não reindexa em mudança que não afeta o texto" do
      expect { field.update!(name: "Cor Principal") }.not_to have_enqueued_job(Products::ReindexItemsJob)
    end
  end
end
