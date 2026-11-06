# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::Catalog do
  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }

  let!(:item) do
    create(:product_item, organization: organization, title: "Cadeira Gamer", external_id: "SKU-9", tags: %w[gamer],
                          custom_fields: { "cor" => "preta" })
  end

  def run(code, org: organization)
    run_script(code, organization: org)
  end

  describe "catalog.Search" do
    it "returns matching items" do
      result = run('return catalog.Search("cadeira", { limit: 3 });')

      expect(result["data"].map { |i| i["title"] }).to eq([ "Cadeira Gamer" ])
      expect(result).to include("total" => 1, "ok" => true)
      expect(result["strategy"]).to be_present
    end

    it "traz o item com os campos combinados" do
      data = run('return catalog.Search("cadeira");')["data"].first

      expect(data).to include("id" => item.id, "sku" => "SKU-9", "title" => "Cadeira Gamer", "tags" => %w[gamer], "fields" => { "cor" => "preta" })
      expect(data).not_to have_key("description")
    end

    it "exposes an external image as its own URL" do
      create(:product_image, item: item, source_url: "https://ex.com/a.png")

      expect(run('return catalog.Search("cadeira");')["data"].first["image"]).to eq("https://ex.com/a.png")
    end

    it "exposes a hosted image as an absolute URL with the extension" do
      image = build(:product_image, item: item, source_url: nil)
      image.file.attach(io: file_fixture("foto.png").open, filename: "product-1.png", content_type: "image/png")
      image.save!

      url = run('return catalog.Search("cadeira");')["data"].first["image"]

      expect(url).to match(%r{\Ahttps?://.*/product-1\.png\z})
    end

    it "lista todas as imagens em ordem" do
      create(:product_image, item: item, source_url: "https://ex.com/b.png", position: 1)
      create(:product_image, item: item, source_url: "https://ex.com/a.png", position: 0)

      expect(run('return catalog.Search("cadeira");')["data"].first["images"]).to eq(%w[https://ex.com/a.png https://ex.com/b.png])
    end

    it "filtra por tag, categoria e campo" do
      category = create(:product_category, organization: organization, name: "Moda")
      item.sync_categories([ category.id ])
      create(:product_item, organization: organization, title: "Mesa", tags: %w[escritorio])

      expect(run('return catalog.Search("", { tags: ["gamer"] }).data.map(i => i.title);')).to eq([ "Cadeira Gamer" ])
      expect(run('return catalog.Search("", { categories: ["moda"] }).data.map(i => i.title);')).to eq([ "Cadeira Gamer" ])
      expect(run('return catalog.Search("", { custom: { cor: "preta" } }).data.map(i => i.title);')).to eq([ "Cadeira Gamer" ])
    end

    it "esconde inativos por padrão, e mostra se pedir" do
      create(:product_item, organization: organization, title: "Cadeira antiga", active: false)

      expect(run('return catalog.Search("").total;')).to eq(1)
      expect(run('return catalog.Search("", { includeInactive: true }).total;')).to eq(2)
    end

    it "aplica o teto de itens" do
      25.times { |i| create(:product_item, organization: organization, title: "Item #{i}") }

      expect(run('return catalog.Search("").data.length;')).to eq(described_class::DEFAULT_LIMIT)
      expect(run('return catalog.Search("", { limit: 500 }).data.length;')).to eq(described_class::MAX_LIMIT)
    end

    it "opção que não é objeto não derruba" do
      expect(run('return catalog.Search("cadeira", "x").ok;')).to be(true)
    end
  end

  describe "catalog.Get" do
    it "finds an item by SKU" do
      expect(run('return catalog.Get("SKU-9");').dig("data", "title")).to eq("Cadeira Gamer")
    end

    it "finds an item by id" do
      expect(run("return catalog.Get('#{item.id}');").dig("data", "title")).to eq("Cadeira Gamer")
    end

    it "traz descrição e categorias, que a busca não traz" do
      item.update!(description: "Confortável")
      item.sync_categories([ create(:product_category, organization: organization, name: "Moda").id ])

      expect(run('return catalog.Get("SKU-9");')["data"]).to include("description" => "Confortável", "categories" => [ "moda" ])
    end

    it "returns an error for an unknown reference" do
      expect(run('return catalog.Get("nope");')).to include("ok" => false, "error" => "Item not found")
    end

    it "returns an error without a reference" do
      expect(run("return catalog.Get();")).to include("ok" => false)
    end

    it "não mostra a chave automática da importação como SKU" do
      create(:product_item, organization: organization, title: "Sem código", external_id: "auto:abc")

      expect(run('return catalog.Get("auto:abc");').dig("data", "sku")).to be_nil
    end
  end

  describe "catalog.Categories" do
    it "returns the taxonomy with item counts" do
      category = create(:product_category, organization: organization, name: "Cadeiras")
      item.sync_categories([ category.id ])

      expect(run("return catalog.Categories();")["data"]).to eq(
        [ { "path" => "cadeiras", "name" => "Cadeiras", "items" => 1 } ]
      )
    end
  end

  describe "catalog.Facets" do
    it "returns tag values with counts" do
      expect(run('return catalog.Facets("tags");')["data"]).to eq([ { "value" => "gamer", "count" => 1 } ])
    end

    it "returns custom field values" do
      expect(run('return catalog.Facets("cor");')["data"]).to eq([ { "value" => "preta", "count" => 1 } ])
    end

    it "exige o campo" do
      expect(run("return catalog.Facets();")).to include("ok" => false, "error" => "Missing field")
    end
  end

  describe "catalog.Similar" do
    it "traz os vizinhos por embedding, do mais perto para o mais longe" do
      near = create(:product_item, organization: organization, title: "Cadeira parecida")
      far = create(:product_item, organization: organization, title: "Cadeira diferente")
      create(:product_embedding, item: item, vector: embedding_vector(0))
      create(:product_embedding, item: far, vector: embedding_vector(5))
      create(:product_embedding, item: near, vector: embedding_vector(0).tap { |v| v[1] = 0.2 })

      expect(run('return catalog.Similar("SKU-9").data.map(i => i.title);')).to eq([ "Cadeira parecida", "Cadeira diferente" ])
    end

    it "sem vetor não há vizinhos, e isso não é erro" do
      expect(run('return catalog.Similar("SKU-9");')).to eq("data" => [], "ok" => true)
    end

    it "referência desconhecida é erro" do
      expect(run('return catalog.Similar("nope");')).to include("ok" => false, "error" => "Item not found")
    end
  end

  # Um id ou SKU de outra organização não pode funcionar.
  describe "isolamento entre organizações" do
    let!(:foreign) do
      create(:product_item, organization: other_organization, title: "Cadeira de fora", external_id: "SKU-FORA", tags: %w[segredo],
                            custom_fields: { "cor" => "dourada" })
    end

    it "a busca não acha" do
      expect(run('return catalog.Search("cadeira de fora").data.map(i => i.title);')).not_to include("Cadeira de fora")
      expect(run('return catalog.Search("SKU-FORA").data;')).to be_empty
    end

    it "catalog.Get não acha por SKU nem por id" do
      expect(run('return catalog.Get("SKU-FORA");')).to include("ok" => false)
      expect(run("return catalog.Get('#{foreign.id}');")).to include("ok" => false)
    end

    it "as categorias e facetas são só da organização" do
      create(:product_category, organization: other_organization, name: "Segredos")

      expect(run("return catalog.Categories();")["data"]).to be_empty
      expect(run('return catalog.Facets("tags");')["data"].map { |row| row["value"] }).not_to include("segredo")
      expect(run('return catalog.Facets("cor");')["data"].map { |row| row["value"] }).not_to include("dourada")
    end

    it "catalog.Similar não traz vizinho de fora, nem parte de item de fora" do
      create(:product_embedding, item: item, vector: embedding_vector(0))
      create(:product_embedding, item: foreign, vector: embedding_vector(0))

      expect(run('return catalog.Similar("SKU-9");')["data"]).to be_empty
      expect(run("return catalog.Similar('#{foreign.id}');")).to include("ok" => false)
    end
  end

  # Um script rodando sem organização não pode ler o catálogo de todas.
  describe "without an organization in context" do
    %w[Search Get Categories Facets Similar].each do |name|
      it "fails closed on catalog.#{name}" do
        expect(run_script("return catalog.#{name}('x', {});")).to include("ok" => false, "error" => "No organization in context")
      end
    end
  end

  it "é somente leitura: não há como escrever" do
    methods = run("return Object.keys(catalog);")

    expect(methods).to match_array(%w[Search Get Categories Facets Similar])
  end
end
