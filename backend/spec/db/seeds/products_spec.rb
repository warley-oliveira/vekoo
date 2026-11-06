require "rails_helper"

RSpec.describe "db/seeds/products.rb" do
  let(:seed_file) { Rails.root.join("db/seeds/products.rb") }
  let(:organization) { create(:organization) }

  def seed
    original = $stdout
    $stdout = StringIO.new
    load seed_file
  ensure
    $stdout = original
  end

  context "sem a conta de demonstração" do
    it "avisa e não grava nada" do
      expect { seed }.not_to change(Products::Item, :count)
    end
  end

  context "com a conta de demonstração" do
    before do
      create(:account, organization: organization, email: "marina.duarte@exemplo.com.br")
      seed
    end

    let(:items) { organization.product_items }

    it "traz um catálogo de loja, com itens inativos para o filtro" do
      expect(items.count).to eq(26)
      expect(items.where(active: false).count).to eq(2)
    end

    it "é conteúdo brasileiro de verdade" do
      expect(items.pluck(:title)).to include("Bolsa de Palha Tramada", "Caneca de Cerâmica Artesanal")
      expect(items.pluck(:title, :summary, :description).flatten.compact.join(" ")).not_to match(/lorem/i)
    end

    it "traz categorias em árvore, com o contador de itens em dia" do
      categories = organization.product_categories

      expect(categories.find_by!(path: "moda/feminino/vestidos").items_count).to eq(3)
      expect(categories.find_by!(path: "presentes").items_count).to eq(categories.find_by!(path: "presentes").items.count)
      expect(categories.pluck(:path)).to include("moda", "moda/feminino", "acessorios/lencos", "casa/decoracao")
    end

    it "traz os campos personalizados de todos os tipos, em ordem" do
      fields = organization.product_field_definitions.ordered

      expect(fields.map(&:key)).to start_with("preco", "preco_promocional", "cor")
      expect(fields.map(&:value_type).uniq).to match_array(Products::FieldDefinition::VALUE_TYPES)
    end

    it "grava os valores no tipo de cada campo" do
      vestido = items.find_by!(external_id: "DOM-VES-001")

      expect(vestido.custom_fields).to include("preco" => 289.9, "cor" => "Terracota", "em_estoque" => true, "lancamento" => "2026-09-15")
    end

    it "traz imagens por URL, sem baixar nada, de nenhuma a três por item" do
      images = Products::Image.where(item: items)

      expect(images).to be_present
      expect(images.all?(&:hosted?)).to be(false)
      expect(images.map(&:source_url)).to all(start_with("https://picsum.photos/"))
      expect(items.find_by!(external_id: "DOM-VES-001").images.count).to eq(3)
      expect(items.find_by!(title: "Vale-presente Doma Store").images.count).to eq(0)
      expect(a_request(:any, /.*/)).not_to have_been_made
    end

    it "deixa os itens achados pela busca, inclusive pela categoria" do
      with_openai_key(nil) do
        search = ->(query, **options) { Products::SearchService.new(organization.id, query: query, **options).call }

        expect(search.call("vestidos").items.map(&:external_id)).to include("DOM-VES-001")
        expect(search.call("decoracao").items.map(&:external_id)).to include("DOM-DEC-001")
        expect(search.call(nil, filters: { custom: { "preco" => { "max" => 60 } } }).total).to eq(3)
      end
    end

    it "é idempotente: rodar de novo não duplica nem muda nada" do
      snapshot = -> { [ items.order(:id).pluck(:id, :updated_at, :index_text_secondary), organization.product_categories.order(:id).pluck(:id, :items_count) ] }
      before_second_run = snapshot.call

      expect { seed }
        .to not_change(Products::Item, :count)
        .and not_change(Products::Category, :count)
        .and not_change(Products::FieldDefinition, :count)
        .and not_change(Products::Image, :count)
        .and not_change(Products::ItemCategory, :count)

      expect(snapshot.call).to eq(before_second_run)
    end

    it "não enfileira nada: semear não pode depender de Redis nem de OpenAI" do
      with_openai_key("sk-teste") do
        expect { seed }.not_to have_enqueued_job
      end
    end

    it "não mexe em outra organização" do
      foreign = create(:product_item, external_id: "DOM-VES-001", title: "Alheio")

      seed

      expect(foreign.reload.title).to eq("Alheio")
    end
  end
end
