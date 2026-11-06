# frozen_string_literal: true

require "rails_helper"

# Specs do MiniRacerEngine::Worker focados em GARANTIA DE COMPATIBILIDADE: travam o
# comportamento observável (tipos de retorno, exceções, eventos, módulos registrados) que
# quem escreve script e quem chama o motor esperam. Limites e isolamento estão em
# sandbox_spec.rb.
RSpec.describe MiniRacerEngine::Worker do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, external_id: "5511999999999@whatsapp", user_name: "Teste") }
  let(:session_context) { script_session(organization: organization, chat: chat) }
  let(:worker) { described_class.new(session_context) }

  describe "#perform — código síncrono (compat legado)" do
    it "retorna número primitivo" do
      response = worker.perform("return 42;")
      expect(response).to be_a(MiniRacerEngine::Response)
      expect(response.result).to eq(42)
    end

    it "retorna string" do
      expect(worker.perform("return 'hello';").result).to eq("hello")
    end

    it "retorna boolean true/false" do
      expect(worker.perform("return true;").result).to be true
      expect(worker.perform("return false;").result).to be false
    end

    it "retorna null como nil" do
      expect(worker.perform("return null;").result).to be_nil
    end

    it "retorna undefined (sem return explícito) como nil" do
      expect(worker.perform("var x = 1;").result).to be_nil
    end

    it "retorna hash/objeto JS como Hash Ruby" do
      result = worker.perform("return { foo: 'bar', n: 7 };").result
      expect(result).to eq("foo" => "bar", "n" => 7)
    end

    it "retorna array" do
      expect(worker.perform("return [1, 2, 3];").result).to eq([ 1, 2, 3 ])
    end

    it "retorna estrutura aninhada" do
      result = worker.perform("return { items: [{ id: 1 }, { id: 2 }], count: 2 };").result
      expect(result).to eq("items" => [ { "id" => 1 }, { "id" => 2 } ], "count" => 2)
    end

    it "recebe params e os usa no retorno" do
      result = worker.perform('return params.name + "!";', { "name" => "João" }).result
      expect(result).to eq("João!")
    end

    it "permite efeitos colaterais sem return (params mutados)" do
      result = worker.perform("params.touched = true; return params;", { "a" => 1 }).result
      expect(result).to eq("a" => 1, "touched" => true)
    end

    it "aceita params com chave símbolo e sem params" do
      expect(worker.perform("return params.a;", { a: 1 }).result).to eq(1)
      expect(worker.perform("return params;", nil).result).to eq({})
    end

    it "não confunde params com código: texto do cliente não vira JavaScript" do
      hostile = %q(</script>"; globalThis.hacked = true; //)
      result = worker.perform("return [params.t, typeof hacked];", { "t" => hostile }).result

      expect(result).to eq([ hostile, "undefined" ])
    end
  end

  describe "#perform — resultado" do
    it "converte o que não tem JSON direto" do
      result = worker.perform(<<~JS).result
        return {
          date: new Date(0),
          big: 2n ** 70n,
          map: new Map([['a', 1]]),
          set: new Set([1, 2]),
          nan: NaN,
          missing: undefined,
          fn() {},
          url: new URL('https://exemplo.com.br/a?b=1')
        };
      JS

      expect(result).to eq(
        "date" => "1970-01-01T00:00:00.000Z",
        "big" => (2**70).to_s,
        "map" => { "a" => 1 },
        "set" => [ 1, 2 ],
        "nan" => nil,
        "url" => "https://exemplo.com.br/a?b=1"
      )
    end

    it "respeita toJSON e roda getters" do
      expect(worker.perform("return { get g() { return 42 }, o: { toJSON() { return 'x' } } };").result)
        .to eq("g" => 42, "o" => "x")
    end

    it "função devolvida vira nil" do
      expect(worker.perform("return function () {};").result).to be_nil
    end

    # Texto com meio emoji chegaria ao Ruby como bytes inválidos, e explodiria em quem grava.
    it "o resultado sempre pode ser gravado" do
      result = worker.perform(%q(return { lone: '\uD83D', ok: 'não 🚀' };)).result

      expect(result["ok"]).to eq("não 🚀")
      expect(result["lone"]).to be_valid_encoding
      expect { result.to_json }.not_to raise_error
    end

    it "objeto cíclico é erro do script, não um Hash recursivo" do
      expect { worker.perform("const a = {}; a.a = a; return a;") }
        .to raise_error(MiniRacer::RuntimeError, /circular/i)
    end

    it "aninhamento além do que dá para gravar é erro do script" do
      expect { worker.perform("let o = {}; for (let i = 0; i < 200; i++) o = { o }; return o;") }
        .to raise_error(MiniRacer::RuntimeError, /JSON/)
    end

    it "recusa resultado acima do teto" do
      stub_const("MiniRacerEngine::Limits::MAX_RESULT_BYTES", 100)

      expect { worker.perform("return 'x'.repeat(200);") }.to raise_error(MiniRacer::RuntimeError, /limit/)
      expect(worker.perform("return 'x'.repeat(50);").result).to eq("x" * 50)
    end

    it "script que troca as primitivas não engana o motor" do
      result = worker.perform(<<~JS).result
        Promise.prototype.then = function () { throw new Error('trocado'); };
        JSON.stringify = function () { return '"forjado"'; };
        Object.fromEntries = null;
        return { ok: true };
      JS

      expect(result).to eq("ok" => true)
    end
  end

  describe "#perform — propagação de exceções (compat legado crítica)" do
    it "propaga throw new Error como MiniRacer::RuntimeError" do
      expect do
        worker.perform("throw new Error('boom legado');")
      end.to raise_error(MiniRacer::RuntimeError, /boom legado/)
    end

    it "propaga ReferenceError em variável inexistente" do
      expect do
        worker.perform("return naoExiste;")
      end.to raise_error(MiniRacer::RuntimeError, /not defined/i)
    end

    it "propaga SyntaxError em código JS inválido" do
      expect { worker.perform("return @@@;") }.to raise_error(MiniRacer::Error)
    end

    it "propaga throw de valor que não é erro" do
      expect { worker.perform("throw 'texto';") }.to raise_error(MiniRacer::RuntimeError, "texto")
    end

    it "erro impossível de imprimir ainda vira erro" do
      expect { worker.perform("throw { get stack() { throw 1 } };") }.to raise_error(MiniRacer::RuntimeError, /unprintable/)
    end

    it "erro gigante é cortado" do
      expect { worker.perform("throw 'x'.repeat(2 ** 24);") }.to raise_error(MiniRacer::RuntimeError) { |error|
        expect(error.message.length).to eq(10_000)
      }
    end

    # Com o script na primeira linha do `eval`, a linha do erro é a que a pessoa escreveu.
    it "aponta a linha que a pessoa escreveu" do
      expect { worker.perform("const a = 1;\nconst b = 2;\nthrow new Error('aqui');") }
        .to raise_error(MiniRacer::RuntimeError) { |error| expect(error.backtrace.first).to include("user-code.js:3") }

      expect { worker.perform("const a = 1;\nreturn @@;") }
        .to raise_error(MiniRacer::ParseError, /user-code\.js:2/)
    end

    it "todo erro de script é MiniRacer::Error, o único rescue de quem chama" do
      codes = [ "return @@@;", "throw new Error('x');", "while (true) {}", "return new Promise(() => {});" ]

      codes.each do |code|
        expect { worker.perform(code, {}, timeout_ms: 50) }.to raise_error(MiniRacer::Error)
      end
    end
  end

  describe "#perform — eventos via on_event (compat legado)" do
    it "invoca o callback de evento quando módulo dispara (console_log)" do
      events = []
      worker.on_event { |name, payload| events << [ name, payload ] }

      worker.perform(<<~JS)
        console.log('msg-1');
        return 'ok';
      JS

      log_events = events.select { |name, _| name == :console_log }
      expect(log_events).not_to be_empty
      expect(log_events.first.last).to include(input: [ "msg-1" ])
    end

    it "não quebra quando on_event não foi configurado" do
      expect do
        worker.perform("console.log('sem callback'); return 1;")
      end.not_to raise_error
    end

    it "quem assina o evento não derruba o script" do
      worker.on_event { |_name, _payload| raise "tela fora do ar" }

      expect(worker.perform("console.log('x'); return 1;").result).to eq(1)
    end
  end

  describe "#perform — track_caller (a tela de testar script)" do
    it "executa normalmente com track_caller=true e dispara console_log" do
      events = []
      worker.on_event { |name, payload| events << [ name, payload ] }

      response = worker.perform("console.log('linha 1');\nreturn 42;", {}, track_caller: true)

      expect(response.result).to eq(42)
      expect(events.map(&:first)).to include(:console_log)
    end

    it "diz a linha de cada chamada, inclusive em namespace" do
      events = {}
      worker.on_event { |name, payload| events[name] = payload[:caller_line] }

      worker.perform("const a = 1;\nconsole.log('x');\n\ngetContactInfo();", {}, track_caller: true)

      expect(events).to include(console_log: 2, get_contact_info: 4)
    end

    it "não adiciona caller_line quando track_caller=false (default)" do
      events = []
      worker.on_event { |name, payload| events << [ name, payload ] }

      worker.perform("console.log('x'); return 0;")

      log_event = events.find { |name, _| name == :console_log }
      expect(log_event&.last).not_to include(:caller_line) if log_event
    end
  end

  describe "#perform — módulos registrados (compat legado)" do
    it "expõe globais dos módulos registrados (console, contactStorage, etc.)" do
      result = worker.perform(<<~JS).result
        return {
          hasConsole: typeof console !== 'undefined',
          hasContactStorage: typeof contactStorage !== 'undefined',
          hasContactAttribute: typeof contactAttribute !== 'undefined',
          hasRequest: typeof request === 'function',
          hasFetch: typeof fetch === 'function',
          hasDownloadFile: typeof downloadFile === 'function',
          hasCollection: typeof collection !== 'undefined',
          hasTag: typeof tag !== 'undefined',
          hasCatalog: typeof catalog !== 'undefined',
          hasMaps: typeof maps !== 'undefined',
          hasCredentials: typeof credentials === 'object'
        };
      JS

      expect(result.values).to all(be(true))
    end

    it "não expõe o que ficou de fora" do
      result = worker.perform(<<~JS).result
        return [typeof registerFollowUpByStepNumber, typeof semanticSearch];
      JS

      expect(result).to all(eq("undefined"))
    end
  end

  describe "#perform — limpa contexto entre execuções" do
    it "descarta estado JS entre chamadas (sem leak via globalThis)" do
      worker.perform("globalThis.leaked = 123;")
      result = worker.perform("return typeof globalThis.leaked === 'undefined';").result
      expect(result).to be true
    end

    it "o script não alcança o callback de desfecho nem forja o resultado depois" do
      result = worker.perform("return typeof __racerFinish;").result

      expect(result).to eq("undefined")
    end

    it "conta a cota de cada execução do zero" do
      stub_const("MiniRacerEngine::Limits::MAX_CALLS", 2)
      code = "getContactInfo(); getContactInfo(); return 'ok';"

      expect(worker.perform(code).result).to eq("ok")
      expect(worker.perform(code).result).to eq("ok")
    end
  end

  describe "#perform — credenciais" do
    it "expõe as da ferramenta como `credentials`" do
      session_context.set(:tool_credentials, { "token" => "abc" })

      expect(worker.perform("return credentials.token;").result).to eq("abc")
    end

    it "objeto vazio quando não há" do
      expect(worker.perform("return credentials;").result).to eq({})
    end
  end

  describe "promise" do
    it "await no topo e .then encadeado" do
      expect(worker.perform("const a = await Promise.resolve(1); return a + 1;").result).to eq(2)
      expect(worker.perform("return Promise.resolve(1).then(a => a + 1).then(a => a * 10);").result).to eq(20)
    end

    it "rejeição vira exceção" do
      expect { worker.perform("return Promise.reject(new Error('negado'));") }
        .to raise_error(MiniRacer::RuntimeError, /negado/)
    end

    it "levanta erro descritivo, na hora, se a Promise nunca resolve" do
      elapsed = elapsed_seconds do
        expect { worker.perform("return new Promise(function () {});") }
          .to raise_error(MiniRacer::RuntimeError, /Promise pendente.*s[íi]ncronas/i)
      end

      expect(elapsed).to be < 1
    end

    it "não há timers" do
      expect(worker.perform("return [typeof setTimeout, typeof setInterval];").result).to eq(%w[undefined undefined])
    end
  end
end
