require "base64"
require "digest"
require "openssl"
require "securerandom"
require "uri"
require "cgi"

module MiniRacerEngine::Workers
  # Bridges Ruby para Web APIs / Node APIs que o V8 puro do MiniRacer não expõe:
  # atob, btoa, TextEncoder, TextDecoder, URL, URLSearchParams, structuredClone,
  # crypto (randomUUID, randomBytes, createHash, createHmac), sleep.
  #
  # O acoplamento é feito via funções `__nativeXxx` anexadas ao contexto;
  # `bootstrap_js` monta a fachada idiomática. São funções puras, sem chegar a dado nenhum,
  # e por isso não contam na cota de chamadas: `sleep` tem o limite dele.
  class WebApis < MiniRacerEngine::EngineModule
    SUPPORTED_HASH_ALGOS = %w[md5 sha1 sha256 sha384 sha512].freeze
    SUPPORTED_ENCODINGS  = %w[hex base64 base64url binary].freeze

    # Limite duro pra `sleep` — operações longas devem ir pra job, não
    # bloquear a thread do worker JS. 30s é folgado pra retries com backoff.
    MAX_SLEEP_SECONDS = MiniRacerEngine::Limits::MAX_SLEEP_SECONDS

    # O que uma função destas aceita. URL menor: `split` e `URI.parse` multiplicam o tamanho.
    MAX_ARGUMENT_BYTES = MiniRacerEngine::Values::MAX_STRING_BYTES
    MAX_URL_BYTES = 1.megabyte

    # Bootstrap das Web APIs ausentes no V8 puro. As funções `__nativeXxx` são providas por
    # `register`.
    WEB_APIS_BOOTSTRAP_JS = <<~'JS'.freeze
      (function() {
        // Bridges Ruby retornam um sentinela `{__racerJsError__: true, message}` em vez de
        // levantar exceção: exceção Ruby chega ao JS com a mensagem em Latin-1, e o valor de
        // retorno atravessa em UTF-8. Este helper converte em throw nativo.
        function __u(value) {
          if (value && typeof value === 'object' && value.__racerJsError__) {
            throw new Error(value.message);
          }
          return value;
        }

        // ── Base64 (atob / btoa) ────────────────────────────────────
        globalThis.btoa = function(input) { return __u(__nativeBase64Encode(String(input))); };
        globalThis.atob = function(input) { return __u(__nativeBase64Decode(String(input))); };

        // ── TextEncoder / TextDecoder ───────────────────────────────
        // API simplificada: encode(string) → Uint8Array; decode(Uint8Array|Array) → string.
        class TextEncoder {
          get encoding() { return 'utf-8'; }
          encode(input) {
            const bytes = __u(__nativeTextEncode(input == null ? '' : String(input)));
            return new Uint8Array(bytes);
          }
        }
        class TextDecoder {
          constructor(label) {
            const enc = (label || 'utf-8').toLowerCase();
            if (enc !== 'utf-8' && enc !== 'utf8') {
              throw new RangeError('Only utf-8 encoding is supported');
            }
          }
          get encoding() { return 'utf-8'; }
          decode(input) {
            if (input == null) return '';
            let arr;
            if (input instanceof Uint8Array) arr = Array.from(input);
            else if (Array.isArray(input)) arr = input;
            else if (input.buffer instanceof ArrayBuffer) arr = Array.from(new Uint8Array(input.buffer));
            else if (input instanceof ArrayBuffer) arr = Array.from(new Uint8Array(input));
            else throw new TypeError('TextDecoder: input must be a Uint8Array or ArrayBuffer');
            return __u(__nativeTextDecode(arr));
          }
        }
        globalThis.TextEncoder = TextEncoder;
        globalThis.TextDecoder = TextDecoder;

        // ── URLSearchParams ────────────────────────────────────────
        class URLSearchParams {
          constructor(init) {
            this._pairs = [];
            if (init == null) return;

            if (typeof init === 'string') {
              const decoded = __u(__nativeQueryDecode(init));
              for (const pair of decoded) this._pairs.push([String(pair[0]), String(pair[1])]);
            } else if (Array.isArray(init)) {
              for (const pair of init) {
                if (!Array.isArray(pair) || pair.length !== 2) {
                  throw new TypeError('URLSearchParams: each entry must be [key, value]');
                }
                this._pairs.push([String(pair[0]), String(pair[1])]);
              }
            } else if (typeof init === 'object') {
              for (const key of Object.keys(init)) {
                this._pairs.push([String(key), String(init[key])]);
              }
            }
          }
          get(name) {
            const found = this._pairs.find(p => p[0] === name);
            return found ? found[1] : null;
          }
          getAll(name) { return this._pairs.filter(p => p[0] === name).map(p => p[1]); }
          has(name)    { return this._pairs.some(p => p[0] === name); }
          set(name, value) {
            const filtered = this._pairs.filter(p => p[0] !== name);
            filtered.push([String(name), String(value)]);
            this._pairs = filtered;
          }
          append(name, value) { this._pairs.push([String(name), String(value)]); }
          delete(name) { this._pairs = this._pairs.filter(p => p[0] !== name); }
          entries()    { return this._pairs.map(p => [p[0], p[1]]); }
          keys()       { return this._pairs.map(p => p[0]); }
          values()     { return this._pairs.map(p => p[1]); }
          forEach(fn)  { for (const p of this._pairs) fn(p[1], p[0], this); }
          toString()   { return __u(__nativeQueryEncode(this._pairs)); }
          get size()   { return this._pairs.length; }
        }
        globalThis.URLSearchParams = URLSearchParams;

        // ── URL ────────────────────────────────────────────────────
        class URL {
          constructor(input, base) {
            const parsed = __u(__nativeUrlParse([String(input), base == null ? null : String(base)]));
            this._href     = parsed.href;
            this._protocol = parsed.protocol;
            this._username = parsed.username;
            this._password = parsed.password;
            this._host     = parsed.host;
            this._hostname = parsed.hostname;
            this._port     = parsed.port;
            this._pathname = parsed.pathname;
            this._search   = parsed.search;
            this._hash     = parsed.hash;
            this._origin   = parsed.origin;
            this._searchParams = new URLSearchParams(parsed.search || '');
          }
          get href()     { return this._rebuild(); }
          get origin()   { return this._origin; }
          get protocol() { return this._protocol; }
          set protocol(v) { this._protocol = String(v); }
          get username() { return this._username; }
          set username(v) { this._username = String(v); }
          get password() { return this._password; }
          set password(v) { this._password = String(v); }
          get host()     { return this._host; }
          set host(v)    { this._host = String(v); }
          get hostname() { return this._hostname; }
          set hostname(v) { this._hostname = String(v); }
          get port()     { return this._port; }
          set port(v)    { this._port = String(v); }
          get pathname() { return this._pathname; }
          set pathname(v) { this._pathname = String(v); }
          get search()   { return '?' + this._searchParams.toString() === '?' ? '' : '?' + this._searchParams.toString(); }
          set search(v)  {
            const s = String(v || '');
            this._searchParams = new URLSearchParams(s.replace(/^\?/, ''));
          }
          get hash()     { return this._hash; }
          set hash(v)    {
            const h = String(v || '');
            this._hash = h && !h.startsWith('#') ? ('#' + h) : h;
          }
          get searchParams() { return this._searchParams; }
          toString()     { return this._rebuild(); }
          toJSON()       { return this._rebuild(); }

          _rebuild() {
            const qs = this._searchParams.toString();
            return __u(__nativeUrlBuild({
              protocol: this._protocol,
              username: this._username,
              password: this._password,
              hostname: this._hostname,
              port: this._port,
              pathname: this._pathname,
              search: qs ? ('?' + qs) : '',
              hash: this._hash
            }));
          }
        }
        globalThis.URL = URL;

        // ── structuredClone (polyfill via JSON deep clone) ─────────
        // Suficiente para a maioria dos casos em automações; não suporta
        // Date, Map, Set, RegExp, ArrayBuffer ou ciclos (limitação documentada).
        globalThis.structuredClone = function(value) {
          if (value === undefined) return undefined;
          return JSON.parse(JSON.stringify(value));
        };

        // ── sleep síncrono ──────────────────────────────────────────
        // Bloqueia a thread JS por até 30s (cap em Ruby), e nunca além do prazo da execução.
        // Útil pra retry/backoff.
        globalThis.sleep = function(ms) {
          __u(__nativeSleep(Number(ms) || 0));
        };

        // ── crypto ──────────────────────────────────────────────────
        function hashBuilder(algorithm, keyOrNull) {
          let buffer = '';
          return {
            update(data) {
              if (data == null) return this;
              buffer += (typeof data === 'string') ? data : String(data);
              return this;
            },
            digest(encoding) {
              const enc = encoding || 'hex';
              if (keyOrNull == null) return __u(__nativeHash([algorithm, buffer, enc]));
              return __u(__nativeHmac([algorithm, keyOrNull, buffer, enc]));
            }
          };
        }

        globalThis.crypto = {
          randomUUID: function() { return __nativeUuid(); },
          randomBytes: function(n) {
            const bytes = __u(__nativeRandomBytes(Number(n) || 0));
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes[i];
            // Espelha a API Node: .toString('hex'/'base64') no resultado.
            arr.toString = function(encoding) {
              if (!encoding) return Uint8Array.prototype.toString.call(this);
              const list = Array.from(this);
              if (encoding === 'hex')    return list.map(b => b.toString(16).padStart(2, '0')).join('');
              if (encoding === 'base64') return __u(__nativeBase64EncodeBytes(list));
              if (encoding === 'utf8' || encoding === 'utf-8') return __u(__nativeTextDecode(list));
              throw new TypeError('Unknown encoding: ' + encoding);
            };
            return arr;
          },
          getRandomValues: function(typedArray) {
            if (!(typedArray instanceof Uint8Array)) {
              throw new TypeError('getRandomValues: only Uint8Array is supported');
            }
            const bytes = __u(__nativeRandomBytes(typedArray.length));
            for (let i = 0; i < typedArray.length; i++) typedArray[i] = bytes[i];
            return typedArray;
          },
          createHash: function(algorithm) { return hashBuilder(algorithm, null); },
          createHmac: function(algorithm, key) {
            if (key == null) throw new TypeError('createHmac: key is required');
            return hashBuilder(algorithm, String(key));
          }
        };
      })();
    JS

    def register(worker, context, _event)
      @worker = worker

      # ── Base64 ────────────────────────────────────────────────────
      native(context, "__nativeBase64Encode") { |str| base64_encode(str) }
      native(context, "__nativeBase64EncodeBytes") { |bytes| base64_encode_bytes(bytes) }
      native(context, "__nativeBase64Decode") { |str| base64_decode(str) }

      # ── UTF-8 (TextEncoder/TextDecoder) ───────────────────────────
      native(context, "__nativeTextEncode") { |str| text_encode(str) }
      native(context, "__nativeTextDecode") { |bytes| text_decode(bytes) }

      # ── URL / URLSearchParams ─────────────────────────────────────
      native(context, "__nativeUrlParse", limit: MAX_URL_BYTES) { |args| url_parse(args) }
      native(context, "__nativeUrlBuild", limit: MAX_URL_BYTES) { |args| url_build(args) }
      native(context, "__nativeQueryEncode", limit: MAX_URL_BYTES) { |pairs| query_encode(pairs) }
      native(context, "__nativeQueryDecode", limit: MAX_URL_BYTES) { |str| query_decode(str) }

      # ── Crypto ────────────────────────────────────────────────────
      native(context, "__nativeUuid") { SecureRandom.uuid }
      native(context, "__nativeRandomBytes") { |n| random_bytes(n) }
      native(context, "__nativeHash") { |args| compute_hash(args) }
      native(context, "__nativeHmac") { |args| compute_hmac(args) }

      # ── Sleep ─────────────────────────────────────────────────────
      native(context, "__nativeSleep") do |ms|
        sleep_ms(ms)
        nil
      end
    end

    def bootstrap_js
      WEB_APIS_BOOTSTRAP_JS
    end

    private

    # O teto do argumento mora aqui, e não no JS: o script chama `__nativeQueryDecode` direto
    # se quiser. Sem ele, o limite do V8 não alcança o que acontece no Ruby:
    # `new URLSearchParams('a=1&'.repeat(2 ** 26))` chegava a 4,8 GB e 13 s, com o prazo em 3 s.
    def native(context, name, limit: MAX_ARGUMENT_BYTES, &handler)
      context.attach(name, proc { |*args|
        raise MiniRacerEngine::Error, "Arguments too large" if argument_size(args) > limit

        handler.call(*args)
      })
    end

    # As funções recebem no máximo uma lista de pares de texto. Mais fundo que isso só um
    # script chamando direto, e um array cíclico nunca terminaria.
    def argument_size(value, depth = 0)
      return Float::INFINITY if depth > 4

      case value
      when String then value.bytesize
      when Array
        return value.size if value.size > MAX_ARGUMENT_BYTES

        value.sum(value.size) { |item| item.is_a?(Numeric) ? 0 : argument_size(item, depth + 1) }
      when Hash then value.sum { |key, item| key.to_s.bytesize + argument_size(item, depth + 1) }
      else 0
      end
    end

    # ── Base64 ──────────────────────────────────────────────────────

    # Os bytes UTF-8 do texto, não Latin-1 como no navegador: é o que um `btoa('usuário:senha')`
    # precisa para Basic Auth, e o `atob` faz o caminho de volta.
    def base64_encode(str)
      return "" if str.nil?

      Base64.strict_encode64(str.to_s.b)
    rescue StandardError => e
      js_error("InvalidCharacterError: #{e.message}")
    end

    def base64_encode_bytes(bytes)
      Base64.strict_encode64(Array(bytes).map(&:to_i).pack("C*"))
    rescue StandardError => e
      js_error("InvalidCharacterError: #{e.message}")
    end

    def base64_decode(str)
      MiniRacerEngine::Values.utf8(Base64.strict_decode64(str.to_s))
    rescue ArgumentError => e
      js_error("InvalidCharacterError: #{e.message}")
    end

    # ── UTF-8 ───────────────────────────────────────────────────────

    def text_encode(str)
      # Retorna array de inteiros (0..255) — o JS embrulha em Uint8Array.
      str.to_s.encode("UTF-8").bytes
    end

    def text_decode(bytes)
      arr =
        case bytes
        when Array then bytes
        when Hash  then bytes.values
        else            bytes.to_a
        end

      MiniRacerEngine::Values.utf8(arr.map(&:to_i).pack("C*"))
    rescue StandardError => e
      js_error("TextDecoder: #{e.message}")
    end

    # ── URL ─────────────────────────────────────────────────────────

    def url_parse(args)
      input, base = Array(args)
      raw         = base ? URI.join(base.to_s, input.to_s).to_s : input.to_s
      uri         = URI.parse(raw)
      return js_error("TypeError: Invalid URL: '#{raw}'") if uri.scheme.nil? || uri.host.nil?

      port_str = explicit_port(uri)

      {
        href: uri.to_s,
        origin: build_origin(uri),
        protocol: uri.scheme ? "#{uri.scheme}:" : "",
        username: uri.user.to_s,
        password: uri.password.to_s,
        host: port_str.empty? ? uri.host.to_s : "#{uri.host}:#{port_str}",
        hostname: uri.host.to_s,
        port: port_str,
        pathname: uri.path.to_s.empty? ? "/" : uri.path,
        search: uri.query ? "?#{uri.query}" : "",
        hash: uri.fragment ? "##{uri.fragment}" : "",
        searchParams: parse_query(uri.query)
      }
    rescue URI::Error => e
      js_error("TypeError: Invalid URL: #{e.message}")
    end

    # Reconstrói a string da URL a partir de componentes editados em JS.
    def url_build(args)
      parts = args.is_a?(Hash) ? args : {}
      out = +""
      out << parts["protocol"].to_s.sub(/:$/, "") << ":" if parts["protocol"].to_s != ""
      authority = build_authority(parts)
      out << "//#{authority}" unless authority.empty?
      out << parts["pathname"].to_s
      search = parts["search"].to_s
      out << (search.start_with?("?") ? search : "?#{search}") if search != ""
      hash_part = parts["hash"].to_s
      out << (hash_part.start_with?("#") ? hash_part : "##{hash_part}") if hash_part != ""
      out
    end

    def query_encode(pairs)
      arr = Array(pairs)
      arr.map do |pair|
        k, v = Array(pair)
        "#{CGI.escape(k.to_s)}=#{CGI.escape(v.to_s)}"
      end.join("&")
    end

    def query_decode(str)
      parse_query(str.to_s.sub(/^\?/, ""))
    end

    # ── Crypto ──────────────────────────────────────────────────────

    def random_bytes(count)
      n = count.to_i
      return js_error("RangeError: byte length must be >= 0") if n.negative?
      return js_error("RangeError: byte length exceeds limit") if n > 65_536

      SecureRandom.random_bytes(n).bytes
    end

    def compute_hash(args)
      algorithm, data, encoding = Array(args)
      klass = digest_class(algorithm)
      return js_error("Error: unsupported hash algorithm: #{algorithm}") unless klass

      bytes = klass.digest(data.to_s)
      encode_bytes(bytes, encoding)
    end

    def compute_hmac(args)
      algorithm, key, data, encoding = Array(args)
      return js_error("Error: unsupported hash algorithm: #{algorithm}") unless digest_class(algorithm)

      bytes = OpenSSL::HMAC.digest(algorithm.to_s, key.to_s, data.to_s)
      encode_bytes(bytes, encoding)
    end

    # ── Sleep ───────────────────────────────────────────────────────

    # O `timeout` do V8 não interrompe um callback Ruby: sem o teto no prazo, um
    # `while (true) sleep(30000)` prenderia a thread 30 s além do limite da execução.
    def sleep_ms(ms)
      seconds = (ms.to_f / 1000.0).clamp(0.0, MAX_SLEEP_SECONDS)
      seconds = [ seconds, budget.remaining_seconds ].min if budget
      Kernel.sleep(seconds) if seconds.positive?
    end

    # ── Helpers ─────────────────────────────────────────────────────

    def digest_class(algorithm)
      algo = algorithm.to_s.downcase
      return nil unless SUPPORTED_HASH_ALGOS.include?(algo)

      case algo
      when "md5"    then Digest::MD5
      when "sha1"   then Digest::SHA1
      when "sha256" then Digest::SHA256
      when "sha384" then Digest::SHA384
      when "sha512" then Digest::SHA512
      end
    end

    def encode_bytes(bytes, encoding)
      enc = (encoding || "hex").to_s.downcase
      return js_error("Error: unsupported encoding: #{enc}") unless SUPPORTED_ENCODINGS.include?(enc)

      case enc
      when "hex"       then bytes.unpack1("H*")
      when "base64"    then Base64.strict_encode64(bytes)
      when "base64url" then Base64.urlsafe_encode64(bytes, padding: false)
      when "binary"    then bytes.bytes
      end
    end

    def parse_query(query)
      return [] if query.nil? || query.empty?

      query.to_s.split("&").reject(&:empty?).map do |pair|
        k, v = pair.split("=", 2)
        [ CGI.unescape(k.to_s), CGI.unescape(v.to_s) ]
      end
    end

    def build_origin(uri)
      return "" unless uri.scheme && uri.host

      if uri.port && uri.port != uri.default_port
        "#{uri.scheme}://#{uri.host}:#{uri.port}"
      else
        "#{uri.scheme}://#{uri.host}"
      end
    end

    def build_authority(parts)
      authority = +""
      user = parts["username"].to_s
      pass = parts["password"].to_s
      if user != "" || pass != ""
        authority << user
        authority << ":#{pass}" if pass != ""
        authority << "@"
      end
      authority << parts["hostname"].to_s
      port = parts["port"].to_s
      authority << ":#{port}" if port != ""
      authority
    end

    # Retorna a porta apenas quando explícita ou não-default do scheme.
    # URI.parse('https://x.com') popula uri.port=443 implicitamente — replicar
    # esse implícito quebra rebuild do URL ('https://x.com:443/...').
    def explicit_port(uri)
      return "" if uri.port.nil?
      return "" if uri.port == uri.default_port

      uri.port.to_s
    end

    # Exceção Ruby chega ao JS com a mensagem em Latin-1. Retornamos um sentinela que o
    # bootstrap JS transforma em `throw new Error(msg)`.
    def js_error(message)
      { "__racerJsError__" => true, "message" => message }
    end
  end
end
