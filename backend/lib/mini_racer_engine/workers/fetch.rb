module MiniRacerEngine::Workers
  # `fetch()`, `request()` e `downloadFile()`. Toda saída de rede passa por `SafeHttp`: o
  # script escreve a URL, então sem isso ele alcançaria o que só o servidor alcança.
  #
  # Na origem era `HTTParty.send(method.to_sym, url, ...)`, com `method` vindo do script: além
  # do SSRF, o script escolhia o método Ruby a chamar (`load`, `send`...).
  class Fetch < MiniRacerEngine::EngineModule
    Limits = MiniRacerEngine::Limits

    # O evento vai para log e para tela. Script manda credencial nestes cabeçalhos.
    SENSITIVE_HEADERS = %w[authorization cookie proxy-authorization x-api-key api-key x-auth-token].freeze

    # Bootstrap do `fetch()` Web-fetch-like. Reusa __nativeRequest (síncrono). Como o HTTP
    # termina antes de a Promise ser criada, `Promise.resolve(...)` produz uma Promise já
    # resolvida, e todas as microtasks (`await fetch(...)`, `await res.json()`, etc.) drenam
    # antes do `eval` voltar.
    #
    # Limitações deliberadas:
    # - setTimeout/setInterval não existem (V8 sem event loop).
    # - Promise.all funciona logicamente, mas execução é sequencial (única thread Ruby).
    FETCH_BOOTSTRAP_JS = <<~'JS'.freeze
      (function() {
        function buildHeaders(raw) {
          const map = {};
          if (raw && typeof raw === 'object') {
            for (const k of Object.keys(raw)) {
              const v = raw[k];
              // Os cabeçalhos vêm como array de strings; flatten pra string única.
              map[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
            }
          }
          return {
            get: (name) => {
              const v = map[String(name).toLowerCase()];
              return v == null ? null : v;
            },
            has: (name) => Object.prototype.hasOwnProperty.call(map, String(name).toLowerCase()),
            entries: () => Object.entries(map),
            keys: () => Object.keys(map),
            values: () => Object.values(map),
            toJSON: () => map
          };
        }

        function buildResponse(raw) {
          const status = (raw && typeof raw.status === 'number') ? raw.status : 0;
          const ok = (raw && typeof raw.ok === 'boolean') ? raw.ok : (status >= 200 && status < 300);
          const body = raw ? raw.body : null;
          const headers = buildHeaders(raw && raw.headers);

          return {
            ok: ok,
            status: status,
            statusText: '',
            headers: headers,
            url: (raw && raw.url) || '',
            error: raw ? raw.error : undefined,
            _raw: raw,
            text: function() {
              if (body == null) return Promise.resolve('');
              if (typeof body === 'string') return Promise.resolve(body);
              try { return Promise.resolve(JSON.stringify(body)); }
              catch (e) { return Promise.resolve(String(body)); }
            },
            json: function() {
              if (body == null) return Promise.resolve(null);
              if (typeof body === 'string') {
                try { return Promise.resolve(JSON.parse(body)); }
                catch (e) { return Promise.reject(new SyntaxError('Unexpected token in JSON: ' + e.message)); }
              }
              return Promise.resolve(body);
            }
          };
        }

        globalThis.fetch = function(url, options) {
          if (typeof url !== 'string' || url.length === 0) {
            return Promise.reject(new TypeError("Failed to fetch: 'url' is required and must be a string"));
          }
          const opts = options || {};
          const payload = {
            method: opts.method,
            headers: opts.headers,
            body: opts.body,
            handle_url: opts.handle_url || opts.handleUrl,
            preserve_header_case: opts.preserve_header_case || opts.preserveHeaderCase
          };
          try {
            const raw = __nativeRequest(url, payload);
            return Promise.resolve(buildResponse(raw));
          } catch (e) {
            return Promise.reject(e);
          }
        };
      })();
    JS

    def register(worker, context, event)
      @worker = worker
      context.attach("request", proc { |*params| network_call(:request, :request, params, event) })
      context.attach("downloadFile", proc { |*params| network_call(:download_file, :download_file, params, event) })
      # Bridge interno consumido por globalThis.fetch. Emite evento `:fetch` (não
      # `:__native_request`) pra que a tela exiba a requisição igual ao `request()` legado.
      context.attach("__nativeRequest", proc { |*params| network_call(:fetch, :request, params, event) })
    end

    def bootstrap_js
      FETCH_BOOTSTRAP_JS
    end

    private

    # A cota é cobrada aqui, e não no `fetch` do JS: o script chama `__nativeRequest` direto
    # se quiser. Estourar levanta, e não vira um `ok: false`, para o laço de quem ignora
    # resposta não seguir batendo.
    def network_call(event_name, handler, params, event)
      budget&.charge_call!(event_name)
      budget&.charge_fetch!

      # Sem o `to_js` na entrada: o corpo pode ser binário de propósito (`Uint8Array`).
      input = MiniRacerEngine::Values.from_js(params)
      output = MiniRacerEngine::Values.to_js(guarded(event_name) { send(handler, input) })
      emit_event(event, event_name, input: MiniRacerEngine::Values.to_js(redacted(input)), output: output)
      output
    end

    def redacted(input)
      url, params = input
      return input unless params.is_a?(Hash) && params["headers"].is_a?(Hash)

      headers = params["headers"].to_h do |name, value|
        [ name, SENSITIVE_HEADERS.include?(name.to_s.downcase) ? "[FILTERED]" : value ]
      end
      [ url, params.merge("headers" => headers) ]
    end

    def request(options)
      url, params = options
      return { status: 500, ok: false, error: "Missing url" } if url.blank?

      params = {} unless params.is_a?(Hash)

      fetch(
        url.to_s,
        method: params["method"].presence&.to_s || "get",
        headers: params["headers"].is_a?(Hash) ? params["headers"] : {},
        body: params["body"],
        handle_url: params["handle_url"] || params["handleUrl"],
        preserve_header_case: params["preserve_header_case"] || params["preserveHeaderCase"]
      )
    end

    def fetch(url, method: "get", headers: {}, body: nil, handle_url: false, preserve_header_case: false)
      url = url.unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, "") if handle_url

      response = SafeHttp.request(
        url,
        method: method,
        headers: headers,
        body: encoded_body(body),
        exact_header_case: preserve_header_case.present?,
        max_bytes: budget&.response_bytes_left || Limits::MAX_RESPONSE_BYTES,
        **http_limits(Limits::FETCH_TIMEOUT_SECONDS)
      )
      budget&.charge_response_bytes!(response.body.bytesize)

      {
        status: response.status,
        ok: response.success?,
        body: parsed_body(response),
        headers: response.headers,
        url: response.url
      }
    rescue StandardError => e
      network_error(e)
    end

    # Nunca o motivo da recusa de destino: "resolve para interno" ou "não resolve" é um
    # mapa da rede. Devolve Hash, nunca String: a origem devolvia JSON em texto no erro, e
    # `res.status` ficava `undefined`.
    def network_error(error)
      case error
      when SafeHttp::DestinationRefused then { status: 403, ok: false, error: "Destination not allowed" }
      when SafeHttp::TooLarge then { status: 413, ok: false, error: "Response too large" }
      when SafeHttp::TimedOut then { status: 504, ok: false, error: "Request timed out" }
      when SafeHttp::Refused then { status: 400, ok: false, error: "Request refused: #{error.message}" }
      else { status: 500, ok: false, error: error.message }
      end
    end

    def http_limits(timeout)
      total = [ timeout, budget&.remaining_seconds || timeout ].min
      # 0 em `Timeout.timeout` quer dizer "sem limite".
      total = [ total, 0.01 ].max

      {
        ports: Limits::FETCH_PORTS,
        max_redirects: Limits::MAX_REDIRECTS,
        total_timeout: total,
        open_timeout: [ total, SafeHttp::OPEN_TIMEOUT ].min,
        read_timeout: total
      }
    end

    # Como o HTTParty fazia: objeto vira formulário, e o Net::HTTP dá o Content-Type.
    def encoded_body(body)
      case body
      when nil then nil
      when Hash then HTTParty::HashConversions.to_params(body)
      else body.to_s
      end
    end

    # O mesmo `parsed_response` do HTTParty, que é o contrato de quem escreve script: JSON e
    # XML viram objeto, CSV vira lista e o resto fica texto. Corpo que diz ser JSON e não é
    # continua legível, em vez de virar erro de rede.
    def parsed_body(response)
      text = decoded_text(response)
      format = HTTParty::Parser.format_from_mimetype(response.content_type)
      HTTParty::Parser.call(text, format)
    rescue JSON::ParserError, MultiXml::ParseError, CSV::MalformedCSVError
      text
    end

    # O Net::HTTP entrega bytes, e o V8 trocaria o que não for UTF-8 por U+FFFD.
    def decoded_text(response)
      encoding = response.charset && Encoding.find(response.charset)
      return response.body.dup.force_encoding(Encoding::UTF_8).scrub if encoding.nil? || encoding == Encoding::UTF_8

      response.body.dup.force_encoding(encoding).encode(Encoding::UTF_8, invalid: :replace, undef: :replace)
    rescue ArgumentError, Encoding::ConverterNotFoundError
      response.body.dup.force_encoding(Encoding::UTF_8).scrub
    end

    # ── Download File ──────────────────────────────────────────────────

    # Guarda o arquivo como anexo privado da organização. `Attachment` é do domínio inbox:
    # enquanto não existir, responde 501 (`Media::AttachmentLookup`).
    def download_file(options)
      url, params = options
      return { ok: false, status: 400, error: "Missing url" } if url.blank?
      return { ok: false, status: 400, error: "No organization in context" } if organization.nil?
      return { ok: false, status: 501, error: "Attachments are not available" } unless Media::AttachmentLookup.available?

      params = {} unless params.is_a?(Hash)

      response = SafeHttp.request(
        url.to_s,
        method: params["method"].presence&.to_s || "get",
        headers: params["headers"].is_a?(Hash) ? params["headers"] : {},
        body: encoded_body(params["body"]),
        max_bytes: Limits::MAX_DOWNLOAD_BYTES,
        **http_limits(Limits::DOWNLOAD_TIMEOUT_SECONDS)
      )

      unless response.success?
        return { ok: false, status: response.status, error: "Download failed: HTTP #{response.status}" }
      end

      store_download(response, params, url.to_s)
    rescue StandardError => e
      network_error(e)
    end

    def store_download(response, params, url)
      content_type = response.content_type.presence || "application/octet-stream"
      file_name = resolve_filename(params, response, url, content_type)

      attachment = ::Attachment.new(name: file_name, private: true, organization: organization)
      attachment.file.attach(io: StringIO.new(response.body), filename: file_name, content_type: content_type)
      attachment.save!

      {
        ok: true,
        id: attachment.id.to_s,
        url: Media::Storage.public_url(attachment.file_url),
        name: attachment.name,
        fileName: attachment.file_name,
        contentType: content_type,
        size: response.body.bytesize
      }
    end

    def resolve_filename(params, response, url, content_type)
      # 1) Explicit fileName from params
      explicit = params["fileName"].presence || params["file_name"].presence
      return explicit.to_s if explicit

      # 2) Content-Disposition header
      disposition = response.headers.fetch("content-disposition", []).first
      if disposition
        match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i)
        return CGI.unescape(match[1].strip) if match
      end

      # 3) Basename from URL (strip query string)
      path = URI.parse(url).path
      basename = File.basename(path) if path.present?
      return basename if basename.present? && basename.include?(".")

      # 4) Fallback with extension from content_type
      ext = Rack::Mime::MIME_TYPES.invert[content_type] || ""
      "downloaded_file#{ext}"
    rescue URI::Error
      "downloaded_file"
    end
  end
end
