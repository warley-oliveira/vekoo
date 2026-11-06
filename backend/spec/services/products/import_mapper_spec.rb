require "rails_helper"

RSpec.describe Products::ImportMapper do
  let(:organization) { create(:organization) }

  def row(hash) = CSV::Row.new(hash.keys, hash.values)

  def map(hash, mapping = hash.keys.index_with(&:itself))
    described_class.new(organization.id, mapping).call(row(hash))
  end

  describe "#call" do
    it "leva cada coluna ao campo nativo escolhido, ignorando as demais" do
      result = map(
        { "sku" => "A1", "nome" => "Camiseta", "resumo" => "Algodão", "ignorada" => "x" },
        { "sku" => "external_id", "nome" => "title", "resumo" => "summary", "ignorada" => "" }
      )

      expect(result).to be_valid
      expect(result.attributes).to include("external_id" => "A1", "title" => "Camiseta", "summary" => "Algodão")
      expect(result.attributes["organization_id"]).to eq(organization.id)
      expect(result.attributes.keys).not_to include("ignorada")
    end

    it "linha sem título não é válida" do
      result = map({ "title" => "  " })

      expect(result).not_to be_valid
      expect(result.errors).to eq([ "título vazio" ])
    end

    it "fala no idioma de quem começou a importação" do
      I18n.with_locale(:en) { expect(map({ "title" => "" }).errors).to eq([ "empty title" ]) }
    end

    it "corta título e resumo no limite" do
      result = map({ "title" => "a" * 400, "summary" => "b" * 2000 })

      expect(result.attributes["title"].length).to eq(Products::Item::TITLE_MAX_LENGTH)
      expect(result.attributes["summary"].length).to eq(Products::Item::SUMMARY_MAX_LENGTH)
    end

    it "separa múltiplos valores por | ou ;" do
      result = map({ "title" => "x", "tags" => "promo | verão;promo", "categories" => "Moda;Casa" })

      expect(result.tags).to eq(%w[promo verão])
      expect(result.categories).to eq(%w[Moda Casa])
    end

    it "corta as tags no teto" do
      many = Array.new(Products::Item::MAX_TAGS + 5) { |i| "t#{i}" }.join("|")

      expect(map({ "title" => "x", "tags" => many }).tags.size).to eq(Products::Item::MAX_TAGS)
    end

    describe "disponível" do
      it "é verdadeiro quando a coluna não vem" do
        expect(map({ "title" => "x" }).attributes["active"]).to be(true)
      end

      # A origem usava só `ActiveModel::Type::Boolean`, e "Não" virava ativo.
      it "entende o português da planilha" do
        expect(map({ "title" => "x", "active" => "Não" }).attributes["active"]).to be(false)
        expect(map({ "title" => "x", "active" => "inativo" }).attributes["active"]).to be(false)
        expect(map({ "title" => "x", "active" => "false" }).attributes["active"]).to be(false)
        expect(map({ "title" => "x", "active" => "Sim" }).attributes["active"]).to be(true)
        expect(map({ "title" => "x", "active" => "" }).attributes["active"]).to be(true)
      end
    end

    describe "endereços" do
      # Vira `href` na tela: `javascript:` aqui seria XSS em quem abrir o item.
      it "descarta link que não é http(s), sem perder a linha" do
        result = map({ "title" => "x", "url" => "javascript:alert(1)" })

        expect(result).to be_valid
        expect(result.attributes["url"]).to be_nil
        expect(map({ "title" => "x", "url" => "https://loja.com/a" }).attributes["url"]).to eq("https://loja.com/a")
      end

      it "só aproveita imagem com endereço http(s)" do
        result = map({ "title" => "x", "images" => "https://ex.com/a.png|foto.jpg|javascript:x" })

        expect(result.images).to eq([ "https://ex.com/a.png" ])
      end
    end

    describe "campos personalizados" do
      before do
        create(:product_field_definition, organization: organization, name: "Cor")
        create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")
      end

      it "converte para o tipo do campo" do
        result = map(
          { "nome" => "x", "cor" => "Azul", "preco" => "R$ 1.234,50" },
          { "nome" => "title", "cor" => "custom:cor", "preco" => "custom:preco" }
        )

        expect(result.attributes["custom_fields"]).to eq("cor" => "Azul", "preco" => 1234.5)
      end

      it "valor que não dá para converter é ignorado, sem perder a linha" do
        result = map({ "nome" => "x", "preco" => "sob consulta" }, { "nome" => "title", "preco" => "custom:preco" })

        expect(result).to be_valid
        expect(result.attributes["custom_fields"]).to eq({})
      end

      it "campo desconhecido é erro da linha, nomeando a chave" do
        result = map({ "nome" => "x", "z" => "1" }, { "nome" => "title", "z" => "custom:zzz" })

        expect(result).not_to be_valid
        expect(result.errors.first).to include("zzz")
      end

      it "não enxerga campo de outra organização" do
        create(:product_field_definition, name: "Material")

        result = map({ "nome" => "x", "m" => "Couro" }, { "nome" => "title", "m" => "custom:material" })

        expect(result).not_to be_valid
      end

      # O importador escreve com SQL cru, e o teto do modelo não passa por ali.
      it "recusa a linha acima do teto do jsonb" do
        result = map(
          { "nome" => "x", "cor" => "a" * Products::Item::MAX_CUSTOM_FIELDS_BYTES },
          { "nome" => "title", "cor" => "custom:cor" }
        )

        expect(result).not_to be_valid
      end
    end
  end

  describe "#maps_active?" do
    it "diz se a planilha traz a coluna de disponibilidade" do
      expect(described_class.new(organization.id, { "a" => "active" }).maps_active?).to be(true)
      expect(described_class.new(organization.id, { "a" => "title" }).maps_active?).to be(false)
    end
  end

  describe ".suggest" do
    it "sugere pelo cabeçalho, sem acento nem caixa" do
      expect(described_class.suggest([ "SKU", "Nome do Produto", "Descrição", "Categoria", "Etiquetas", "Fotos", "Link", "Ativo" ]))
        .to eq(
          "SKU" => "external_id",
          "Nome do Produto" => "title",
          "Descrição" => "description",
          "Categoria" => "categories",
          "Etiquetas" => "tags",
          "Fotos" => "images",
          "Link" => "url",
          "Ativo" => "active"
        )
    end

    it "usa cada alvo uma vez só" do
      expect(described_class.suggest([ "Nome", "Nome fantasia" ])).to eq("Nome" => "title")
    end

    it "não sugere nada para coluna que não reconhece" do
      expect(described_class.suggest([ "Preço", "Cor" ])).to eq({})
    end
  end

  describe ".targets" do
    it "oferece os campos nativos e os da organização, e só dela" do
      create(:product_field_definition, organization: organization, name: "Cor", value_type: "list", option_values: %w[Azul])
      create(:product_field_definition, name: "Alheio")

      targets = described_class.targets(organization.id)

      expect(targets.first).to eq(value: "title", label: "Título", kind: "native")
      expect(targets.map { |target| target[:value] }).to include("external_id", "categories", "tags", "images", "custom:cor")
      expect(targets.last).to eq(value: "custom:cor", label: "Cor", kind: "custom", valueType: "list")
      expect(targets.map { |target| target[:label] }).not_to include("Alheio")
    end

    it "traduz os rótulos" do
      I18n.with_locale(:en) do
        expect(described_class.targets(organization.id).first[:label]).to eq("Title")
      end
    end
  end
end
