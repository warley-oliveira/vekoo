require "rails_helper"

RSpec.describe Widget::SnippetBuilder do
  let(:token) { "pk_widget_TESTTOKEN123" }
  let(:base_url) { "https://widget.vekoo.app" }
  let(:known_version) { Widget::ReleaseRegistry.versions.first }
  let(:known_sri) { Widget::ReleaseRegistry.sri(known_version) }

  def connector(delivery_mode: "rolling", pinned_version: nil, public_token: token)
    Connector::WebWidget.new(public_token: public_token, delivery_mode: delivery_mode, pinned_version: pinned_version)
  end

  # O que vier do ambiente do desenvolvedor não pode mudar a saída que estes exemplos conferem.
  around do |example|
    names = %w[WIDGET_BASE_URL WIDGET_API_BASE_URL WIDGET_ASSETS_BASE_URL]
    saved = names.to_h { |name| [ name, ENV.delete(name) ] }
    example.run
  ensure
    saved.each { |name, value| value ? ENV[name] = value : ENV.delete(name) }
  end

  describe "modo rolling (padrão)" do
    subject(:snippet) { described_class.new(connector, base_url: base_url).call }

    # ATENÇÃO: teste de texto congelado, de propósito.
    #
    # Este HTML fica colado no site dos clientes. Qualquer alteração aqui é uma alteração no
    # que já está instalado na loja deles, e não há como reemitir o que já foi copiado. Se
    # este teste quebrar, a pergunta certa é "por que o snippet mudou?", e não "como atualizo
    # o teste?". O `window.aiva` é de propósito: o bundle embutível da origem não foi portado.
    it "produz o snippet exato, byte a byte" do
      expected = <<~HTML.strip
        <script>
          window.aiva = window.aiva || function(){(window.aiva.q = window.aiva.q || []).push(arguments)};
          (function(d,s,p){var w=d.createElement(s);w.async=1;
          w.src='https://widget.vekoo.app/widget.v1.js';
          w.dataset.pk=p; d.head.appendChild(w);})
          (document,'script','pk_widget_TESTTOKEN123');
        </script>
      HTML

      expect(snippet).to eq(expected)
    end

    it "tira a barra final da URL base" do
      expect(described_class.new(connector, base_url: "#{base_url}/").call).to include("w.src='https://widget.vekoo.app/widget.v1.js'")
    end

    it "não carrega versão fixada nem integrity" do
      expect(snippet).to include("/widget.v1.js")
      expect(snippet).not_to include("integrity")
    end

    it "não expõe SRI nem versão" do
      builder = described_class.new(connector, base_url: base_url)

      expect(builder.sri).to be_nil
      expect(builder.version).to be_nil
      expect(builder).not_to be_pinned
    end
  end

  describe "URL padrão" do
    it "é a do widget do Vekoo" do
      expect(described_class.widget_base_url).to eq("https://widget.vekoo.app")
      expect(described_class.new(connector).call).to include("w.src='https://widget.vekoo.app/widget.v1.js'")
    end

    it "pode vir do ambiente" do
      ENV["WIDGET_BASE_URL"] = "https://cdn.exemplo.com"

      expect(described_class.new(connector).call).to include("w.src='https://cdn.exemplo.com/widget.v1.js'")
    end
  end

  describe "modo fixado" do
    subject(:builder) do
      described_class.new(connector(delivery_mode: "pinned", pinned_version: known_version), base_url: base_url)
    end

    it "é uma tag <script src> literal apontando para o arquivo imutável" do
      expect(builder.call).to include(%(src="#{base_url}/v/widget.#{known_version}.js"))
    end

    it "aplica o integrity da versão revisada" do
      expect(builder.call).to include(%(integrity="#{known_sri}"))
    end

    # Sem crossorigin o navegador nem chega a comparar o hash: o SRI viraria decoração.
    it "traz crossorigin=\"anonymous\", obrigatório para o SRI ser avaliado" do
      expect(builder.call).to include('crossorigin="anonymous"')
    end

    it "mantém o stub window.aiva para comandos enfileirados antes de carregar" do
      expect(builder.call).to include("window.aiva = window.aiva || function()")
    end

    it "preserva o data-pk" do
      expect(builder.call).to include(%(data-pk="#{token}"))
    end

    it "informa a versão e o hash" do
      expect(builder).to be_pinned
      expect(builder.version).to eq(known_version)
      expect(builder.sri).to eq(known_sri)
    end

    context "quando a versão não está no catálogo" do
      subject(:builder) do
        described_class.new(connector(delivery_mode: "pinned", pinned_version: "99.99.99"), base_url: base_url)
      end

      # De propósito: sem hash conhecido não sai `integrity` vazio (que desligaria a proteção
      # sem ninguém ver). Volta ao rolling, e a validação do modelo impede salvar esse estado.
      it "cai no rolling em vez de emitir integrity vazio" do
        expect(builder).not_to be_pinned
        expect(builder.call).to include("/widget.v1.js")
        expect(builder.call).not_to include("integrity")
      end
    end
  end

  describe "#csp_script_hash" do
    it "é o sha256 do conteúdo inline realmente emitido" do
      builder = described_class.new(connector, base_url: base_url)
      inline = builder.call[%r{\A<script>(.*?)</script>}m, 1]

      expect(builder.csp_script_hash).to eq("'sha256-#{Digest::SHA256.base64digest(inline)}'")
    end

    it "difere entre rolling e fixado, porque o bloco inline difere" do
      rolling = described_class.new(connector, base_url: base_url).csp_script_hash
      pinned = described_class.new(connector(delivery_mode: "pinned", pinned_version: known_version), base_url: base_url).csp_script_hash

      expect(rolling).not_to eq(pinned)
    end
  end

  describe "#csp_directives" do
    subject(:directives) { described_class.new(connector, base_url: base_url).csp_directives }

    it "libera o CDN do bundle e o hash do bloco inline no script-src" do
      builder = described_class.new(connector, base_url: base_url)

      expect(directives["script-src"]).to eq("#{base_url} #{builder.csp_script_hash}")
    end

    it "libera a API e o WebSocket no connect-src" do
      ENV["WIDGET_API_BASE_URL"] = "https://api.vekoo.app"

      expect(directives["connect-src"]).to eq("https://api.vekoo.app wss://api.vekoo.app")
    end

    it "usa o endereço do backend quando a API não é informada" do
      backend = Media::Storage.backend_url

      expect(directives["connect-src"]).to eq("#{backend} #{backend.sub(/\Ahttp/, 'ws')}")
    end

    it "libera os anexos em img-src e media-src" do
      ENV["WIDGET_ASSETS_BASE_URL"] = "https://assets.vekoo.app"

      expect(directives["img-src"]).to eq("https://assets.vekoo.app data:")
      expect(directives["media-src"]).to eq("https://assets.vekoo.app data:")
    end

    it "avisa que o style-src ainda precisa de inline" do
      expect(directives["style-src"]).to eq("'unsafe-inline'")
    end
  end

  describe "#csp_header" do
    it "junta as diretivas num cabeçalho só" do
      builder = described_class.new(connector, base_url: base_url)

      expect(builder.csp_header).to eq(builder.csp_directives.map { |directive, value| "#{directive} #{value}" }.join("; "))
    end
  end

  describe "sem public_token" do
    it "não gera nada para instalar" do
      builder = described_class.new(connector(public_token: nil), base_url: base_url)

      expect(builder.call).to be_nil
      expect(builder.csp_directives).to be_nil
      expect(builder.csp_script_hash).to be_nil
      expect(builder.csp_header).to be_nil
    end
  end
end
