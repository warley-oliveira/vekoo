require "rails_helper"

RSpec.describe Products::ItemUpserter do
  let(:organization) { create(:organization) }

  def row(external_id:, title: "Camiseta", categories: [], tags: [], images: [], **attributes)
    Products::ImportMapper::Row.new(
      attributes: {
        "organization_id" => organization.id, "active" => true, "external_id" => external_id,
        "title" => title, "custom_fields" => {}
      }.merge(attributes.stringify_keys),
      categories: categories, tags: tags, images: images, errors: []
    )
  end

  def upsert(rows, **options) = described_class.new(organization.id, rows, **options).call

  def item(external_id) = Products::Item.find_by!(organization: organization, external_id: external_id)

  it "cria os itens, separando criados de atualizados" do
    first = upsert([ row(external_id: "A1"), row(external_id: "A2") ])
    expect([ first.created, first.updated ]).to eq([ 2, 0 ])

    second = upsert([ row(external_id: "A1"), row(external_id: "A3") ])
    expect([ second.created, second.updated ]).to eq([ 1, 1 ])
    expect(second.updated_ids).to eq([ item("A1").id ])
    expect(second.created_ids).to eq([ item("A3").id ])
    expect(second.ids).to contain_exactly(item("A1").id, item("A3").id)
  end

  it "não colide com o mesmo SKU de outra organização" do
    foreign = create(:product_item, external_id: "A1", title: "Alheio")

    expect(upsert([ row(external_id: "A1") ]).created).to eq(1)
    expect(foreign.reload.title).to eq("Alheio")
  end

  it "monta o índice de busca, inclusive a coluna gerada" do
    create(:product_field_definition, organization: organization, name: "Cor")

    upsert([ row(external_id: "A1", title: "Cadeira Pró", categories: [ "Móveis" ], tags: [ "promoção" ],
      summary: "Conforto", custom_fields: { "cor" => "Azul" }) ])

    expect(item("A1").index_text_primary).to eq("cadeira pro a1 promocao")
    expect(item("A1").index_text_secondary).to eq("conforto moveis azul")
    expect(Products::Item.where("search_document @@ to_tsquery('portuguese', 'moveis')")).to include(item("A1"))
  end

  describe "reimportação parcial" do
    before do
      upsert([ row(external_id: "A1", title: "Antiga", summary: "Resumo", description: "Descrição", url: "https://a.com",
        tags: %w[velha], custom_fields: { "cor" => "Azul", "preco" => 10 }) ])
    end

    it "não zera o que a planilha não trouxe" do
      upsert([ row(external_id: "A1", title: "Nova") ])

      expect(item("A1")).to have_attributes(title: "Nova", summary: "Resumo", description: "Descrição", url: "https://a.com", tags: %w[velha])
    end

    it "faz merge raso nos campos personalizados" do
      upsert([ row(external_id: "A1", custom_fields: { "preco" => 20 }) ])

      expect(item("A1").custom_fields).to eq("cor" => "Azul", "preco" => 20)
    end

    it "troca as tags quando vêm" do
      upsert([ row(external_id: "A1", tags: %w[nova]) ])

      expect(item("A1").tags).to eq(%w[nova])
    end
  end

  describe "disponibilidade" do
    before { upsert([ row(external_id: "A1", active: false) ]) }

    it "sobrescreve por padrão" do
      upsert([ row(external_id: "A1", active: true) ])

      expect(item("A1").active).to be(true)
    end

    # Reimportar uma tabela de preços não pode reativar o que a pessoa desativou à mão.
    it "preserva o valor quando a planilha não tem a coluna" do
      upsert([ row(external_id: "A1", active: true) ], overwrite_active: false)

      expect(item("A1").active).to be(false)
    end
  end

  describe "categorias" do
    it "cria só as que faltam e reaproveita as existentes" do
      existing = create(:product_category, organization: organization, name: "Moda")

      expect { upsert([ row(external_id: "A1", categories: %w[Moda Casa]) ]) }
        .to change(Products::Category, :count).by(1)

      expect(item("A1").categories.map(&:name)).to contain_exactly("Moda", "Casa")
      expect(item("A1").categories).to include(existing)
    end

    # O `upsert_all` não passa pelo counter_cache: a tela mostraria zero, e apagar um
    # item importado levaria o contador a negativo.
    it "mantém o contador de itens em dia, e apagar um item não o deixa negativo" do
      upsert([ row(external_id: "A1", categories: %w[Moda]), row(external_id: "A2", categories: %w[Moda]) ])
      moda = Products::Category.find_by!(organization: organization, name: "Moda")
      expect(moda.items_count).to eq(2)

      item("A1").destroy!

      expect(moda.reload.items_count).to eq(1)
    end

    it "reimportar não duplica o vínculo nem infla o contador" do
      2.times { upsert([ row(external_id: "A1", categories: %w[Moda]) ]) }

      expect(item("A1").categories.count).to eq(1)
      expect(Products::Category.find_by!(organization: organization, name: "Moda").items_count).to eq(1)
    end

    # O caminho colide ("camisetas"), mas o nome não: a busca por nome não acha.
    it "acha a categoria existente com outra caixa, em vez de perder o vínculo" do
      existing = create(:product_category, organization: organization, name: "Camisetas")

      expect { upsert([ row(external_id: "A1", categories: %w[camisetas]) ]) }
        .not_to change(Products::Category, :count)

      expect(item("A1").categories).to contain_exactly(existing)
    end

    it "não enxerga categoria de outra organização" do
      create(:product_category, name: "Moda")

      expect { upsert([ row(external_id: "A1", categories: %w[Moda]) ]) }
        .to change { Products::Category.where(organization: organization).count }.by(1)
    end
  end

  describe "imagens" do
    it "grava só a URL, sem baixar nada" do
      upsert([ row(external_id: "A1", images: %w[https://ex.com/a.png https://ex.com/b.png]) ])

      expect(item("A1").images.map(&:source_url)).to eq(%w[https://ex.com/a.png https://ex.com/b.png])
      expect(item("A1").images.map(&:position)).to eq([ 0, 1 ])
      expect(a_request(:any, /ex\.com/)).not_to have_been_made
    end

    it "reimportar não duplica a mesma imagem" do
      2.times { upsert([ row(external_id: "A1", images: %w[https://ex.com/a.png]) ]) }

      expect(item("A1").images.count).to eq(1)
    end
  end

  it "guarda aspas e barra invertida nas tags sem quebrar o array do Postgres" do
    tags = [ 'aspas " dentro', 'barra \\ dentro', "vírgula, dentro" ]

    upsert([ row(external_id: "A1", tags: tags) ])

    expect(item("A1").tags).to eq(tags)
  end

  it "guarda aspas simples e texto com jeito de SQL sem interpretá-los" do
    title = "Camiseta d'água'); DROP TABLE product_items; --"

    upsert([ row(external_id: "A1", title: title) ])

    expect(item("A1").title).to eq(title)
  end

  it "lote vazio não vai ao banco" do
    result = upsert([])

    expect(result.ids).to eq([])
    expect(result.created).to eq(0)
  end
end
