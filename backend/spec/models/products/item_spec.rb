require "rails_helper"

RSpec.describe Products::Item do
  let(:organization) { create(:organization) }

  def build_item(**attributes)
    described_class.new({ organization: organization, title: "Cadeira" }.merge(attributes))
  end

  describe "validações" do
    it "exige título" do
      expect(build_item(title: "")).not_to be_valid
    end

    it "recusa título acima do limite" do
      expect(build_item(title: "a" * (described_class::TITLE_MAX_LENGTH + 1))).not_to be_valid
    end

    it "recusa resumo acima do limite" do
      expect(build_item(summary: "a" * (described_class::SUMMARY_MAX_LENGTH + 1))).not_to be_valid
    end

    it "recusa campos personalizados acima do teto em bytes" do
      item = build_item(custom_fields: { "blob" => "a" * described_class::MAX_CUSTOM_FIELDS_BYTES })

      expect(item).not_to be_valid
      expect(item.errors[:custom_fields]).to be_present
    end

    it "recusa mais tags que o teto" do
      expect(build_item(tags: Array.new(described_class::MAX_TAGS + 1) { |i| "t#{i}" })).not_to be_valid
    end

    it "recusa SKU repetido na mesma organização, mas não em outra" do
      create(:product_item, organization: organization, external_id: "SKU-1")

      expect(build_item(external_id: "SKU-1")).not_to be_valid
      expect(described_class.new(organization: create(:organization), title: "x", external_id: "SKU-1")).to be_valid
    end

    # O link vira `href` na tela: `javascript:` aqui seria XSS em quem abrir o item.
    it "só aceita link http(s)" do
      expect(build_item(url: "javascript:alert(1)")).not_to be_valid
      expect(build_item(url: "ftp://loja.com/x")).not_to be_valid
      expect(build_item(url: "https://loja.com/camisão azul")).not_to be_valid
      expect(build_item(url: "https://loja.com/camisao")).to be_valid
      expect(build_item(url: "")).to be_valid
    end
  end

  describe "normalização" do
    it "limpa, deduplica e descarta tags vazias" do
      item = create(:product_item, organization: organization, tags: [ " a ", "a", "", "b" ])

      expect(item.tags).to eq(%w[a b])
    end

    # String vazia colidiria no índice único; NULL não.
    it "anula SKU em branco para itens sem código nunca colidirem" do
      first = create(:product_item, organization: organization, external_id: "")
      second = create(:product_item, organization: organization, external_id: "")

      expect([ first.external_id, second.external_id ]).to eq([ nil, nil ])
    end

    # A tela mostra a chave automática como "sem código" e devolve vazio ao salvar. Sem
    # isto, a próxima reimportação não acharia o item e o duplicaria.
    it "mantém a chave automática quando o SKU volta em branco" do
      item = create(:product_item, organization: organization, external_id: "auto:abc123")

      item.update!(external_id: "", title: "Novo título")

      expect(item.reload.external_id).to eq("auto:abc123")
    end

    it "deixa trocar a chave automática por um SKU de verdade" do
      item = create(:product_item, organization: organization, external_id: "auto:abc123")

      item.update!(external_id: "SKU-9")

      expect(item.reload.external_id).to eq("SKU-9")
    end

    it "um SKU de verdade pode ser apagado" do
      item = create(:product_item, organization: organization, external_id: "SKU-9")

      item.update!(external_id: "")

      expect(item.reload.external_id).to be_nil
    end
  end

  describe "campos personalizados" do
    before do
      create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")
      create(:product_field_definition, organization: organization, name: "Garantia", value_type: "checkbox")
    end

    # O formulário manda texto, a importação manda número. O filtro precisa ver um tipo só.
    it "grava no formato do campo, como a importação" do
      item = create(:product_item, organization: organization, custom_fields: { "preco" => "1.234,50", "garantia" => "true" })

      expect(item.reload.custom_fields).to eq("preco" => 1234.5, "garantia" => true)
    end

    it "descarta valor vazio em vez de guardar chave inútil" do
      item = create(:product_item, organization: organization, custom_fields: { "preco" => "" })

      expect(item.reload.custom_fields).to eq({})
    end

    it "recusa valor que não é do tipo do campo, nomeando o campo" do
      item = build_item(custom_fields: { "preco" => "caro" })

      expect(item).not_to be_valid
      expect(item.errors[:custom_fields].join).to include("Preço")
    end

    # Excluir o campo não apaga os valores já preenchidos nos itens.
    it "preserva chave sem definição" do
      item = create(:product_item, organization: organization, custom_fields: { "campo_antigo" => "valor" })

      expect(item.reload.custom_fields).to eq("campo_antigo" => "valor")
    end
  end

  describe "texto de índice" do
    it "monta as colunas normalizadas ao salvar" do
      item = create(:product_item, organization: organization, title: "Cadeira Gamer Pró",
        summary: "Conforto máximo", external_id: "SKU-1", tags: [ "promoção" ])

      expect(item.index_text_primary).to eq("cadeira gamer pro sku-1 promocao")
      expect(item.index_text_secondary).to include("conforto maximo")
    end

    it "mantém a coluna gerada em dia, sem callback" do
      item = create(:product_item, organization: organization, title: "Cadeira")

      expect(described_class.where("search_document @@ to_tsquery('portuguese', 'cadeira')")).to include(item)
    end
  end

  describe "#refresh_index_text!" do
    it "reescreve o índice com o estado atual do banco, sem tocar em updated_at" do
      item = create(:product_item, organization: organization, title: "Cadeira")
      category = create(:product_category, organization: organization, name: "Móveis de Escritório")
      item.sync_categories([ category.id ])

      expect { item.refresh_index_text! }.not_to(change { item.reload.updated_at })
      expect(item.index_text_secondary).to include("moveis-de-escritorio")
    end
  end

  describe "#sync_categories" do
    let(:item) { create(:product_item, organization: organization) }
    let(:keep) { create(:product_category, organization: organization) }
    let(:drop) { create(:product_category, organization: organization) }

    it "acrescenta e remove mantendo o contador de cada categoria" do
      item.sync_categories([ keep.id, drop.id ])
      expect([ keep.reload.items_count, drop.reload.items_count ]).to eq([ 1, 1 ])

      item.sync_categories([ keep.id ])
      expect(item.reload.categories).to contain_exactly(keep)
      expect([ keep.reload.items_count, drop.reload.items_count ]).to eq([ 1, 0 ])
    end

    it "ignora categoria de outra organização e id inválido" do
      foreign = create(:product_category)

      item.sync_categories([ foreign.id, "nao-e-uuid" ])

      expect(item.reload.categories).to be_empty
      expect(foreign.reload.items_count).to eq(0)
    end
  end

  describe "atalhos de leitura" do
    let(:item) { create(:product_item, organization: organization, tags: %w[promo], custom_fields: { "cor" => "Azul" }) }

    it "#primary_image é a primeira na ordem das posições" do
      create(:product_image, item: item, position: 2)
      cover = create(:product_image, item: item, position: 1)

      expect(item.reload.primary_image).to eq(cover)
    end

    it "#custom_field lê pela chave, em texto ou símbolo" do
      expect(item.custom_field("cor")).to eq("Azul")
      expect(item.custom_field(:cor)).to eq("Azul")
      expect(item.custom_field("nada")).to be_nil
    end

    it ".active_only deixa os inativos de fora" do
      inactive = create(:product_item, organization: organization, active: false)

      expect(described_class.active_only).to include(item)
      expect(described_class.active_only).not_to include(inactive)
    end

    it ".by_tag filtra pela tag, e sem tag não filtra" do
      other = create(:product_item, organization: organization)

      expect(described_class.by_tag("promo")).to contain_exactly(item)
      expect(described_class.by_tag(nil)).to include(item, other)
    end
  end

  describe ".listable" do
    it "deixa de fora as colunas pesadas de índice" do
      create(:product_item, organization: organization)

      attributes = described_class.for_organization(organization.id).listable.first.attributes

      expect(attributes.keys).not_to include(*described_class::INDEX_COLUMNS)
    end
  end

  describe ".matching_text" do
    let!(:shirt) { create(:product_item, organization: organization, title: "Camiseta Básica", summary: "Algodão penteado") }
    let!(:dress) { create(:product_item, organization: organization, title: "Vestido Midi") }

    def matching(query) = described_class.for_organization(organization.id).matching_text(query)

    it "casa por pedaço de palavra, sem acento nem caixa" do
      expect(matching("CAMIS")).to contain_exactly(shirt)
      expect(matching("algodao")).to contain_exactly(shirt)
    end

    it "exige todos os termos" do
      expect(matching("camiseta penteado")).to contain_exactly(shirt)
      expect(matching("camiseta midi")).to be_empty
    end

    it "trata % e _ como texto, não como curinga" do
      expect(matching("%")).to be_empty
      expect(matching("_")).to be_empty
    end

    it "sem termo não filtra" do
      expect(matching("   ")).to contain_exactly(shirt, dress)
    end
  end

  describe "ao apagar" do
    it "leva vetor, imagens e vínculos junto, devolvendo o contador da categoria" do
      item = create(:product_item, organization: organization)
      category = create(:product_category, organization: organization)
      item.sync_categories([ category.id ])
      create(:product_image, item: item)
      create(:product_embedding, item: item)

      expect { item.destroy! }
        .to change(Products::Image, :count).by(-1)
        .and change(Products::Embedding, :count).by(-1)
        .and change(Products::ItemCategory, :count).by(-1)
      expect(category.reload.items_count).to eq(0)
    end
  end
end
