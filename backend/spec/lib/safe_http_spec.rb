require "rails_helper"
require "socket"
require "zlib"

# As travas de endereço estão cobertas caso a caso em spec/services/products/remote_image_spec.rb,
# que passa por aqui. Esta spec cobre o que só este cliente faz: os outros métodos, os
# cabeçalhos do pedido e o que vale para redirecionamento de quem manda corpo.
RSpec.describe SafeHttp do
  let(:url) { "https://api.exemplo.com.br/pedidos" }
  let(:public_ip) { "93.184.216.34" }

  def request(target = url, max_bytes: 1.megabyte, **options)
    described_class.request(target, max_bytes: max_bytes, **options)
  end

  def stub_resolve(host, *addresses)
    allow(described_class).to receive(:resolve).with(host).and_return(addresses)
  end

  before { stub_resolve("api.exemplo.com.br", public_ip) }

  describe "métodos" do
    %i[get post put patch delete options].each do |verb|
      it "envia #{verb}" do
        stub = stub_request(verb, url).to_return(status: 200, body: "ok")

        expect(request(method: verb).body).to eq("ok")
        expect(stub).to have_been_requested
      end
    end

    it "HEAD não tem corpo na resposta" do
      stub_request(:head, url).to_return(status: 200)

      expect(request(method: :head).body).to eq("")
    end

    it "aceita o método como texto, em qualquer caixa" do
      stub = stub_request(:post, url).to_return(status: 201)

      expect(request(method: "POST").status).to eq(201)
      expect(stub).to have_been_requested
    end

    # Na origem `HTTParty.send(method.to_sym, ...)` deixava o script escolher o método
    # Ruby a chamar. Aqui é uma tabela: o que não está nela não chega a lugar nenhum.
    %w[system eval load send instance_eval exit trace].each do |verb|
      it "recusa #{verb}" do
        expect { request(method: verb) }.to raise_error(described_class::Refused, /método/)
        expect(a_request(:any, /.*/)).not_to have_been_made
      end
    end
  end

  describe "pedido" do
    it "manda cabeçalhos e corpo" do
      stub = stub_request(:post, url)
        .with(headers: { "Authorization" => "Bearer x", "Content-Type" => "application/json" }, body: '{"a":1}')
        .to_return(status: 201)

      request(method: :post, headers: { "Authorization" => "Bearer x", "Content-Type" => "application/json" }, body: '{"a":1}')

      expect(stub).to have_been_requested
    end

    it "converte para texto o valor de cabeçalho que não é texto e ignora o nulo" do
      stub = stub_request(:get, url).with(headers: { "X-Id" => "123" }).to_return(status: 200)

      request(headers: { "X-Id" => 123, "X-Nada" => nil })

      expect(stub).to have_been_requested
      expect(a_request(:get, url).with { |req| req.headers.key?("X-Nada") }).not_to have_been_made
    end

    it "não deixa escolher o Host: a conexão é com o IP validado" do
      stub_request(:get, url).to_return(status: 200)

      request(headers: { "Host" => "admin.interno", "host" => "admin.interno" })

      expect(a_request(:get, url).with(headers: { "Host" => "api.exemplo.com.br" })).to have_been_made
    end

    it "recusa quebra de linha no valor do cabeçalho" do
      expect { request(headers: { "X-A" => "b\r\nX-Injetado: 1" }) }.to raise_error(described_class::Refused, /cabeçalho/)
    end

    it "recusa nome de cabeçalho que não é token, antes de abrir conexão" do
      [ "X-A\r\nX-Injetado", "X A", "X:A", "" ].each do |name|
        expect { request(headers: { name => "1" }) }.to raise_error(described_class::Refused, /cabeçalho/)
      end
      expect(a_request(:any, /.*/)).not_to have_been_made
    end
  end

  describe "caixa dos cabeçalhos" do
    let(:uri) { URI(url) }

    def wire_format(client)
      io = StringIO.new
      client.send(:build_request, uri).send(:write_header, Net::BufferedIO.new(io), "1.1", "/")
      io.string
    end

    it "capitaliza por padrão, como o Net::HTTP" do
      client = described_class.new(url, max_bytes: 10, headers: { "X-API-KEY" => "1" })

      expect(wire_format(client)).to include("X-Api-Key: 1\r\n")
    end

    it "escreve exatamente como veio com exact_header_case" do
      client = described_class.new(url, max_bytes: 10, headers: { "X-API-KEY" => "1", "x-minusculo" => "2" }, exact_header_case: true)

      expect(wire_format(client)).to include("X-API-KEY: 1\r\n", "x-minusculo: 2\r\n")
    end
  end

  describe "resposta" do
    it "devolve o que interessa" do
      stub_request(:get, url).to_return(status: 200, body: "{}", headers: { "Content-Type" => "application/json; charset=utf-8", "X-Req" => "1" })

      response = request

      expect(response).to have_attributes(status: 200, body: "{}", content_type: "application/json", url: url, charset: "utf-8")
      expect(response).to be_success
      expect(response.headers).to include("x-req" => [ "1" ])
    end

    it "não trata erro do servidor como exceção" do
      stub_request(:get, url).to_return(status: 503, body: "fora do ar")

      response = request

      expect(response.status).to eq(503)
      expect(response).not_to be_success
      expect(response.body).to eq("fora do ar")
    end

    it "304 não é redirecionamento a seguir" do
      stub_request(:get, url).to_return(status: 304, headers: { "Location" => "https://api.exemplo.com.br/outro" })

      expect(request.status).to eq(304)
    end

    it "3xx sem destino volta para quem pediu decidir" do
      stub_request(:get, url).to_return(status: 302)

      expect(request.status).to eq(302)
    end

    it "para no teto de bytes" do
      stub_request(:get, url).to_return(status: 200, body: "x" * 200)

      expect { request(max_bytes: 100) }.to raise_error(described_class::Refused, /limite/)
    end
  end

  describe "redirecionamentos" do
    let(:other) { "https://outro.exemplo.com.br/destino" }

    before { stub_resolve("outro.exemplo.com.br", public_ip) }

    it "POST vira GET sem corpo em 302, como nos navegadores" do
      stub_request(:post, url).to_return(status: 302, headers: { "Location" => "/novo" })
      target = stub_request(:get, "https://api.exemplo.com.br/novo").to_return(status: 200, body: "ok")

      response = request(method: :post, body: "a=1", headers: { "Content-Type" => "text/plain" })

      expect(response.body).to eq("ok")
      expect(target.with { |req| req.body.blank? && !req.headers.key?("Content-Type") }).to have_been_requested
    end

    it "POST continua POST, com o corpo, em 307 e 308" do
      [ 307, 308 ].each do |status|
        stub_request(:post, url).to_return(status: status, headers: { "Location" => "/novo" })
        target = stub_request(:post, "https://api.exemplo.com.br/novo").with(body: "a=1").to_return(status: 200, body: "ok")

        expect(request(method: :post, body: "a=1").body).to eq("ok")
        expect(target).to have_been_requested.at_least_once
        WebMock.reset!
      end
    end

    it "HEAD continua HEAD" do
      stub_request(:head, url).to_return(status: 301, headers: { "Location" => "/novo" })
      target = stub_request(:head, "https://api.exemplo.com.br/novo").to_return(status: 200)

      request(method: :head)

      expect(target).to have_been_requested
    end

    it "não leva credencial para outro host" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => other })
      target = stub_request(:get, other).to_return(status: 200)

      request(headers: { "Authorization" => "Bearer segredo", "Cookie" => "sessao=1", "X-Outro" => "fica" })

      expect(target.with { |req|
        !req.headers.key?("Authorization") && !req.headers.key?("Cookie") && req.headers["X-Outro"] == "fica"
      }).to have_been_requested
    end

    it "mantém a credencial no mesmo host" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => "/novo" })
      target = stub_request(:get, "https://api.exemplo.com.br/novo")
        .with(headers: { "Authorization" => "Bearer segredo" }).to_return(status: 200)

      request(headers: { "Authorization" => "Bearer segredo" })

      expect(target).to have_been_requested
    end

    it "valida o destino de novo a cada salto, com as mesmas portas" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => "http://api.exemplo.com.br:6379/" })

      expect { request }.to raise_error(described_class::DestinationRefused, /porta/)
      expect(a_request(:get, /6379/)).not_to have_been_made
    end

    it "não segue redirecionamento para dentro da rede" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => "http://169.254.169.254/latest/meta-data/" })
      allow(described_class).to receive(:resolve).and_call_original
      stub_resolve("api.exemplo.com.br", public_ip)

      expect { request }.to raise_error(described_class::DestinationRefused)
      expect(a_request(:get, /169\.254/)).not_to have_been_made
    end

    it "desiste no limite de saltos pedido" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => url })

      expect { request(max_redirects: 1) }.to raise_error(described_class::Refused, /redirecionamentos/)
      expect(a_request(:get, url)).to have_been_made.times(2)
    end
  end

  describe "endereços" do
    it "recusa o que não é público, inclusive escrito de outro jeito" do
      allow(described_class).to receive(:resolve).and_call_original

      %w[
        http://127.0.0.1/ http://[::1]/ http://0.0.0.0/ http://10.0.0.1/ http://192.168.1.1/ http://172.16.0.1/
        http://169.254.169.254/ http://100.64.0.1/ http://[::ffff:127.0.0.1]/ http://[::ffff:7f00:1]/
        http://[::127.0.0.1]/ http://[fc00::1]/ http://[fe80::1]/ http://[fec0::1]/ http://[2002:7f00:1::]/
        http://2130706433/ http://0x7f.0.0.1/ http://017700000001/ http://127.1/
      ].each do |target|
        expect { request(target) }.to raise_error(described_class::DestinationRefused), "deveria recusar #{target}"
      end

      expect(a_request(:any, /.*/)).not_to have_been_made
    end

    it "recusa nome que resolve para dentro" do
      stub_resolve("db.interno", "10.0.0.5")

      expect { request("http://db.interno/") }.to raise_error(described_class::DestinationRefused, /interno/)
    end

    it "respeita as portas pedidas" do
      stub_request(:get, "https://api.exemplo.com.br:8443/").to_return(status: 200)

      expect { request("https://api.exemplo.com.br:8443/") }.to raise_error(described_class::DestinationRefused, /porta/)
      expect(request("https://api.exemplo.com.br:8443/", ports: [ 8443 ]).status).to eq(200)
    end

    it "usa o resolver pedido no lugar do DNS" do
      stub_request(:get, url).to_return(status: 200)

      request(resolver: ->(host) { host == "api.exemplo.com.br" ? [ public_ip ] : [] })

      expect(described_class).not_to have_received(:resolve)
    end

    it "traz endereço mapeado e com zona para a mesma regra" do
      expect(described_class.internal_address?("::ffff:10.0.0.1")).to be(true)
      expect(described_class.internal_address?("fe80::1%eth0")).to be(true)
      expect(described_class.internal_address?("não é ip")).to be(true)
      expect(described_class.internal_address?(public_ip)).to be(false)
      expect(described_class.internal_address?("2606:2800:220:1:248:1893:25c8:1946")).to be(false)
    end
  end

  # Sem WebMock: um servidor de verdade em 127.0.0.1. O host aponta para ele e a trava de
  # endereço é liberada só aqui, para exercitar o Net::HTTP de ponta a ponta: conexão no IP
  # fixado, limites sobre o socket e descompressão.
  describe "num socket de verdade" do
    around do |example|
      WebMock.allow_net_connect!
      example.run
    ensure
      WebMock.disable_net_connect!(allow_localhost: false)
    end

    before do
      stub_resolve("api.exemplo.com.br", "127.0.0.1")
      allow(described_class).to receive(:internal_address?).and_return(false)
    end

    # Atende uma conexão com o bloco e devolve a porta.
    def serve(&handler)
      server = TCPServer.new("127.0.0.1", 0)
      @threads = Array(@threads) << Thread.new do
        client = server.accept
        request_head = +""
        while (line = client.gets) && line != "\r\n"
          request_head << line
        end
        handler.call(client, request_head)
      rescue IOError, SystemCallError
        nil
      ensure
        client&.close
        server.close
      end
      server.addr[1]
    end

    after { Array(@threads).each(&:kill) }

    it "conecta no IP validado, com o nome no Host" do
      head = nil
      port = serve do |client, request_head|
        head = request_head
        client.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
      end

      response = request("http://api.exemplo.com.br:#{port}/pedidos", ports: [ port ])

      expect(response.body).to eq("ok")
      expect(head).to include("GET /pedidos HTTP/1.1", "Host: api.exemplo.com.br:#{port}")
    end

    it "manda a caixa pedida pelo fio" do
      head = nil
      port = serve do |client, request_head|
        head = request_head
        client.write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
      end

      request("http://api.exemplo.com.br:#{port}/", ports: [ port ], headers: { "X-API-KEY" => "1" }, exact_header_case: true)

      expect(head).to include("X-API-KEY: 1\r\n")
    end

    it "para de ler quando o corpo passa do teto, sem Content-Length" do
      port = serve do |client, _|
        client.write("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n")
        20.times { client.write("x" * 1024) }
      end

      expect { request("http://api.exemplo.com.br:#{port}/", ports: [ port ], max_bytes: 4.kilobytes) }
        .to raise_error(described_class::Refused, /limite/)
    end

    # Bomba de compressão: 1 MB no fio viraria 1 GB na memória.
    it "aplica o teto ao corpo descomprimido" do
      bomb = Zlib.gzip("x" * 5.megabytes)
      port = serve do |client, _|
        client.write("HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: #{bomb.bytesize}\r\n\r\n")
        client.write(bomb)
      end

      expect(bomb.bytesize).to be < 100.kilobytes
      expect { request("http://api.exemplo.com.br:#{port}/", ports: [ port ], max_bytes: 1.megabyte) }
        .to raise_error(described_class::Refused, /limite/)
    end

    it "desiste do servidor que pinga um byte por vez" do
      port = serve do |client, _|
        client.write("HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n")
        100_000.times do
          client.write("x")
          sleep 0.05
        end
      end

      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)

      expect { request("http://api.exemplo.com.br:#{port}/", ports: [ port ], total_timeout: 0.3) }
        .to raise_error(described_class::Refused, /tempo/)
      expect(Process.clock_gettime(Process::CLOCK_MONOTONIC) - started).to be < 2
    end
  end
end
