require "rails_helper"

# A tradução é contrato: idioma que perde uma chave devolve a chave crua para
# quem estiver usando o produto. Estes exemplos são a guarda do backend — o
# equivalente do `npm run lint:i18n` no front.
RSpec.describe "Traduções" do
  SOURCE_LOCALE = :"pt-BR"

  def flatten(hash, prefix = nil)
    hash.flat_map { |key, value|
      path = [ prefix, key ].compact.join(".")
      value.is_a?(Hash) ? flatten(value, path) : [ path ]
    }
  end

  # `activerecord.errors` fica de fora da paridade: ali moram correções de
  # gramática de um idioma só ("senha é curt**a** demais"), que por definição
  # não têm par no outro.
  GRAMMAR_OVERRIDES = "activerecord.errors."

  def keys_for(locale)
    file = Rails.root.join("config/locales/#{locale}.yml")
    flatten(YAML.safe_load_file(file).fetch(locale.to_s))
      .reject { |key| key.start_with?(GRAMMAR_OVERRIDES) }
      .sort
  end

  it "fala os mesmos idiomas que a aplicação declara" do
    expect(I18n.available_locales).to contain_exactly(:"pt-BR", :en)
    expect(I18n.default_locale).to eq(SOURCE_LOCALE)
  end

  it "tem as mesmas chaves em todos os idiomas" do
    source = keys_for(SOURCE_LOCALE)

    (I18n.available_locales - [ SOURCE_LOCALE ]).each do |locale|
      expect(keys_for(locale)).to eq(source), lambda {
        missing = source - keys_for(locale)
        extra = keys_for(locale) - source
        "#{locale}: falta #{missing.inspect}, sobra #{extra.inspect}"
      }
    end
  end

  it "traduz de verdade — nenhuma frase repetida palavra por palavra nos dois idiomas" do
    # Repetir é sinal de tradução esquecida. A exceção é a palavra que o
    # produto usa igual nos dois idiomas — "card" é assim em pt-BR (ver o
    # glossário no CLAUDE.md).
    same_by_design = [ "activerecord.attributes.carousel.cards" ]
    source = YAML.safe_load_file(Rails.root.join("config/locales/pt-BR.yml")).fetch("pt-BR")
    other = YAML.safe_load_file(Rails.root.join("config/locales/en.yml")).fetch("en")

    same = (flatten(source) - same_by_design).select { |path|
      pt = path.split(".").reduce(source) { |acc, key| acc[key] }
      en = path.split(".").reduce(other) { |acc, key| acc&.[](key) }
      # Sem os `%{marcadores}`: "%{attribute} %{message}" é forma, não frase.
      pt.is_a?(String) && pt == en && pt.gsub(/%\{\w+\}/, " ").match?(/\p{L}{4,}/)
    }

    expect(same).to be_empty
  end

  describe "manifestos dos motores" do
    # O catálogo é servido no idioma da requisição: um manifesto com texto
    # cru em inglês apareceria assim para quem usa em português.
    VISIBLE = %w[name description label hint].freeze

    def bilingual?(value)
      value.is_a?(Hash) && value.key?("pt-BR") && value.key?("en") &&
        value.values_at("pt-BR", "en").all? { |text| text.to_s.strip.present? }
    end

    def offenders(node, path = "")
      case node
      when Hash
        node.flat_map { |key, value|
          here = [ path, key ].reject(&:blank?).join(".")
          if VISIBLE.include?(key)
            bilingual?(value) ? [] : [ here ]
          else
            offenders(value, here)
          end
        }
      when Array
        node.each_with_index.flat_map { |item, index| offenders(item, "#{path}.#{index}") }
      else
        []
      end
    end

    Engines::Registry.all.each do |engine_id, entry|
      it "#{engine_id}: nome, descrição, rótulos e ajudas nos dois idiomas" do
        raw = YAML.safe_load_file(entry.dir.join("manifest.yml"))

        expect(offenders(raw)).to be_empty
      end

      it "#{engine_id}: o catálogo responde no idioma da requisição" do
        pt = I18n.with_locale(:"pt-BR") { entry.manifest.as_json(locale: :"pt-BR") }
        en = I18n.with_locale(:en) { entry.manifest.as_json(locale: :en) }

        expect(pt["name"]).to be_present
        expect(en["name"]).to be_present
        expect(pt["fields"].map { |f| f["label"] }).to all(be_present)
        expect(en["fields"].map { |f| f["label"] }).to all(be_present)
      end
    end
  end
end
