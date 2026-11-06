require "rails_helper"

RSpec.describe Products::Category do
  let(:organization) { create(:organization) }

  def category(name, parent: nil)
    create(:product_category, organization: organization, name: name, parent: parent)
  end

  describe "caminho" do
    it "monta slug e caminho a partir do pai" do
      moda = category("Moda")
      vestidos = category("Vestidos de Festa", parent: moda)

      expect(vestidos.slug).to eq("vestidos-de-festa")
      expect(vestidos.path).to eq("moda/vestidos-de-festa")
      expect(vestidos.depth).to eq(1)
    end

    it "ao renomear, atualiza a subárvore inteira" do
      moda = category("Moda")
      feminino = category("Feminino", parent: moda)
      vestidos = category("Vestidos", parent: feminino)

      moda.update!(name: "Roupas")

      expect(feminino.reload.path).to eq("roupas/feminino")
      expect(vestidos.reload.path).to eq("roupas/feminino/vestidos")
    end

    it "ao mover, atualiza a subárvore inteira" do
      moda = category("Moda")
      casa = category("Casa")
      feminino = category("Feminino", parent: moda)
      vestidos = category("Vestidos", parent: feminino)

      feminino.update!(parent: casa)

      expect(vestidos.reload.path).to eq("casa/feminino/vestidos")
    end

    it "não confunde vizinho de prefixo parecido ao renomear" do
      moda = category("Moda")
      praia = category("Moda Praia")
      child = category("Biquínis", parent: praia)

      moda.update!(name: "Roupas")

      expect(praia.reload.path).to eq("moda-praia")
      expect(child.reload.path).to eq("moda-praia/biquinis")
    end
  end

  describe "validações" do
    it "acusa nome repetido no mesmo nível, no campo de nome" do
      category("Moda")
      duplicate = build(:product_category, organization: organization, name: "moda")

      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:name]).to be_present
    end

    it "permite o mesmo nome em níveis e organizações diferentes" do
      moda = category("Moda")

      expect(build(:product_category, organization: organization, name: "Moda", parent: moda)).to be_valid
      expect(build(:product_category, name: "Moda")).to be_valid
    end

    it "recusa nome sem nenhuma letra ou número" do
      invalid = build(:product_category, organization: organization, name: "!!!")

      expect(invalid).not_to be_valid
      expect(invalid.errors[:name]).to be_present
    end

    it "recusa pai de outra organização" do
      foreign = create(:product_category)
      invalid = build(:product_category, organization: organization, parent: foreign)

      expect(invalid).not_to be_valid
      expect(invalid.errors[:parent_id]).to be_present
    end

    it "recusa pai que não existe" do
      invalid = build(:product_category, organization: organization, parent_id: SecureRandom.uuid)

      expect(invalid).not_to be_valid
      expect(invalid.errors[:parent_id]).to be_present
    end

    it "recusa virar filha de si mesma" do
      moda = category("Moda")

      expect(moda.update(parent_id: moda.id)).to be(false)
      expect(moda.errors[:parent_id]).to be_present
    end

    it "recusa virar filha de um descendente" do
      moda = category("Moda")
      feminino = category("Feminino", parent: moda)

      expect(moda.reload.update(parent_id: feminino.id)).to be(false)
      expect(moda.errors[:parent_id]).to be_present
    end

    it "recusa posição que não cabe na coluna, em vez de estourar no banco" do
      invalid = build(:product_category, organization: organization, position: 99_999_999_999)

      expect(invalid).not_to be_valid
      expect(invalid.errors[:position]).to be_present
    end

    it "recusa passar do limite de profundidade" do
      parent = category("Nível 0")
      (1...described_class::MAX_DEPTH).each { |level| parent = category("Nível #{level}", parent: parent) }

      too_deep = build(:product_category, organization: organization, name: "Fundo demais", parent: parent)

      expect(too_deep).not_to be_valid
      expect(too_deep.errors[:parent_id]).to be_present
    end
  end

  describe ".roots" do
    it "traz só quem não tem pai" do
      moda = category("Moda")
      category("Camisetas", parent: moda)

      expect(described_class.for_organization(organization.id).roots).to contain_exactly(moda)
    end
  end

  describe ".under" do
    it "inclui o próprio ramo e não o vizinho de prefixo parecido" do
      moda = category("Moda")
      feminino = category("Feminino", parent: moda)
      praia = category("Moda Praia")

      expect(described_class.for_organization(organization.id).under("moda")).to contain_exactly(moda, feminino)
      expect(described_class.for_organization(organization.id).under("moda")).not_to include(praia)
    end
  end

  describe ".in_tree_order" do
    # Ordenar por `path` no banco poria "moda-praia" entre "moda" e "moda/camisetas".
    it "põe cada filho logo depois do pai" do
      moda = category("Moda")
      praia = category("Moda Praia")
      camisetas = category("Camisetas", parent: moda)
      casa = category("Casa")

      ordered = described_class.in_tree_order(described_class.for_organization(organization.id))

      expect(ordered).to eq([ casa, moda, camisetas, praia ])
    end

    it "entre irmãos, respeita a posição, em todos os níveis" do
      moda = create(:product_category, organization: organization, name: "Moda", position: 0)
      casa = create(:product_category, organization: organization, name: "Casa", position: 1)
      vestidos = create(:product_category, organization: organization, name: "Vestidos", parent: moda, position: 0)
      blusas = create(:product_category, organization: organization, name: "Blusas", parent: moda, position: 1)

      ordered = described_class.in_tree_order(described_class.for_organization(organization.id))

      expect(ordered).to eq([ moda, vestidos, blusas, casa ])
    end
  end

  describe "#display_path" do
    it "lê a árvore em forma de gente" do
      moda = category("Moda")
      vestidos = category("Vestidos", parent: moda)

      expect(vestidos.display_path).to eq("Moda > Vestidos")
    end
  end

  describe ".refresh_items_count!" do
    it "recalcula o contador pelos vínculos que existem" do
      moda = category("Moda")
      item = create(:product_item, organization: organization)
      now = Time.current
      Products::ItemCategory.insert_all([
        { product_item_id: item.id, product_category_id: moda.id, created_at: now, updated_at: now }
      ])
      expect(moda.reload.items_count).to eq(0)

      described_class.refresh_items_count!([ moda.id ])

      expect(moda.reload.items_count).to eq(1)
    end
  end

  describe "ao apagar" do
    it "leva a subárvore e os vínculos, mas os itens continuam existindo" do
      moda = category("Moda")
      feminino = category("Feminino", parent: moda)
      item = create(:product_item, organization: organization)
      item.sync_categories([ feminino.id ])

      expect { moda.destroy! }
        .to change(described_class, :count).by(-2)
        .and change(Products::ItemCategory, :count).by(-1)
      expect(Products::Item.exists?(item.id)).to be(true)
    end
  end

  describe "reindexação dos itens" do
    let(:moda) { category("Moda") }
    let(:feminino) { category("Feminino", parent: moda) }
    let(:item) { create(:product_item, organization: organization) }

    before { item.sync_categories([ feminino.id ]) }

    # O caminho entra no texto indexado: sem isto o item seria achado pelo nome antigo.
    it "reindexa os itens da subárvore quando o caminho muda" do
      expect { moda.update!(name: "Roupas") }
        .to have_enqueued_job(Products::ReindexItemsJob).with(organization.id, [ item.id ])
    end

    it "não reindexa quando o caminho não muda" do
      expect { moda.update!(position: 3) }.not_to have_enqueued_job(Products::ReindexItemsJob)
    end

    it "reindexa os itens que perderam a categoria apagada" do
      expect { moda.destroy! }
        .to have_enqueued_job(Products::ReindexItemsJob).with(organization.id, [ item.id ])
    end
  end
end
