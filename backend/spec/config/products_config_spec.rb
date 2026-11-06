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

    # O projeto não usa rails-i18n: uma chave esquecida sairia como "Translation missing"
    # na cara de quem preenche o formulário.
    {
      [ Products::Item, :tags, :too_many, { count: 50 } ] => /50/,
      [ Products::Item, :custom_fields, :too_large, {} ] => nil,
      [ Products::Item, :custom_fields, :uncastable, { fields: "Preço" } ] => /Preço/,
      [ Products::Item, :url, :invalid, {} ] => nil,
      [ Products::Item, :title, :blank, {} ] => nil,
      [ Products::Item, :external_id, :taken, {} ] => nil,
      [ Products::Category, :name, :taken, {} ] => nil,
      [ Products::Category, :name, :invalid, {} ] => nil,
      [ Products::Category, :parent_id, :foreign, {} ] => nil,
      [ Products::Category, :parent_id, :cycle, {} ] => nil,
      [ Products::Category, :parent_id, :too_deep, { count: 6 } ] => /6/,
      [ Products::Category, :position, :not_a_number, {} ] => nil,
      [ Products::FieldDefinition, :name, :taken, {} ] => nil,
      [ Products::FieldDefinition, :option_values, :list_without_options, {} ] => nil,
      [ Products::FieldDefinition, :value_type, :inclusion, {} ] => nil,
      [ Products::Image, :file, :unsupported_type, {} ] => nil,
      [ Products::Image, :file, :too_large, { max: 10 } ] => /10/,
      [ Products::Image, :source_url, :invalid, {} ] => nil,
      [ Products::Image, :position, :less_than_or_equal_to, { count: 1 } ] => nil
    }.each do |(model, attribute, type, options), expected|
      %i[pt-BR en].each do |locale|
        it "#{model}##{attribute} #{type} tem mensagem e nome de campo em #{locale}" do
          I18n.with_locale(locale) do
            errors = model.new.errors
            errors.add(attribute, type, **options)
            message = errors.full_messages_for(attribute).first

            expect(message).not_to match(/translation missing/i)
            # Sem tradução do atributo, a frase sairia com "Parent" ou "Option values".
            expect(I18n.exists?("activerecord.attributes.#{model.model_name.i18n_key}.#{attribute}")).to be(true)
            expect(message).to match(expected) if expected
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
