module MiniRacerEngine
  # Executa um script. Um contexto V8 novo por execução: nada do script anterior sobrevive.
  #
  #   worker = MiniRacerEngine::Worker.new(session_context)
  #   worker.on_event { |name, payload| ... }
  #   worker.perform("return params.a + 1;", { a: 1 }).result # => 2
  #
  # Quem chama de um domínio deve preferir `MiniRacerService`, que monta o contexto certo.
  # Levanta `MiniRacer::Error` e subclasses: ver docs/migration/api/script-engine.md.
  class Worker < Base
    USER_FILE = "user-code.js".freeze
    INTERNAL_FILE = "racer-internal.js".freeze
    REAP_EVERY = 32
    DISPOSED_CONTEXTS = Concurrent::AtomicFixnum.new

    attr_reader :budget

    # Define `__traceCallerLine()` e captura a snapshot de chaves globais antes
    # dos módulos registrarem suas namespaces. Roda apenas quando `track_caller`
    # está ativo (a tela de testar script mostra a linha de cada chamada).
    CALLER_TRACE_FN_JS = <<~'JS'.freeze
      (function() {
        globalThis.__originalKeys__ = new Set(Object.getOwnPropertyNames(globalThis));

        globalThis.__extractCallerLine = function() {
          try {
            const stack = (new Error()).stack || '';
            const lines = stack.split('\n');
            for (let i = 1; i < lines.length; i++) {
              const m = lines[i].match(/user-code\.js:(\d+):\d+/);
              if (m) return parseInt(m[1], 10);
            }
          } catch (e) { /* ignore */ }
          return null;
        };

        globalThis.__traceCallerLine = function() {
          const line = __extractCallerLine();
          try { __setCallerLine(line); } catch (e) { /* ignore */ }
        };
      })();
    JS

    # Envelopa toda função recém-adicionada ao globalThis (e até 2 níveis de
    # nesting, p.ex. `kanban.getCard`) num proxy que dispara `__traceCallerLine`
    # antes de delegar. Rodado APÓS o registro dos módulos.
    CALLER_WRAP_GLOBALS_JS = <<~'JS'.freeze
      (function() {
        function makeWrapper(orig) {
          const wrapped = function() {
            __traceCallerLine();
            return orig.apply(this, arguments);
          };
          wrapped.__callerTracked = true;
          return wrapped;
        }

        function wrapObject(obj, depth) {
          if (depth > 2) return;
          for (const key of Object.getOwnPropertyNames(obj)) {
            if (key.startsWith('__')) continue;
            let val;
            try { val = obj[key]; } catch (e) { continue; }
            if (typeof val === 'function' && !val.__callerTracked) {
              try { obj[key] = makeWrapper(val); } catch (e) { /* read-only */ }
            } else if (typeof val === 'object' && val !== null && !val.__callerWalked) {
              try {
                Object.defineProperty(val, '__callerWalked', {
                  value: true, enumerable: false, configurable: true
                });
              } catch (e) { /* ignore */ }
              wrapObject(val, depth + 1);
            }
          }
        }

        const baseKeys = globalThis.__originalKeys__ || new Set();
        // `console` já existe no V8 antes de a extensão registrar os métodos dele.
        baseKeys.delete('console');
        for (const key of Object.getOwnPropertyNames(globalThis)) {
          if (baseKeys.has(key)) continue;
          if (key.startsWith('__')) continue;
          let val;
          try { val = globalThis[key]; } catch (e) { continue; }
          if (typeof val === 'function' && !val.__callerTracked) {
            try { globalThis[key] = makeWrapper(val); } catch (e) { /* ignore */ }
          } else if (typeof val === 'object' && val !== null) {
            wrapObject(val, 1);
          }
        }
      })();
    JS

    # Roda o script e devolve o desfecho a `__racerFinish`, um callback que o script não
    # alcança depois daqui. `then`, `JSON.stringify` e companhia são capturados antes do
    # script rodar, para ele não conseguir trocá-los por baixo do motor.
    #
    # O resultado sai em JSON, e AQUI DENTRO, por dois motivos:
    #
    #  - tudo que o script pode rodar (`toJSON`, getter, laço depois de um `await`) fica
    #    debaixo de um único `timeout`. Lido num segundo `eval`, como na origem, um getter
    #    `while (true) {}` ganhava um prazo inteiro a mais;
    #  - o que chega ao Ruby é sempre dado puro, sem Hash cíclico, `ScriptError` no meio do
    #    resultado ou texto em bytes UTF-16, que explodiriam depois em quem grava.
    RUNNER_JS = <<~'JS'.freeze
      (function (params, maxResultChars) {
        const finish = globalThis.__racerFinish;
        delete globalThis.__racerFinish;

        const then = Promise.prototype.then;
        const apply = Reflect.apply;
        const stringify = JSON.stringify;
        const toText = String;
        const fromEntries = Object.fromEntries;
        const toArray = Array.from;
        const toWellFormed = String.prototype.toWellFormed;
        const slice = String.prototype.slice;
        const NativeMap = Map;
        const NativeSet = Set;

        function replacer(key, value) {
          // Meio emoji: o JSON do Ruby recusaria o resultado inteiro por causa dele.
          if (typeof value === 'string') return apply(toWellFormed, value, []);
          if (typeof value === 'bigint') return toText(value);
          if (value instanceof NativeMap) return fromEntries(value);
          if (value instanceof NativeSet) return toArray(value);
          return value;
        }

        function fail(error) {
          let text;
          try {
            text = (error && error.stack) ? toText(error.stack) : toText(error);
          } catch (e) {
            text = 'Script failed with an unprintable error';
          }
          finish(false, apply(slice, text, [0, 10000]));
        }

        function succeed(value) {
          try {
            const json = stringify(value, replacer);
            if (json !== undefined && json.length > maxResultChars) {
              throw new RangeError('Script result exceeds the limit of ' + maxResultChars + ' characters');
            }
            finish(true, json === undefined ? 'null' : json);
          } catch (e) {
            fail(e);
          }
        }

        apply(then, onMessage(params), [succeed, fail]);
      })
    JS

    def on_event(&block)
      @event = block
    end

    # @param code      corpo de uma `async function onMessage(params)`
    # @param params    o `params` do script; precisa virar JSON
    # @param timeout_ms    tempo total; nil usa o padrão, e o máximo é `Limits::MAX_TIMEOUT_MS`
    # @param max_memory    heap do V8, em bytes; nil usa o padrão, e o máximo é `Limits::MAX_MEMORY`
    # @param track_caller  acrescenta `caller_line` aos eventos
    # @return [Response]
    def perform(code, params = {}, track_caller: false, timeout_ms: nil, max_memory: nil)
      @context.validate!
      @caller_line = nil
      @budget = Budget.new(timeout_ms: timeout_ms)
      outcome = nil
      context = nil

      begin
        context = ::MiniRacer::Context.new(timeout: @budget.timeout_ms, max_memory: Limits.max_memory(max_memory))
        prepare(context, wrap_event_for_caller_tracking(@event, track_caller), track_caller)

        context.attach("__racerFinish", proc { |ok, payload|
          outcome ||= [ ok, payload ]
          nil
        })
        context.eval(script_source(code, params), filename: USER_FILE)

        finish(outcome)
      ensure
        context&.dispose
        self.class.reap_disposed_contexts
      end
    end

    # `dispose` libera o V8, mas a thread nativa do contexto só termina quando o GC do Ruby
    # finaliza o objeto: 200 execuções sem GC deixaram 217 threads paradas. Num processo que
    # aloca pouco, uma rajada de scripts acumularia centenas delas. Um GC menor a cada lote
    # (5 ms a cada 32 execuções, medido com o Rails carregado) mantém o pico baixo.
    def self.reap_disposed_contexts
      GC.start(full_mark: false, immediate_sweep: true) if (DISPOSED_CONTEXTS.increment % REAP_EVERY).zero?
    end

    private

    def prepare(context, event, track_caller)
      raise Error, "V8 sem --jitless: os limites não valeriam" unless context.eval(Sandbox::JITLESS_CHECK_JS)

      internal_eval(context, Sandbox.source)

      if track_caller
        context.attach("__setCallerLine", proc { |line| @caller_line = sanitize_line(line) })
        internal_eval(context, CALLER_TRACE_FN_JS)
      end

      extensions = list_modules.map(&:new)
      extensions.each { |extension| extension.register(self, context, event) }
      extensions.filter_map(&:bootstrap_js).each { |source| internal_eval(context, source) }

      # Credenciais da ferramenta instalada: `credentials.<chave>` no script, objeto vazio
      # quando não há.
      credentials = Values.to_js(@context.get(:tool_credentials) || {})
      internal_eval(context, "globalThis.credentials = #{credentials.to_json};")

      internal_eval(context, CALLER_WRAP_GLOBALS_JS) if track_caller
    end

    def internal_eval(context, source)
      context.eval(source, filename: INTERNAL_FILE)
    end

    # Num único `eval`, para valer um único prazo, inclusive para código que escapa da
    # função com um `}`. O script começa na primeira linha, assim a linha que o V8 cita no
    # erro é a linha que a pessoa escreveu.
    #
    # onMessage é SEMPRE async pra permitir `await` no top-level do código do usuário;
    # código síncrono legado continua funcionando pelo mesmo caminho.
    def script_source(code, params)
      params_json = Values.to_js(params || {}).to_json

      "async function onMessage(params) {#{code}\n}\n;#{RUNNER_JS}(#{params_json}, #{Limits::MAX_RESULT_BYTES});"
    end

    # As microtasks drenam antes do `eval` voltar. Sem desfecho a essa altura, nada mais vai
    # acontecer: não há event loop nem timer.
    def finish(outcome)
      if outcome.nil?
        raise ::MiniRacer::RuntimeError,
              "Promise pendente após execução do código JS — apenas operações síncronas " \
              "(fetch/request) são suportadas; setTimeout/setInterval/SSE não funcionam."
      end

      ok, payload = outcome
      raise ::MiniRacer::RuntimeError, payload.to_s unless ok

      Response.new(result: decode_result(payload))
    end

    def decode_result(json)
      Values.to_js(JSON.parse(json.to_s, max_nesting: Limits::MAX_RESULT_DEPTH))
    rescue JSON::ParserError => e
      # Inclui o aninhamento além do teto, que quem grava o resultado não conseguiria gerar.
      raise ::MiniRacer::RuntimeError, "Script result is not valid JSON: #{e.message.truncate(200)}"
    end

    def sanitize_line(value)
      return nil unless value.is_a?(Numeric)

      line = value.to_i
      line.positive? ? line : nil
    end

    def wrap_event_for_caller_tracking(event_block, track_caller)
      return event_block unless track_caller && event_block

      lambda do |name, payload|
        enriched =
          if payload.is_a?(Hash) && @caller_line
            payload.merge(caller_line: @caller_line)
          else
            payload
          end
        event_block.call(name, enriched)
      end
    end
  end
end
