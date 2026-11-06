# frozen_string_literal: true

require "rails_helper"

# Specs do bridge de Web APIs / Node APIs expostas ao JS:
# atob/btoa, TextEncoder/TextDecoder, URL/URLSearchParams, structuredClone,
# crypto (randomUUID, randomBytes, createHash, createHmac), sleep.
RSpec.describe "MiniRacerEngine WebApis bridge" do
  let(:worker) { MiniRacerEngine::Worker.new(script_session) }

  describe "Base64 (atob / btoa)" do
    it "btoa codifica string em base64" do
      result = worker.perform("return btoa('Vekoo 2026');").result
      expect(result).to eq(Base64.strict_encode64("Vekoo 2026"))
    end

    it "atob decodifica base64 → string" do
      encoded = Base64.strict_encode64("hello world")
      result = worker.perform("return atob('#{encoded}');").result
      expect(result).to eq("hello world")
    end

    it "roundtrip btoa(atob(x)) === x" do
      original = Base64.strict_encode64("payload arbitrário")
      result = worker.perform("return btoa(atob('#{original}'));").result
      expect(result).to eq(original)
    end

    it "texto com acento vai e volta, e usa os bytes UTF-8 (Basic Auth)" do
      expect(worker.perform("return atob(btoa('usuário:senhã'));").result).to eq("usuário:senhã")
      expect(worker.perform("return btoa('não');").result).to eq(Base64.strict_encode64("não"))
    end

    it "atob recusa o que não é base64, com a mensagem" do
      expect { worker.perform("return atob('@@@');") }.to raise_error(MiniRacer::RuntimeError, /InvalidCharacterError/)
    end

    it "bytes que não são texto não derrubam o atob" do
      encoded = Base64.strict_encode64("\xFF\xFEabc".b)

      expect(worker.perform("return atob('#{encoded}');").result).to end_with("abc")
    end
  end

  describe "TextEncoder / TextDecoder" do
    it "codifica/decodifica UTF-8 corretamente" do
      result = worker.perform(<<~JS).result
        const enc = new TextEncoder();
        const bytes = enc.encode('Olá mundo 🚀');
        const dec = new TextDecoder();
        return {
          encoding: enc.encoding,
          length: bytes.length,
          isUint8Array: bytes instanceof Uint8Array,
          decoded: dec.decode(bytes)
        };
      JS

      expect(result["encoding"]).to eq("utf-8")
      expect(result["decoded"]).to eq("Olá mundo 🚀")
      expect(result["isUint8Array"]).to be true
      expect(result["length"]).to eq("Olá mundo 🚀".bytesize)
    end

    it "TextDecoder rejeita encoding não-UTF8" do
      expect do
        worker.perform("new TextDecoder('latin1');")
      end.to raise_error(MiniRacer::RuntimeError, /utf-8/i)
    end

    it "TextDecoder não derruba com byte inválido" do
      expect(worker.perform("return new TextDecoder().decode(new Uint8Array([255, 97]));").result).to end_with("a")
    end
  end

  describe "URL / URLSearchParams" do
    it "parseia URL básica em componentes" do
      result = worker.perform(<<~JS).result
        const u = new URL('https://user:pass@api.exemplo.com.br:8443/v1/users?role=admin&active=true#top');
        return {
          protocol: u.protocol,
          username: u.username,
          password: u.password,
          hostname: u.hostname,
          port: u.port,
          pathname: u.pathname,
          hash: u.hash,
          origin: u.origin,
          searchAdmin: u.searchParams.get('role'),
          hasActive: u.searchParams.has('active')
        };
      JS

      expect(result).to include(
        "protocol" => "https:",
        "username" => "user",
        "password" => "pass",
        "hostname" => "api.exemplo.com.br",
        "port" => "8443",
        "pathname" => "/v1/users",
        "hash" => "#top",
        "origin" => "https://api.exemplo.com.br:8443",
        "searchAdmin" => "admin",
        "hasActive" => true
      )
    end

    it "URL com base relativa" do
      result = worker.perform(<<~JS).result
        const u = new URL('/posts/1', 'https://api.example.com');
        return u.href;
      JS

      expect(result).to eq("https://api.example.com/posts/1")
    end

    it "URLSearchParams aceita objeto e gera querystring" do
      result = worker.perform(<<~JS).result
        const p = new URLSearchParams({ name: 'João', age: 30, city: 'São Paulo' });
        return p.toString();
      JS

      decoded = URI.decode_www_form(result).to_h
      expect(decoded).to eq("name" => "João", "age" => "30", "city" => "São Paulo")
    end

    it "URLSearchParams set substitui valor existente" do
      result = worker.perform(<<~JS).result
        const p = new URLSearchParams('a=1&a=2&b=3');
        p.set('a', '99');
        return { getAllA: p.getAll('a'), str: p.toString() };
      JS

      expect(result["getAllA"]).to eq([ "99" ])
      expect(result["str"]).to include("a=99")
    end

    it "URL inválida lança TypeError" do
      expect do
        worker.perform("new URL(':::não é url:::');")
      end.to raise_error(MiniRacer::RuntimeError, /Invalid URL/i)
    end

    # Na origem faltava um `return`, e isto devolvia uma URL em branco.
    it "URL sem esquema ou host também lança" do
      expect { worker.perform("new URL('so-um-caminho');") }.to raise_error(MiniRacer::RuntimeError, /Invalid URL/i)
    end

    it "base inválida também lança" do
      expect { worker.perform("new URL('/a', 'nao-absoluta');") }.to raise_error(MiniRacer::RuntimeError, /Invalid URL/i)
    end

    it "serializa como o href" do
      expect(worker.perform("return JSON.stringify({ u: new URL('https://a.com/b') });").result).to eq('{"u":"https://a.com/b"}')
    end
  end

  describe "structuredClone" do
    it "clona objeto aninhado profundamente" do
      result = worker.perform(<<~JS).result
        const original = { a: 1, nested: { items: [1, 2, 3] } };
        const cloned = structuredClone(original);
        cloned.nested.items.push(4);
        return {
          originalLen: original.nested.items.length,
          clonedLen: cloned.nested.items.length,
          sameRef: original.nested === cloned.nested
        };
      JS

      expect(result).to eq(
        "originalLen" => 3,
        "clonedLen" => 4,
        "sameRef" => false
      )
    end
  end

  describe "crypto.randomUUID" do
    it "gera UUID v4 válido" do
      result = worker.perform("return crypto.randomUUID();").result
      expect(result).to match(/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i)
    end

    it "gera UUIDs distintos em chamadas consecutivas" do
      result = worker.perform(<<~JS).result
        return [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      JS

      expect(result.uniq.size).to eq(3)
    end
  end

  describe "crypto.randomBytes" do
    it "gera buffer do tamanho pedido com toString(hex)" do
      result = worker.perform(<<~JS).result
        const buf = crypto.randomBytes(16);
        return { len: buf.length, hexLen: buf.toString('hex').length };
      JS

      expect(result).to eq("len" => 16, "hexLen" => 32)
    end

    # Na origem os bytes acima de 127 viravam 2 bytes UTF-8 antes do base64.
    it "toString(base64) é dos bytes de verdade" do
      result = worker.perform("return crypto.randomBytes(64).toString('base64');").result

      expect(Base64.strict_decode64(result).bytesize).to eq(64)
    end

    it "rejeita tamanho negativo" do
      expect do
        worker.perform("crypto.randomBytes(-1);")
      end.to raise_error(MiniRacer::RuntimeError, />= 0/)
    end

    it "tem teto" do
      expect { worker.perform("crypto.randomBytes(1e6);") }.to raise_error(MiniRacer::RuntimeError, /limit/)
    end
  end

  describe "crypto.getRandomValues" do
    it "preenche Uint8Array fornecido" do
      result = worker.perform(<<~JS).result
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        // Probabilidade ~1/2^64 de todos zerados — efetivamente nula.
        return { len: arr.length, allZero: Array.from(arr).every(b => b === 0) };
      JS

      expect(result["len"]).to eq(8)
      expect(result["allZero"]).to be false
    end
  end

  describe "crypto.createHash" do
    it "sha256 hex de uma string" do
      result = worker.perform(<<~JS).result
        return crypto.createHash('sha256').update('hello world').digest('hex');
      JS

      expect(result).to eq(Digest::SHA256.hexdigest("hello world"))
    end

    it "sha256 base64" do
      result = worker.perform(<<~JS).result
        return crypto.createHash('sha256').update('vekoo').digest('base64');
      JS

      expect(result).to eq(Base64.strict_encode64(Digest::SHA256.digest("vekoo")))
    end

    it "aceita updates encadeados" do
      result = worker.perform(<<~JS).result
        return crypto.createHash('sha256').update('hello ').update('world').digest('hex');
      JS

      expect(result).to eq(Digest::SHA256.hexdigest("hello world"))
    end

    it "texto com acento usa os bytes UTF-8" do
      expect(worker.perform("return crypto.createHash('md5').update('não').digest('hex');").result)
        .to eq(Digest::MD5.hexdigest("não"))
    end

    it "md5, sha1, sha384, sha512 todos suportados" do
      result = worker.perform(<<~JS).result
        return {
          md5: crypto.createHash('md5').update('x').digest('hex'),
          sha1: crypto.createHash('sha1').update('x').digest('hex'),
          sha384: crypto.createHash('sha384').update('x').digest('hex'),
          sha512: crypto.createHash('sha512').update('x').digest('hex')
        };
      JS

      expect(result["md5"]).to    eq(Digest::MD5.hexdigest("x"))
      expect(result["sha1"]).to   eq(Digest::SHA1.hexdigest("x"))
      expect(result["sha384"]).to eq(Digest::SHA384.hexdigest("x"))
      expect(result["sha512"]).to eq(Digest::SHA512.hexdigest("x"))
    end

    it "rejeita algoritmo desconhecido" do
      expect do
        worker.perform("crypto.createHash('blake3').update('x').digest('hex');")
      end.to raise_error(MiniRacer::RuntimeError, /unsupported hash algorithm/i)
    end

    it "rejeita encoding desconhecido" do
      expect { worker.perform("crypto.createHash('md5').update('x').digest('latin1');") }
        .to raise_error(MiniRacer::RuntimeError, /unsupported encoding/i)
    end
  end

  describe "crypto.createHmac" do
    it "HMAC-SHA256 hex bate com OpenSSL Ruby" do
      key = "segredo"
      payload = '{"user":1}'

      result = worker.perform(<<~JS).result
        return crypto.createHmac('sha256', '#{key}').update('#{payload}').digest('hex');
      JS

      expect(result).to eq(OpenSSL::HMAC.hexdigest("sha256", key, payload))
    end

    it "HMAC com chave longa funciona" do
      key = SecureRandom.hex(64)
      payload = "webhook event payload"

      result = worker.perform(<<~JS).result
        return crypto.createHmac('sha256', '#{key}').update('#{payload}').digest('base64');
      JS

      expected = Base64.strict_encode64(OpenSSL::HMAC.digest("sha256", key, payload))
      expect(result).to eq(expected)
    end

    it "rejeita chamada sem key" do
      expect do
        worker.perform("crypto.createHmac('sha256', null);")
      end.to raise_error(MiniRacer::RuntimeError, /key is required/i)
    end
  end

  describe "sleep síncrono" do
    it "bloqueia a thread JS pelo tempo solicitado" do
      elapsed_ms = elapsed_seconds { worker.perform("sleep(120); return null;") } * 1000

      expect(elapsed_ms).to be >= 100  # margem de jitter
      expect(elapsed_ms).to be < 1000  # não deve travar muito além
    end

    it "tem cap de segurança em 30s (sleep(60000) → ~30s, não 60s)" do
      # Verifica o cap sem realmente esperar — stub direto no módulo.
      worker_module = MiniRacerEngine::Workers::WebApis.new
      expect(Kernel).to receive(:sleep).with(30.0)
      worker_module.send(:sleep_ms, 60_000)
    end

    it "sleep(0) não bloqueia" do
      expect(elapsed_seconds { worker.perform("sleep(0); return null;") } * 1000).to be < 500
    end

    it "sleep negativo ou inválido não bloqueia" do
      expect(elapsed_seconds { worker.perform("sleep(-5); sleep('x'); return null;") } * 1000).to be < 500
    end
  end

  describe "Intl (V8 nativo — apenas confirma disponibilidade)" do
    it "Intl.NumberFormat funciona" do
      result = worker.perform(<<~JS).result
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(1234.5);
      JS

      expect(result).to match(/R\$.*1.234,50/)
    end

    it "Intl.DateTimeFormat funciona" do
      result = worker.perform(<<~JS).result
        const d = new Date('2026-03-15T10:00:00Z');
        return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZone: 'UTC' }).format(d);
      JS

      expect(result).to match(%r{3/15/26|3/15/2026})
    end
  end
end
