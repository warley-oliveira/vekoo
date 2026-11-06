require "rails_helper"

RSpec.describe Products::RemoteImage do
  let(:url) { "https://cdn.exemplo.com.br/foto.png" }
  let(:public_ip) { "93.184.216.34" }
  let(:png) { File.binread(Rails.root.join("spec/fixtures/files/foto.png")) }

  def fetch(target = url, max_bytes: 1.megabyte) = described_class.fetch(target, max_bytes: max_bytes)

  def stub_resolve(host, *addresses)
    allow(described_class).to receive(:resolve).with(host).and_return(addresses)
  end

  before { stub_resolve("cdn.exemplo.com.br", public_ip) }

  it "baixa a imagem e diz o tipo, sem o charset" do
    stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png; charset=binary" })

    result = fetch

    expect(result.body).to eq(png)
    expect(result.content_type).to eq("image/png")
  end

  it "não depende de `http_proxy` no ambiente nem de hostname resolvido duas vezes" do
    stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })
    allow(Net::HTTP).to receive(:new).and_call_original

    fetch

    expect(Net::HTTP).to have_received(:new).with("cdn.exemplo.com.br", 443, nil)
    expect(described_class).to have_received(:resolve).once
  end

  it "conecta no IP que foi validado" do
    stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })
    pinned = []
    allow_any_instance_of(Net::HTTP).to receive(:ipaddr=).and_wrap_original do |original, address|
      pinned << address
      original.call(address)
    end

    fetch

    expect(pinned).to eq([ public_ip ])
  end

  it "aceita acento e espaço no nome do arquivo, sem recodificar o que já veio codificado" do
    stub_resolve("cdn.exemplo.com.br", public_ip)
    stub_request(:get, "https://cdn.exemplo.com.br/cami%C3%A3o%20azul/a%20b.png")
      .to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })

    expect(fetch("https://cdn.exemplo.com.br/camião azul/a%20b.png").body).to eq(png)
  end

  describe "endereços internos (SSRF)" do
    {
      "loopback" => "http://127.0.0.1/a.png",
      "loopback por outro número" => "http://127.1.2.3/a.png",
      "qualquer interface" => "http://0.0.0.0/a.png",
      "rede privada 10" => "http://10.0.0.5/a.png",
      "rede privada 172" => "http://172.16.0.1/a.png",
      "rede privada 192" => "http://192.168.0.10/a.png",
      "metadados da nuvem" => "http://169.254.169.254/latest/meta-data/",
      "NAT de operadora" => "http://100.64.0.1/a.png",
      "loopback IPv6" => "http://[::1]/a.png",
      "privada IPv6" => "http://[fd00::1]/a.png",
      "link-local IPv6" => "http://[fe80::1]/a.png",
      "IPv4 mapeado em IPv6" => "http://[::ffff:127.0.0.1]/a.png"
    }.each do |label, target|
      it "recusa #{label}, sem chegar a conectar" do
        allow(described_class).to receive(:resolve).and_call_original

        expect { fetch(target) }.to raise_error(described_class::Refused)
        expect(a_request(:any, /.*/)).not_to have_been_made
      end
    end

    it "recusa host público cujo DNS aponta para dentro" do
      stub_resolve("interno.exemplo.com.br", "10.0.0.5")

      expect { fetch("https://interno.exemplo.com.br/a.png") }.to raise_error(described_class::Refused, /interno/)
    end

    # É assim que um DNS malicioso tentaria passar pela checagem.
    it "recusa o host inteiro se um dos endereços for interno" do
      stub_resolve("misto.exemplo.com.br", public_ip, "127.0.0.1")

      expect { fetch("https://misto.exemplo.com.br/a.png") }.to raise_error(described_class::Refused)
    end

    it "recusa host que não resolve" do
      stub_resolve("nada.exemplo.com.br")

      expect { fetch("https://nada.exemplo.com.br/a.png") }.to raise_error(described_class::Refused)
    end
  end

  describe "URLs recusadas" do
    it "só http(s)" do
      expect { fetch("file:///etc/passwd") }.to raise_error(described_class::Refused)
      expect { fetch("ftp://cdn.exemplo.com.br/a.png") }.to raise_error(described_class::Refused)
      expect { fetch("gopher://cdn.exemplo.com.br/") }.to raise_error(described_class::Refused)
    end

    it "só as portas padrão" do
      expect { fetch("https://cdn.exemplo.com.br:8443/a.png") }.to raise_error(described_class::Refused)
    end

    it "sem usuário e senha na URL" do
      expect { fetch("https://user:senha@cdn.exemplo.com.br/a.png") }.to raise_error(described_class::Refused)
    end

    it "URL malformada" do
      expect { fetch("http://[nao-e-ip/a.png") }.to raise_error(described_class::Refused)
      expect { fetch("") }.to raise_error(described_class::Refused)
    end
  end

  describe "redirecionamentos" do
    before { stub_resolve("cdn2.exemplo.com.br", public_ip) }

    it "segue até a imagem" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => "https://cdn2.exemplo.com.br/b.png" })
      stub_request(:get, "https://cdn2.exemplo.com.br/b.png")
        .to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })

      expect(fetch.body).to eq(png)
    end

    it "entende destino relativo" do
      stub_request(:get, url).to_return(status: 301, headers: { "Location" => "/nova/foto.png" })
      stub_request(:get, "https://cdn.exemplo.com.br/nova/foto.png")
        .to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })

      expect(fetch.body).to eq(png)
    end

    # Validar só a primeira URL deixaria o site do atacante mandar para dentro da rede.
    it "valida o destino de novo a cada salto" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => "http://169.254.169.254/latest/meta-data/" })
      allow(described_class).to receive(:resolve).and_call_original
      stub_resolve("cdn.exemplo.com.br", public_ip)

      expect { fetch }.to raise_error(described_class::Refused)
      expect(a_request(:get, /169\.254/)).not_to have_been_made
    end

    it "desiste depois do limite de saltos" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => url })

      expect { fetch }.to raise_error(described_class::Refused, /redirecionamentos/)
      expect(a_request(:get, url)).to have_been_made.times(described_class::MAX_REDIRECTS + 1)
    end

    it "recusa redirecionamento sem destino" do
      stub_request(:get, url).to_return(status: 302)

      expect { fetch }.to raise_error(described_class::Refused)
    end
  end

  describe "tamanho e tempo" do
    it "recusa pelo Content-Length, antes de ler o corpo" do
      stub_request(:get, url).to_return(status: 200, body: "x", headers: { "Content-Length" => "5000000" })

      expect { fetch(max_bytes: 1.megabyte) }.to raise_error(described_class::Refused, /limite/)
    end

    it "recusa o corpo que passa do teto mesmo sem Content-Length" do
      stub_request(:get, url).to_return(status: 200, body: "x" * 200)

      expect { fetch(max_bytes: 100) }.to raise_error(described_class::Refused, /limite/)
    end

    it "traduz o estouro de tempo em recusa" do
      stub_request(:get, url).to_timeout

      expect { fetch }.to raise_error(described_class::Refused, /tempo/)
    end
  end

  it "recusa quem responde com erro" do
    stub_request(:get, url).to_return(status: 404)

    expect { fetch }.to raise_error(described_class::Refused, /404/)
  end
end
