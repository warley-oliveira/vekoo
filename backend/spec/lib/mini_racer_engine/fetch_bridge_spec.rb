# frozen_string_literal: true

require "rails_helper"

# Specs do bridge `fetch()` Web-fetch-like exposto ao JS, em V8 de verdade e com a rede
# fechada por WebMock. Cobertura:
#   - API Web fetch (res.ok / res.status / res.json() / res.text() / res.headers.get)
#   - Compat lado-a-lado com `request()` legado
#   - async/await, Promise.all, Promise.then encadeado
#   - Erros HTTP (status >= 400 não lança, vira ok:false)
#   - SSRF, tamanho da resposta e número de chamadas
RSpec.describe "MiniRacerEngine fetch() bridge" do
  let(:organization) { create(:organization) }
  let(:worker) { MiniRacerEngine::Worker.new(script_session(organization: organization)) }
  let(:url) { "http://api.exemplo.test/recurso" }

  def run(code, **options)
    worker.perform(code, {}, **options).result
  end

  def stub_json(body, status: 200, method: :get, target: url)
    stub_request(method, target).to_return(status: status, body: body.to_json, headers: { "Content-Type" => "application/json" })
  end

  before { stub_public_dns("api.exemplo.test") }

  describe "fetch como função global" do
    it "é declarado em globalThis" do
      expect(run("return typeof fetch === 'function';")).to be true
    end

    it "request() legado continua disponível lado a lado" do
      expect(run("return typeof request === 'function' && typeof fetch === 'function';")).to be true
    end
  end

  describe "response Web-fetch-like" do
    before { stub_json({ "name" => "Vekoo", "count" => 3 }) }

    it "retorna objeto com .ok, .status, .headers, .json(), .text()" do
      result = run(<<~JS)
        const res = await fetch('#{url}');
        return {
          ok: res.ok,
          status: res.status,
          hasHeaders: typeof res.headers === 'object',
          getHeader: typeof res.headers.get === 'function',
          hasJson: typeof res.json === 'function',
          hasText: typeof res.text === 'function'
        };
      JS

      expect(result).to eq(
        "ok" => true, "status" => 200, "hasHeaders" => true, "getHeader" => true, "hasJson" => true, "hasText" => true
      )
    end

    it "res.json() retorna o body já parseado" do
      expect(run("const res = await fetch('#{url}'); return await res.json();")).to eq("name" => "Vekoo", "count" => 3)
    end

    it "res.text() serializa body como string" do
      result = run(<<~JS)
        const res = await fetch('#{url}');
        const txt = await res.text();
        return { isString: typeof txt === 'string', contains: txt.indexOf('Vekoo') >= 0 };
      JS

      expect(result).to eq("isString" => true, "contains" => true)
    end

    it "res.url é para onde a requisição foi parar" do
      expect(run("return (await fetch('#{url}')).url;")).to eq(url)
    end

    it "res.headers.get() é case-insensitive" do
      stub_request(:get, url).to_return(
        status: 200, body: "{}", headers: { "Content-Type" => "application/json", "X-Custom" => "vekoo" }
      )

      result = run(<<~JS)
        const res = await fetch('#{url}');
        return {
          contentType: res.headers.get('content-type'),
          custom: res.headers.get('X-Custom'),
          missing: res.headers.get('not-there')
        };
      JS

      expect(result["contentType"]).to match(%r{application/json}i)
      expect(result["custom"]).to eq("vekoo")
      expect(result["missing"]).to be_nil
    end
  end

  describe "corpo da resposta" do
    it "XML vira objeto, como no HTTParty" do
      stub_request(:get, url).to_return(status: 200, body: "<pedido><id>7</id></pedido>", headers: { "Content-Type" => "application/xml" })

      expect(run("return request('#{url}').body;")).to eq("pedido" => { "id" => "7" })
    end

    it "CSV vira lista, como no HTTParty" do
      stub_request(:get, url).to_return(status: 200, body: "a,b\n1,2\n", headers: { "Content-Type" => "text/csv" })

      expect(run("return request('#{url}').body;")).to eq([ %w[a b], %w[1 2] ])
    end

    it "texto fica texto, em UTF-8" do
      stub_request(:get, url).to_return(status: 200, body: "não", headers: { "Content-Type" => "text/plain" })

      expect(run("return request('#{url}').body;")).to eq("não")
    end

    it "respeita o charset" do
      stub_request(:get, url).to_return(status: 200, body: "caf\xE9".b, headers: { "Content-Type" => "text/plain; charset=ISO-8859-1" })

      expect(run("return request('#{url}').body;")).to eq("café")
    end

    it "charset desconhecido e bytes inválidos não derrubam" do
      stub_request(:get, url).to_return(status: 200, body: "caf\xE9".b, headers: { "Content-Type" => "text/plain; charset=klingon" })

      expect(run("return request('#{url}').body;")).to start_with("caf")
    end

    it "corpo vazio é nulo" do
      stub_request(:get, url).to_return(status: 204)

      expect(run("return request('#{url}').body;")).to be_nil
      expect(run("return await (await fetch('#{url}')).text();")).to eq("")
    end

    it "diz que é JSON e não é: continua legível, em vez de virar erro de rede" do
      stub_request(:get, url).to_return(status: 200, body: "<html>erro</html>", headers: { "Content-Type" => "application/json" })

      result = run("const r = request('#{url}'); return { ok: r.ok, body: r.body };")

      expect(result).to eq("ok" => true, "body" => "<html>erro</html>")
    end
  end

  describe "erros HTTP (compat com Web fetch)" do
    it "status 404 → ok: false, sem throw" do
      stub_json({ "error" => "not found" }, status: 404)

      result = run("const res = await fetch('#{url}'); return { ok: res.ok, status: res.status };")

      expect(result).to eq("ok" => false, "status" => 404)
    end

    it "status 500 → ok: false, body acessível" do
      stub_json({ "error" => "crash" }, status: 500)

      result = run(<<~JS)
        const res = await fetch('#{url}');
        const data = await res.json();
        return { ok: res.ok, status: res.status, error: data.error };
      JS

      expect(result).to eq("ok" => false, "status" => 500, "error" => "crash")
    end

    # A origem devolvia JSON em texto aqui, e `res.status` ficava `undefined`.
    it "falha de rede também é ok: false, nos dois, sempre com objeto" do
      stub_request(:get, url).to_raise(Errno::ECONNREFUSED)

      expect(run("const r = request('#{url}'); return [typeof r, r.ok, r.status];")).to eq([ "object", false, 500 ])
      expect(run("const r = await fetch('#{url}'); return [r.ok, r.status, typeof r.error];")).to eq([ false, 500, "string" ])
    end

    it "tempo esgotado" do
      stub_request(:get, url).to_timeout

      expect(run("const r = request('#{url}'); return [r.ok, r.status, r.error];")).to eq([ false, 504, "Request timed out" ])
    end

    it "sem url" do
      expect(run("return request();")).to include("ok" => false, "error" => "Missing url")
    end
  end

  describe "async/await encadeado" do
    it "await em sequência funciona" do
      stub_json({ "value" => 10 })

      result = run(<<~JS)
        async function pipeline() {
          const res = await fetch('#{url}');
          const data = await res.json();
          return data.value * 2;
        }
        return await pipeline();
      JS

      expect(result).to eq(20)
    end

    it ".then() encadeado também funciona" do
      stub_json({ "n" => 5 })

      expect(run("return fetch('#{url}').then(res => res.json()).then(data => data.n + 100);")).to eq(105)
    end
  end

  describe "Promise.all com múltiplos fetches" do
    it "resolve todos os fetches (logicamente paralelos)" do
      stub_json({ "v" => 1 })

      result = run(<<~JS)
        const results = await Promise.all([
          fetch('#{url}').then(r => r.json()),
          fetch('#{url}').then(r => r.json()),
          fetch('#{url}').then(r => r.json())
        ]);
        return results.map(r => r.v);
      JS

      expect(result).to eq([ 1, 1, 1 ])
    end
  end

  describe "validação de input" do
    it "rejeita quando url não é string" do
      expect { run("await fetch(null);") }.to raise_error(MiniRacer::RuntimeError, /url.*required.*string/i)
    end

    it "rejeita quando url é string vazia" do
      expect { run("await fetch('');") }.to raise_error(MiniRacer::RuntimeError, /url.*required/i)
    end
  end

  describe "compat com request() legado" do
    it "request() continua retornando objeto plano síncrono" do
      stub_json({ "legacy" => true })

      result = run("const res = request('#{url}', { method: 'GET' }); return { ok: res.ok, status: res.status, body: res.body };")

      expect(result).to eq("ok" => true, "status" => 200, "body" => { "legacy" => true })
    end

    it "request() e fetch() podem coexistir no mesmo script" do
      stub_json({ "x" => 1 })

      result = run(<<~JS)
        const legacy = request('#{url}');
        const modern = await fetch('#{url}').then(r => r.json());
        return { legacyBody: legacy.body, modernBody: modern };
      JS

      expect(result).to eq("legacyBody" => { "x" => 1 }, "modernBody" => { "x" => 1 })
    end

    it "os cabeçalhos em request() vêm como na origem: minúsculos, em lista" do
      stub_request(:get, url).to_return(status: 200, headers: { "X-Custom" => "a" })

      expect(run("return request('#{url}').headers['x-custom'];")).to eq([ "a" ])
    end
  end

  describe "eventos pro frontend (paridade com request legado)" do
    let(:events) { [] }

    before { worker.on_event { |name, payload| events << [ name, payload ] } }

    it "dispara evento :fetch com {input, output} a cada chamada" do
      stub_json({ "value" => 7 })

      run("const res = await fetch('#{url}', { method: 'GET' }); return await res.json();")

      fetch_events = events.select { |name, _| name == :fetch }
      expect(fetch_events.size).to eq(1)
      payload = fetch_events.first.last
      expect(payload[:input]).to include(url)
      expect(payload[:output]).to include("status" => 200, "ok" => true, "body" => { "value" => 7 })
    end

    it "dispara um evento :fetch por requisição (Promise.all → N eventos)" do
      stub_json({ "ok" => true })

      run("await Promise.all([fetch('#{url}'), fetch('#{url}'), fetch('#{url}')]); return null;")

      expect(events.count { |name, _| name == :fetch }).to eq(3)
    end

    it "não dispara evento :__native_request (nome interno escondido)" do
      stub_json({})

      run("await fetch('#{url}'); return null;")

      names = events.map(&:first)
      expect(names).to include(:fetch)
      expect(names).not_to include(:__native_request, :native_request)
    end

    it "request() legado continua disparando :request — fetch e request convivem" do
      stub_json({ "kind" => "mixed" })

      run("request('#{url}'); await fetch('#{url}'); return null;")

      expect(events.map(&:first)).to include(:request, :fetch)
    end

    # O evento vai para log e para tela.
    it "não entrega credencial a quem assina o evento" do
      stub_json({})

      run("request('#{url}', { headers: { Authorization: 'Bearer segredo', 'X-API-Key': 'chave', Cookie: 'a=1', 'X-Outro': 'fica' } });")

      headers = events.first.last[:input].last["headers"]
      expect(headers).to include("Authorization" => "[FILTERED]", "X-API-Key" => "[FILTERED]", "Cookie" => "[FILTERED]", "X-Outro" => "fica")
    end
  end

  describe "options pass-through" do
    it "envia method, headers e body pro request interno" do
      stub = stub_request(:post, url)
        .with(headers: { "Authorization" => "Bearer x" }, body: '{"name":"João"}')
        .to_return(status: 201, body: "{}")

      result = run(<<~JS)
        const res = await fetch('#{url}', {
          method: 'POST',
          headers: { Authorization: 'Bearer x' },
          body: JSON.stringify({ name: 'João' })
        });
        return res.status;
      JS

      expect(result).to eq(201)
      expect(stub).to have_been_requested
    end

    it "corpo em objeto vira formulário, como no HTTParty" do
      stub = stub_request(:post, url).with(body: "a=1&b=x%20y").to_return(status: 200)

      run("request('#{url}', { method: 'POST', body: { a: 1, b: 'x y' } });")

      expect(stub).to have_been_requested
    end

    it "handleUrl tira acento da URL" do
      stub = stub_request(:get, "http://api.exemplo.test/cafe").to_return(status: 200)

      run("request('http://api.exemplo.test/café', { handleUrl: true });")

      expect(stub).to have_been_requested
    end

    it "preserveHeaderCase chega até o cliente" do
      stub_json({})
      allow(SafeHttp).to receive(:request).and_call_original

      run("request('#{url}', { preserveHeaderCase: true });")

      expect(SafeHttp).to have_received(:request).with(url, hash_including(exact_header_case: true))
    end

    it "assina e envia (cenário real de webhook)" do
      signature = OpenSSL::HMAC.hexdigest("sha256", "webhook-secret", '{"event":"order.created","id":42}')
      stub = stub_request(:post, url).with(headers: { "X-Signature" => signature }).to_return(status: 200, body: "{}")

      run(<<~JS)
        const payload = JSON.stringify({ event: 'order.created', id: 42 });
        const signature = crypto.createHmac('sha256', 'webhook-secret').update(payload).digest('hex');
        await fetch('#{url}', { method: 'POST', headers: { 'X-Signature': signature, 'Content-Type': 'application/json' }, body: payload });
        return null;
      JS

      expect(stub).to have_been_requested
    end
  end

  # `fetch` não pode virar acesso à rede interna.
  describe "SSRF" do
    {
      "metadados da nuvem" => "http://169.254.169.254/latest/meta-data/",
      "loopback" => "http://127.0.0.1/",
      "loopback por outro número" => "http://127.1.2.3/",
      "qualquer interface" => "http://0.0.0.0/",
      "rede privada" => "http://10.0.0.5/",
      "rede privada 172" => "http://172.16.0.1/",
      "rede privada 192" => "http://192.168.0.10/",
      "NAT de operadora" => "http://100.64.0.1/",
      "IPv6 loopback" => "http://[::1]/",
      "IPv6 mapeado" => "http://[::ffff:127.0.0.1]/",
      "IP em decimal" => "http://2130706433/",
      "IP em hexadecimal" => "http://0x7f.0.0.1/"
    }.each do |label, target|
      it "recusa #{label}, sem chegar a conectar" do
        result = run(<<~JS)
          const viaRequest = request('#{target}');
          const viaFetch = await fetch('#{target}');
          return [viaRequest.ok, viaRequest.status, viaFetch.ok, viaFetch.status, viaFetch.error];
        JS

        expect(result).to eq([ false, 403, false, 403, "Destination not allowed" ])
        expect(a_request(:any, /.*/)).not_to have_been_made
      end
    end

    it "recusa nome que resolve para dentro, sem dizer para onde" do
      stub_public_dns("redis.interno", ip: "10.0.0.5")

      expect(run("return request('http://redis.interno/').error;")).to eq("Destination not allowed")
    end

    # "Não resolve" e "resolve para dentro" iguais: senão o script mapeia os nomes da rede.
    it "host que não resolve dá a mesma resposta de host interno" do
      allow(SafeHttp).to receive(:resolve).with("nao-existe.test").and_raise(SafeHttp::DestinationRefused, "host não resolve")

      expect(run("const r = request('http://nao-existe.test/'); return [r.status, r.error];")).to eq([ 403, "Destination not allowed" ])
    end

    it "recusa o host inteiro se um dos endereços for interno" do
      allow(SafeHttp).to receive(:resolve).with("misto.test").and_return([ ScriptEngineHelpers::PUBLIC_IP, "127.0.0.1" ])

      expect(run("return request('http://misto.test/').status;")).to eq(403)
    end

    it "valida o destino de novo no redirecionamento" do
      stub_request(:get, url).to_return(status: 302, headers: { "Location" => "http://169.254.169.254/latest/meta-data/" })

      expect(run("return request('#{url}').status;")).to eq(403)
      expect(a_request(:get, /169\.254/)).not_to have_been_made
    end

    it "só as portas web" do
      [ 25, 22, 5432, 6379, 27017, 3306, 11211 ].each do |port|
        expect(run("return request('http://api.exemplo.test:#{port}/').status;")).to eq(403)
      end

      expect(a_request(:any, /.*/)).not_to have_been_made
    end

    it "aceita as portas web conhecidas" do
      MiniRacerEngine::Limits::FETCH_PORTS.each do |port|
        scheme = port.in?([ 443, 8443 ]) ? "https" : "http"
        target = "#{scheme}://api.exemplo.test:#{port}/"
        stub_request(:get, target).to_return(status: 200)

        expect(run("return request('#{target}').status;")).to eq(200)
      end
    end

    it "só http(s)" do
      %w[file:///etc/passwd ftp://api.exemplo.test/ gopher://api.exemplo.test/].each do |target|
        expect(run("return request('#{target}').status;")).to eq(403)
      end
    end

    it "sem usuário e senha na URL" do
      expect(run("return request('http://user:senha@api.exemplo.test/').status;")).to eq(403)
    end

    it "o script chamando a função nativa direto não foge de nada" do
      expect(run("return __nativeRequest('http://127.0.0.1/').status;")).to eq(403)
    end

    # Na origem: `HTTParty.send(method.to_sym, url, ...)`, com `method` vindo do script.
    %w[system eval load send instance_eval exit public_send].each do |verb|
      it "o método HTTP não alcança o método Ruby #{verb}" do
        allow(Kernel).to receive(:system)
        result = run("const r = request('#{url}', { method: '#{verb}' }); return [r.ok, r.status];")

        expect(result).to eq([ false, 400 ])
        expect(Kernel).not_to have_received(:system)
      end
    end

    it "recusa injeção de cabeçalho" do
      result = run("return request('#{url}', { headers: { 'X-A\\r\\nX-Injetado': '1' } }).status;")

      expect(result).to eq(400)
      expect(a_request(:any, /.*/)).not_to have_been_made
    end
  end

  describe "limites" do
    it "tamanho da resposta" do
      stub_const("MiniRacerEngine::Limits::MAX_RESPONSE_BYTES", 100)
      stub_request(:get, url).to_return(status: 200, body: "x" * 200)

      expect(run("const r = request('#{url}'); return [r.ok, r.status, r.error];")).to eq([ false, 413, "Response too large" ])
    end

    it "soma das respostas de uma execução" do
      stub_const("MiniRacerEngine::Limits::MAX_TOTAL_RESPONSE_BYTES", 150)
      stub_request(:get, url).to_return(status: 200, body: "x" * 100)

      expect(run("return [request('#{url}').status, request('#{url}').status];")).to eq([ 200, 413 ])
    end

    it "número de chamadas por execução, mesmo capturando o erro" do
      stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 2)
      stub_json({})

      result = run(<<~JS)
        const out = [];
        for (let i = 0; i < 4; i++) {
          try { out.push(request('#{url}').status); } catch (e) { out.push(e.message); }
        }
        return out;
      JS

      expect(result.first(2)).to eq([ 200, 200 ])
      expect(result.last(2)).to all(match(/limit of 2 network calls/))
      expect(a_request(:get, url)).to have_been_made.twice
    end

    it "fetch rejeita a Promise ao passar da cota" do
      stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 0)

      expect { run("await fetch('#{url}');") }.to raise_error(MiniRacer::RuntimeError, /network calls/)
      expect(a_request(:any, /.*/)).not_to have_been_made
    end

    it "a função nativa direta conta na mesma cota" do
      stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 1)
      stub_json({})

      expect { run("__nativeRequest('#{url}'); __nativeRequest('#{url}');") }
        .to raise_error(MiniRacer::RuntimeError, /network calls/)
    end

    it "a requisição não passa do prazo da execução" do
      allow(SafeHttp).to receive(:request).and_call_original
      stub_json({})

      run("request('#{url}');", timeout_ms: 2_000)

      expect(SafeHttp).to have_received(:request).with(url, hash_including(total_timeout: be <= 2.0, read_timeout: be <= 2.0))
    end

    it "fora do prazo, não fica sem teto" do
      budget = instance_double(MiniRacerEngine::Budget, remaining_seconds: 0.0)
      fetch = MiniRacerEngine::Workers::Fetch.new
      allow(fetch).to receive(:budget).and_return(budget)

      expect(fetch.send(:http_limits, 45)[:total_timeout]).to be > 0
    end
  end

  describe "downloadFile" do
    let(:file_url) { "https://cdn.exemplo.test/fotos/foto.png" }

    before { stub_public_dns("cdn.exemplo.test") }

    context "enquanto o domínio inbox não trouxer `Attachment`" do
      before { allow(Media::AttachmentLookup).to receive(:available?).and_return(false) }

      it "diz que não está disponível, sem baixar nada" do
        expect(run("return downloadFile('#{file_url}');")).to include("ok" => false, "status" => 501)
        expect(a_request(:any, /.*/)).not_to have_been_made
      end
    end

    context "com `Attachment` disponível" do
      let(:attachment_class) do
        Class.new do
          attr_reader :attributes, :file

          def initialize(attributes)
            @attributes = attributes
            @file = Struct.new(:attached) { def attach(args) = (self.attached = args) }.new
          end

          def save! = true
          def id = "anexo-1"
          def name = attributes[:name]
          def file_name = file.attached[:filename]
          def file_url = "/rails/active_storage/blobs/proxy/abc/#{file_name}"
        end
      end

      before do
        stub_const("Attachment", attachment_class)
        allow(Media::AttachmentLookup).to receive(:available?).and_return(true)
        allow(attachment_class).to receive(:new).and_wrap_original do |original, attributes|
          @attachment = original.call(attributes)
        end
      end

      it "baixa e guarda como anexo privado da organização" do
        stub_request(:get, file_url).to_return(status: 200, body: "imagem", headers: { "Content-Type" => "image/png; charset=binary" })

        result = run("return downloadFile('#{file_url}');")

        expect(result).to include(
          "ok" => true, "id" => "anexo-1", "name" => "foto.png", "fileName" => "foto.png", "contentType" => "image/png", "size" => 6
        )
        expect(result["url"]).to match(%r{\Ahttp.*/rails/active_storage/blobs/proxy/abc/foto\.png\z})
        expect(@attachment.attributes).to include(private: true, organization: organization)
        expect(@attachment.file.attached[:io].read).to eq("imagem")
      end

      it "o nome vem do pedido, do Content-Disposition, da URL ou do tipo" do
        stub_request(:get, file_url).to_return(status: 200, body: "x", headers: { "Content-Disposition" => 'attachment; filename="boleto.pdf"' })
        stub_request(:get, "https://cdn.exemplo.test/sem-extensao").to_return(status: 200, body: "x", headers: { "Content-Type" => "application/pdf" })

        expect(run("return downloadFile('#{file_url}', { fileName: 'meu.png' }).name;")).to eq("meu.png")
        expect(run("return downloadFile('#{file_url}').name;")).to eq("boleto.pdf")
        expect(run("return downloadFile('https://cdn.exemplo.test/sem-extensao').name;")).to eq("downloaded_file.pdf")
      end

      it "erro do servidor não vira anexo" do
        stub_request(:get, file_url).to_return(status: 404)

        expect(run("return downloadFile('#{file_url}');")).to include("ok" => false, "status" => 404)
        expect(attachment_class).not_to have_received(:new)
      end

      it "não baixa de dentro da rede" do
        expect(run("return downloadFile('http://169.254.169.254/latest/meta-data/');")).to include("ok" => false, "status" => 403)
      end

      it "tem teto de tamanho" do
        stub_const("MiniRacerEngine::Limits::MAX_DOWNLOAD_BYTES", 10)
        stub_request(:get, file_url).to_return(status: 200, body: "x" * 20)

        expect(run("return downloadFile('#{file_url}');")).to include("ok" => false, "status" => 413)
      end

      it "conta na cota de rede" do
        stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 0)

        expect { run("downloadFile('#{file_url}');") }.to raise_error(MiniRacer::RuntimeError, /network calls/)
      end

      it "sem organização, falha fechado" do
        session_worker = MiniRacerEngine::Worker.new(script_session)

        expect(session_worker.perform("return downloadFile('#{file_url}');").result)
          .to include("ok" => false, "error" => "No organization in context")
      end
    end

    # Só existe depois de juntar com o domínio inbox: é aí que `Attachment` aparece.
    context "com o `Attachment` de verdade", if: Media::AttachmentLookup.available? do
      it "grava o arquivo no Active Storage" do
        stub_request(:get, file_url).to_return(status: 200, body: "imagem", headers: { "Content-Type" => "image/png" })

        result = run("return downloadFile('#{file_url}');")
        attachment = Attachment.find_by(id: result["id"], organization_id: organization.id)

        expect(attachment).to be_private
        expect(attachment.file.download).to eq("imagem")
      end
    end
  end
end
