require "rails_helper"

RSpec.describe Widget::ReleaseRegistry do
  let(:valid_sri) { "sha384-#{'A' * 64}" }

  # O catálogo é memoizado na classe: cada exemplo que troca o arquivo limpa a memória, para
  # o próximo ler o YAML de verdade. O `after` roda com o `stub_const` ainda de pé, por isso
  # zera em vez de chamar `reload!`.
  after { described_class.instance_variable_set(:@data, nil) }

  def with_catalog(yaml)
    Tempfile.create([ "widget_releases", ".yml" ]) do |file|
      file.write(yaml)
      file.flush
      stub_const("#{described_class}::CONFIG_PATH", Pathname.new(file.path))
      described_class.instance_variable_set(:@data, nil)
      yield
    end
  end

  def catalog_of(*versions, stable: nil)
    entries = versions.map { |version| %(  "#{version}":\n    sri: "#{valid_sri}"\n    released_at: "2026-08-06"\n    notes: "Versão #{version}"\n) }
    "#{"stable: \"#{stable}\"\n" if stable}releases:\n#{entries.join}"
  end

  describe ".releases" do
    it "carrega o catálogo do config/widget_releases.yml" do
      expect(described_class.releases).not_to be_empty
    end

    # Um SRI torto no YAML viraria integrity quebrado na página do cliente, e o sintoma seria
    # "o widget sumiu", sem pista da causa.
    it "só tem hashes sha384 bem formados" do
      described_class.releases.each_value do |entry|
        expect(entry["sri"]).to match(described_class::SRI_FORMAT)
      end
    end

    it "fica vazio sem o arquivo" do
      stub_const("#{described_class}::CONFIG_PATH", Pathname.new("/caminho/que/nao/existe.yml"))
      described_class.instance_variable_set(:@data, nil)

      expect(described_class.releases).to eq({})
    end
  end

  describe "validação do arquivo" do
    it "falha alto com SRI malformado" do
      with_catalog(%(releases:\n  "1.0.0":\n    sri: "sha256-curto"\n)) do
        expect { described_class.releases }.to raise_error(/SRI inválido para a versão "1.0.0"/)
      end
    end

    it "falha alto com entrada sem hash" do
      with_catalog(%(releases:\n  "1.0.0": "sem hash"\n)) do
        expect { described_class.releases }.to raise_error(/SRI inválido/)
      end
    end
  end

  describe ".versions" do
    it "ordena da mais nova para a mais antiga, comparando como versão e não como texto" do
      with_catalog(catalog_of("1.0.0", "1.10.0", "1.2.0")) do
        expect(described_class.versions).to eq(%w[1.10.0 1.2.0 1.0.0])
      end
    end

    it "cai na ordem de texto se houver versão que não é versão" do
      with_catalog(catalog_of("beta", "1.0.0")) do
        expect(described_class.versions).to eq(%w[beta 1.0.0])
      end
    end
  end

  describe ".known?" do
    it "reconhece versão presente no catálogo" do
      expect(described_class.known?(described_class.versions.first)).to be(true)
    end

    it "recusa versão ausente e valores vazios" do
      expect(described_class.known?("99.99.99")).to be(false)
      expect(described_class.known?(nil)).to be(false)
      expect(described_class.known?("")).to be(false)
    end
  end

  describe ".sri" do
    it "devolve o hash da versão" do
      version = described_class.versions.first

      expect(described_class.sri(version)).to eq(described_class.release(version)["sri"])
    end

    it "devolve nil para versão desconhecida" do
      expect(described_class.sri("99.99.99")).to be_nil
      expect(described_class.sri(nil)).to be_nil
    end
  end

  describe ".pinned_path" do
    # As fixadas ficam em /v/ para a regra `immutable` do CDN não alcançar o canal rolling:
    # um curinga na raiz casaria com os dois e o widget.v1.js ficaria em cache para sempre.
    it "aponta para o diretório imutável /v/" do
      expect(described_class.pinned_path("1.4.2")).to eq("v/widget.1.4.2.js")
    end
  end

  describe ".rolling_filename" do
    it "vem do catálogo" do
      with_catalog(%(rolling_filename: "widget.v2.js"\n)) do
        expect(described_class.rolling_filename).to eq("widget.v2.js")
      end
    end

    it "tem padrão" do
      with_catalog("releases: {}\n") do
        expect(described_class.rolling_filename).to eq("widget.v1.js")
      end
    end
  end

  describe ".stable_version" do
    it "é a do catálogo quando existe" do
      with_catalog(catalog_of("1.0.0", "2.0.0", stable: "1.0.0")) do
        expect(described_class.stable_version).to eq("1.0.0")
      end
    end

    it "cai para a mais recente se apontar para algo inexistente" do
      with_catalog(catalog_of("1.0.0", "2.0.0", stable: "9.9.9")) do
        expect(described_class.stable_version).to eq("2.0.0")
      end
    end
  end

  describe ".catalog" do
    it "expõe versão, hash, data e notas, da mais nova para a mais antiga" do
      with_catalog(catalog_of("1.0.0", "2.0.0")) do
        expect(described_class.catalog.map { |entry| entry[:version] }).to eq(%w[2.0.0 1.0.0])
        expect(described_class.catalog.first).to eq(
          version: "2.0.0", sri: valid_sri, released_at: "2026-08-06", notes: "Versão 2.0.0"
        )
      end
    end

    it "expõe as chaves também no catálogo real" do
      expect(described_class.catalog.first).to include(:version, :sri, :released_at)
    end
  end

  describe ".reload!" do
    it "relê o arquivo" do
      with_catalog(catalog_of("1.0.0")) do
        expect(described_class.versions).to eq(%w[1.0.0])

        stub_const("#{described_class}::CONFIG_PATH", Pathname.new("/caminho/que/nao/existe.yml"))
        described_class.reload!

        expect(described_class.versions).to eq([])
      end
    end
  end
end
