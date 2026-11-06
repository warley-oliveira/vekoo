require "rails_helper"

# O que não tem classe própria para testar, mas quebra em produção em silêncio se errar.
RSpec.describe "configuração do catálogo" do
  describe "locales" do
    def flat_keys(hash, prefix = nil)
      hash.flat_map do |key, value|
        full = [ prefix, key ].compact.join(".")
        value.is_a?(Hash) ? flat_keys(value, full) : [ full ]
      end
    end

    let(:pt_br) { YAML.load_file(Rails.root.join("config/locales/products.pt-BR.yml")).fetch("pt-BR") }
    let(:en) { YAML.load_file(Rails.root.join("config/locales/products.en.yml")).fetch("en") }

    it "as duas línguas têm as mesmas chaves" do
      expect(flat_keys(en)).to match_array(flat_keys(pt_br))
    end

    it "toda mensagem de erro de modelo tem tradução nas duas línguas" do
      {
        Products::Item => %i[url custom_fields tags],
        Products::Category => %i[name parent_id],
        Products::FieldDefinition => %i[name option_values],
        Products::Image => %i[file source_url]
      }.each do |model, attributes|
        attributes.each do |attribute|
          %i[pt-BR en].each do |locale|
            expect(I18n.t(attribute, scope: [ :activerecord, :attributes, model.model_name.i18n_key ], locale: locale, default: nil))
              .to be_present, "faltou #{model}##{attribute} em #{locale}"
          end
        end
      end
    end
  end

  describe "jobs recorrentes" do
    let(:schedule) { YAML.load_file(Rails.root.join("config/schedule/products.yml")) }

    it "apontam para jobs que existem, na fila low" do
      schedule.each_value do |entry|
        expect(entry["class"].constantize.ancestors).to include(ActiveJob::Base)
        expect(entry["queue"]).to eq("low")
        expect(entry["cron"]).to be_present
      end
    end
  end

  describe "rotas" do
    it "mantêm GET /catalog como o acervo da ferramenta" do
      expect(Rails.application.routes.recognize_path("/catalog", method: :get)).to include(controller: "catalog", action: "show")
    end

    it "moram em /products, em inglês e kebab-case" do
      routes = {
        [ "/products/search", :get ] => "products/items#search",
        [ "/products/items/bulk-destroy", :post ] => "products/items#bulk_destroy",
        [ "/products/items/1/images", :post ] => "products/images#create",
        [ "/products/images/1", :patch ] => "products/images#update",
        [ "/products/field-definitions", :get ] => "products/field_definitions#index",
        [ "/products/imports/1/start", :post ] => "products/imports#start"
      }

      routes.each do |(path, verb), target|
        recognized = Rails.application.routes.recognize_path(path, method: verb)
        expect("#{recognized[:controller]}##{recognized[:action]}").to eq(target)
      end
    end
  end

  describe "organização" do
    it "apagar a organização leva o catálogo inteiro" do
      organization = create(:organization)
      item = create(:product_item, organization: organization)
      create(:product_image, item: item)
      create(:product_embedding, item: item)
      category = create(:product_category, organization: organization)
      create(:product_category, organization: organization, parent: category)
      item.sync_categories([ category.id ])
      create(:product_field_definition, organization: organization)
      import = create(:product_import, organization: organization)
      Products::ImportRow.create!(import: import, line_number: 2, error_message: "x")

      organization.destroy!

      [ Products::Item, Products::Image, Products::Embedding, Products::Category, Products::ItemCategory,
       Products::FieldDefinition, Products::Import, Products::ImportRow ].each do |model|
        expect(model.count).to eq(0), "sobrou #{model}"
      end
    end

    # A semente geral apaga organizações com `delete_all`, sem callback: só a FK protege.
    it "as chaves estrangeiras apagam em cascata mesmo sem callback" do
      organization = create(:organization)
      item = create(:product_item, organization: organization)
      create(:product_image, item: item)
      create(:product_embedding, item: item)
      parent = create(:product_category, organization: organization)
      create(:product_category, organization: organization, parent: parent)
      item.sync_categories([ parent.id ])
      Products::ImportRow.create!(import: create(:product_import, organization: organization), line_number: 2, error_message: "x")

      Organization.where(id: organization.id).delete_all

      expect(Products::Item.count + Products::Image.count + Products::Embedding.count + Products::Category.count +
        Products::Import.count + Products::ImportRow.count).to eq(0)
    end
  end
end
