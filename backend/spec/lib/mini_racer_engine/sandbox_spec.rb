# frozen_string_literal: true

require "rails_helper"
require "open3"

# Limites e isolamento, contra V8 de verdade. Este motor executa JavaScript de cliente dentro
# do servidor: cada exemplo aqui é um buraco conferido rodando, não uma suposição.
RSpec.describe "MiniRacerEngine: limites e isolamento" do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }
  let(:worker) { MiniRacerEngine::Worker.new(script_session(organization: organization, chat: chat)) }

  def run(code, **options)
    worker.perform(code, {}, **options).result
  end

  describe "limite de tempo" do
    {
      "laço puro" => "while (true) {}",
      "laço depois de await" => "await null; while (true) {}",
      "laço em microtask, depois do corpo terminar" => "Promise.resolve().then(() => { while (true) {} }); return 1;",
      "laço de await" => "while (true) { await null; }",
      "try/catch não segura" => "while (true) { try { while (true) {} } catch (e) {} }",
      "finally não segura" => "try { while (true) {} } finally { while (true) {} }",
      "regex catastrófica" => "return /(a+)+$/.test('a'.repeat(40) + '!');",
      "getter no resultado" => "return { get g() { while (true) {} } };",
      "toJSON no resultado" => "return { toJSON() { while (true) {} } };",
      "erro com stack infinita" => "throw { get stack() { while (true) {} } };",
      "função otimizada depois de aquecer" =>
        "function g(x) { return (x + 1) | 0 } function f(n) { let s = 0; for (let i = 0; i < n; i = (i + 1) | 0) s = g(s) ^ i; return s } " \
        "for (let i = 0; i < 1e5; i++) f(10); return f(4e9);",
      "laço chamando Ruby" => "while (true) { getContactInfo(); }",
      "gerador sem fim" => "function* g() { while (true) yield 1 } for (const x of g()) {}",
      "escapa da função com }" => "} while (true) {} function x() {"
    }.each do |label, code|
      it "para: #{label}" do
        elapsed = elapsed_seconds do
          expect { run(code, timeout_ms: 150) }.to raise_error(MiniRacer::ScriptTerminatedError)
        end

        expect(elapsed).to be < 1.5
      end
    end

    it "laço chamando Ruby até a cota também termina" do
      stub_const("MiniRacerEngine::Limits::MAX_CALLS", 100)

      expect { run("while (true) { getContactInfo(); }", timeout_ms: 2_000) }
        .to raise_error(MiniRacer::RuntimeError, /limit of 100 calls/)
    end

    # Lido num segundo `eval`, como na origem, cada etapa ganharia um prazo inteiro: gastar 90%
    # do prazo no corpo e o resto num getter daria 1,9 s. Um prazo só dá 1 s.
    it "é um prazo só para a execução inteira" do
      code = "const fim = Date.now() + 900; while (Date.now() < fim) {} return { get g() { while (true) {} } };"

      elapsed = elapsed_seconds do
        expect { run(code, timeout_ms: 1_000) }.to raise_error(MiniRacer::ScriptTerminatedError)
      end

      expect(elapsed).to be < 1.5
    end

    it "sleep não passa do prazo, mesmo com o timeout do V8 sem alcançar o Ruby" do
      elapsed = elapsed_seconds do
        expect { run("sleep(60000); while (true) {}", timeout_ms: 200) }.to raise_error(MiniRacer::ScriptTerminatedError)
      end

      expect(elapsed).to be < 1
    end

    it "laço de sleep não acumula" do
      elapsed = elapsed_seconds do
        expect { run("while (true) { sleep(1000); }", timeout_ms: 200) }.to raise_error(MiniRacer::ScriptTerminatedError)
      end

      expect(elapsed).to be < 1
    end

    it "existe mesmo quando quem chama não pede" do
      worker.perform("return 1;")
      expect(worker.budget.timeout_ms).to eq(MiniRacerEngine::Limits::DEFAULT_TIMEOUT_MS)

      worker.perform("return 1;", {}, timeout_ms: nil)
      expect(worker.budget.timeout_ms).to eq(MiniRacerEngine::Limits::DEFAULT_TIMEOUT_MS)
    end

    it "não passa do teto, mesmo pedindo" do
      worker.perform("return 1;", {}, timeout_ms: 10_000_000)

      expect(worker.budget.timeout_ms).to eq(MiniRacerEngine::Limits::MAX_TIMEOUT_MS)
    end

    it "não interfere em código que termina dentro do limite" do
      expect(run("return 1 + 1;", timeout_ms: 5_000)).to eq(2)
    end

    it "o worker segue usável depois" do
      expect { run("while (true) {}", timeout_ms: 50) }.to raise_error(MiniRacer::ScriptTerminatedError)

      expect(run("return 'vivo';")).to eq("vivo")
    end
  end

  describe "limite de memória" do
    {
      "array crescendo" => "const a = []; while (true) a.push({ x: 1 });",
      # Estes abortavam o processo inteiro com o JIT ligado, mesmo com max_memory.
      "array de arrays" => "const a = []; while (true) a.push(new Array(1000));",
      "array preenchido" => "const a = []; while (true) a.push(new Array(1000).fill(0));",
      "lista encadeada" => "let h = null; while (true) h = { n: h, p: new Array(100).fill(0) };",
      "try/catch em volta" => "const a = []; while (true) { try { a.push(new Array(1000).fill(0)) } catch (e) {} }",
      "função aquecida" => "function f(n) { const a = []; for (let i = 0; i < n; i++) a.push(new Array(1000)); return a.length } " \
                           "for (let i = 0; i < 1e5; i++) f(1); return f(1e12);",
      "Map" => "const m = new Map(); let i = 0; while (true) m.set(i++, i);",
      "chaves de objeto" => "const o = {}; let i = 0; while (true) o['k' + (i++)] = 1;",
      "concat" => "let a = [1]; for (let i = 0; i < 40; i++) a = a.concat(a); return a.length;"
    }.each do |label, code|
      it "para: #{label}" do
        expect { run(code, timeout_ms: 10_000) }.to raise_error(MiniRacer::V8OutOfMemoryError)
      end
    end

    it "o limite pedido vale, mas não abaixo do mínimo nem acima do teto" do
      code = "const a = []; for (let i = 0; i < 40; i++) a.push(new Array(100000).fill(0)); return a.length;"

      expect { run(code, max_memory: 8.megabytes) }.to raise_error(MiniRacer::V8OutOfMemoryError)
      expect(run(code, max_memory: 128.megabytes)).to eq(40)
      expect(MiniRacerEngine::Limits.max_memory(1)).to eq(MiniRacerEngine::Limits::MIN_MEMORY)
      expect(MiniRacerEngine::Limits.max_memory(10.gigabytes)).to eq(MiniRacerEngine::Limits::MAX_MEMORY)
      expect(MiniRacerEngine::Limits.max_memory(nil)).to eq(MiniRacerEngine::Limits::DEFAULT_MAX_MEMORY)
    end

    it "o worker segue usável depois" do
      expect { run("const a = []; while (true) a.push({});") }.to raise_error(MiniRacer::V8OutOfMemoryError)

      expect(run("return 'vivo';")).to eq("vivo")
    end

    it "não é o JIT: V8 sem compilador e sem WebAssembly" do
      expect(run("return typeof WebAssembly;")).to eq("undefined")
    end

    it "recusa rodar se o V8 subiu sem o flag, porque os limites não valeriam" do
      stub_const("MiniRacerEngine::Sandbox::JITLESS_CHECK_JS", "false")

      expect { run("return 1;") }.to raise_error(MiniRacerEngine::Error, /jitless/)
    end
  end

  # `max_memory` não enxerga o que mora fora do heap: sem esta cota, 40 x 100 MB passavam.
  describe "memória binária (ArrayBuffer e typed arrays)" do
    let(:limit_error) { /binary memory limit/ }

    {
      "tudo de uma vez" => "new Uint8Array(1e9);",
      "acumulando" => "const k = []; while (true) k.push(new Uint8Array(1e7));",
      "ArrayBuffer" => "const k = []; while (true) k.push(new ArrayBuffer(1e7));",
      "construtor pela instância" => "const C = new Uint8Array(1).constructor; new C(2 ** 31);",
      "construtor pelo protótipo" => "const C = Object.getPrototypeOf(new Uint8Array(1)).constructor; new C(2 ** 31);",
      "construtor do buffer" => "const C = new ArrayBuffer(1).constructor; new C(2 ** 31);",
      "slice sem construtor (ArrayBuffer)" => "const b = new ArrayBuffer(1e7); b.constructor = undefined; const k = []; while (true) k.push(b.slice(0));",
      "slice sem construtor (typed)" => "const b = new Uint8Array(1e7); b.constructor = undefined; const k = []; while (true) k.push(b.slice());",
      "toSorted" => "const b = new Uint8Array(1e7); const k = []; while (true) k.push(b.toSorted());",
      "toReversed" => "const b = new Uint8Array(1e7); const k = []; while (true) k.push(b.toReversed());",
      "with" => "const b = new Uint8Array(1e7); const k = []; while (true) k.push(b.with(0, 1));",
      "map" => "const b = new Uint8Array(1e7); const k = []; while (true) k.push(b.map(x => x));",
      "transfer" => "new ArrayBuffer(1).transfer(2 ** 32);",
      "transferToFixedLength" => "new ArrayBuffer(1).transferToFixedLength(2 ** 32);",
      "resize" => "new ArrayBuffer(1, { maxByteLength: 2 ** 33 });",
      "número negativo não devolve cota" => "try { new Uint8Array(-1e15) } catch (e) {} new Uint8Array(2 ** 31);",
      "from" => "Uint8Array.from({ length: 2 ** 24 }, () => 1); Float64Array.from({ length: 2 ** 24 }, () => 1);",
      "subclasse" => "class X extends Uint8Array {}; new X(2 ** 31);"
    }.each do |label, code|
      it "cobra: #{label}" do
        expect { run(code, timeout_ms: 10_000) }.to raise_error(MiniRacer::RuntimeError, limit_error)
      end
    end

    it "valueOf que responde diferente na segunda leitura não passa" do
      expect(run("let n = 0; return new ArrayBuffer({ valueOf() { return n++ ? 2 ** 31 : 1 } }).byteLength;")).to eq(1)
    end

    it "getter que responde diferente na segunda leitura não passa" do
      expect(run("let n = 0; return new ArrayBuffer(1, { get maxByteLength() { return n++ ? 2 ** 33 : 1 } }).maxByteLength;")).to eq(1)
      expect(run("let n = 0; return new Uint8Array({ get length() { return n++ ? 2 ** 28 : 1 } }).length;")).to eq(1)
    end

    it "o script captura o erro, mas não ganha cota" do
      code = <<~JS
        let falhas = 0;
        for (let i = 0; i < 3; i++) { try { new Uint8Array(1e9); } catch (e) { falhas++; } }
        return falhas;
      JS

      expect(run(code)).to eq(3)
    end

    it "uso normal continua igual" do
      result = run(<<~JS)
        const a = new Uint8Array([1, 2, 3]);
        const view = new Uint16Array(a.buffer.slice(0, 2));
        class X extends Uint8Array {}
        return {
          instance: a instanceof Uint8Array,
          constructor: a.constructor === Uint8Array,
          name: Uint8Array.name,
          bytes: Uint8Array.BYTES_PER_ELEMENT,
          slice: Array.from(a.slice(1)),
          subarray: Array.from(a.subarray(1)),
          map: Array.from(a.map(x => x * 2)),
          filter: Array.from(a.filter(x => x > 1)),
          from: Array.from(Uint8Array.from([9, 8])),
          of: Array.from(Uint8Array.of(7)),
          view: view.length,
          subclass: new X(2).length,
          subclassInstance: new X(1) instanceof X,
          dataView: new DataView(new ArrayBuffer(8)).byteLength,
          buffer: new ArrayBuffer(8).byteLength,
          sorted: Array.from(new Uint8Array([3, 1]).toSorted()),
          text: new TextDecoder().decode(new TextEncoder().encode('não'))
        };
      JS

      expect(result).to include(
        "instance" => true, "constructor" => true, "name" => "Uint8Array", "bytes" => 1,
        "slice" => [ 2, 3 ], "subarray" => [ 2, 3 ], "map" => [ 2, 4, 6 ], "filter" => [ 2, 3 ],
        "from" => [ 9, 8 ], "of" => [ 7 ], "view" => 1, "subclass" => 2, "subclassInstance" => true,
        "dataView" => 8, "buffer" => 8, "sorted" => [ 1, 3 ], "text" => "não"
      )
    end

    it "memória compartilhada e WebAssembly não existem" do
      expect(run("return [typeof SharedArrayBuffer, typeof Atomics, typeof WebAssembly];")).to all(eq("undefined"))
    end

    # Os guardas usam primitivas capturadas antes do script existir.
    describe "trocar as primitivas não desliga os guardas" do
      {
        "Math.max" => "const real = Math.max; let n = 0; Math.max = (...a) => (n++ % 2 ? 0 : real(...a));",
        "Math.trunc" => "Math.trunc = () => 0;",
        "Number" => "const R = Number; let n = 0; globalThis.Number = (v) => (n++ % 2 ? 0 : R(v));",
        "Reflect" => "Reflect.apply = () => 1; Reflect.construct = () => 1;",
        "Proxy" => "globalThis.Proxy = class {};",
        "Object.defineProperty" => "Object.defineProperty = () => {};"
      }.each do |label, swap|
        it label do
          expect { run("#{swap} new Uint8Array(1e9);") }.to raise_error(MiniRacer::RuntimeError, limit_error)
        end
      end

      it "o Array global trocado não engana a contagem" do
        code = <<~JS
          let n = 0;
          class Falso { get length() { return n++ ? 2 ** 31 : 0 } }
          globalThis.Array = Falso;
          return new Uint8Array({ [Symbol.iterator]: function* () { yield 1 } }).length;
        JS

        expect(run(code)).to eq(1)
      end
    end
  end

  # Os objetos ICU também ficam fora do heap: `Intl.DateTimeFormat` em laço chegava a 1,9 GB
  # em 3 s, com o limite de memória em 64 MB.
  describe "objetos Intl" do
    {
      "NumberFormat" => "new Intl.NumberFormat('pt-BR')",
      "DateTimeFormat" => "new Intl.DateTimeFormat('pt-BR')",
      "Collator" => "new Intl.Collator('pt-BR')",
      "PluralRules" => "new Intl.PluralRules('pt-BR')",
      "ListFormat" => "new Intl.ListFormat('pt-BR')",
      "RelativeTimeFormat" => "new Intl.RelativeTimeFormat('pt-BR')",
      "DisplayNames" => "new Intl.DisplayNames('pt-BR', { type: 'region' })",
      "Locale" => "new Intl.Locale('pt-BR')",
      "sem new" => "Intl.NumberFormat('pt-BR')",
      "pelo construtor da instância" => "new (new Intl.NumberFormat('pt-BR').constructor)('pt-BR')"
    }.each do |label, expression|
      it "cobra: #{label}" do
        stub_const("MiniRacerEngine::Limits::MAX_INTL_OBJECTS", 50)

        expect { run("const k = []; while (true) k.push(#{expression});", timeout_ms: 5_000) }
          .to raise_error(MiniRacer::RuntimeError, /Intl object limit/)
      end
    end

    it "o Segmenter não existe: cada iterador dele clona memória sem passar por construtor" do
      expect(run("return typeof Intl.Segmenter;")).to eq("undefined")
    end

    it "uso normal continua igual" do
      result = run(<<~JS)
        const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        return {
          money: money.format(1234.5),
          instance: money instanceof Intl.NumberFormat,
          constructor: money.constructor === Intl.NumberFormat,
          noNew: Intl.NumberFormat('en-US').format(1.5),
          date: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(new Date(0)),
          compare: new Intl.Collator('pt-BR').compare('a', 'b'),
          plural: new Intl.PluralRules('pt-BR').select(1),
          list: new Intl.ListFormat('pt-BR').format(['a', 'b']),
          canonical: Intl.getCanonicalLocales('pt-br')[0],
          supported: Intl.NumberFormat.supportedLocalesOf(['pt-BR']).length,
          locale: (1234.5).toLocaleString('pt-BR'),
          order: 'a'.localeCompare('b')
        };
      JS

      expect(result["money"]).to match(/R\$.*1\.234,50/)
      expect(result).to include(
        "instance" => true, "constructor" => true, "noNew" => "1.5", "date" => "1/1/1970", "compare" => -1,
        "plural" => "one", "list" => "a e b", "canonical" => "pt-BR", "supported" => 1, "locale" => "1.234,5", "order" => -1
      )
    end

    it "um laço grande de formatação, sem criar objeto, não gasta a cota" do
      stub_const("MiniRacerEngine::Limits::MAX_INTL_OBJECTS", 1)

      expect(run("const f = new Intl.NumberFormat('pt-BR'); let n = 0; for (let i = 0; i < 1000; i++) { f.format(i); (i).toLocaleString('pt-BR'); n++ } return n;"))
        .to eq(1000)
    end
  end

  describe "coleções gigantes" do
    let(:size_error) { /collection size limit/ }

    it "métodos seguem funcionando no tamanho normal" do
      result = run(<<~JS)
        const list = [3, 1, 2];
        return {
          fill: new Array(2).fill(7),
          from: Array.from({ length: 2 }, (_, i) => i),
          fromText: Array.from('ab'),
          fromSet: Array.from(new Set([1])),
          sort: [...list].sort(),
          sortFn: [...list].sort((a, b) => b - a),
          map: list.map(x => x + 1),
          filter: list.filter(x => x > 1),
          reduce: list.reduce((a, b) => a + b),
          join: list.join('-'),
          text: String(list),
          includes: list.includes(3),
          flat: [[1], [2]].flat(),
          concat: [1].concat([2]),
          push: [].push(1),
          entries: [...['a'].entries()],
          split: 'a,b'.split(','),
          replace: 'a-b'.replace('-', '+'),
          replaceRegex: 'a-b'.replace(/-/g, () => '+'),
          replaceAll: 'a-a'.replaceAll('a', 'b'),
          match: 'a1b2'.match(/\\d/g),
          matchAll: [...'a1'.matchAll(/\\d/g)].length,
          search: 'abc'.search('c'),
          upper: 'não'.toUpperCase(),
          normalize: 'á'.normalize('NFD').length,
          json: JSON.parse('{"a":[1]}'),
          reviver: JSON.parse('[1]', (k, v) => (Array.isArray(v) ? v : v + 1)),
          symbolMatch: /a/g[Symbol.match]('aa'),
          call: Array.prototype.map.call('ab', c => c + c),
          name: typeof Array.prototype.map,
          subclass: new (class L extends Array {})(2).fill(1).length
        };
      JS

      expect(result).to include(
        "fill" => [ 7, 7 ], "from" => [ 0, 1 ], "fromText" => %w[a b], "fromSet" => [ 1 ],
        "sort" => [ 1, 2, 3 ], "sortFn" => [ 3, 2, 1 ], "map" => [ 4, 2, 3 ], "filter" => [ 3, 2 ],
        "reduce" => 6, "join" => "3-1-2", "text" => "3,1,2", "includes" => true, "flat" => [ 1, 2 ],
        "concat" => [ 1, 2 ], "push" => 1, "entries" => [ [ 0, "a" ] ], "split" => %w[a b],
        "replace" => "a+b", "replaceRegex" => "a+b", "replaceAll" => "b-b", "match" => %w[1 2],
        "matchAll" => 1, "search" => 2, "upper" => "NÃO", "normalize" => 2, "json" => { "a" => [ 1 ] },
        "reviver" => [ 2 ], "symbolMatch" => %w[a a], "call" => %w[aa bb], "subclass" => 2
      )
    end

    # O teto de texto fica acima do que um `fetch` traz, e o de coleção, acima do que cabe no
    # heap padrão. Cada um numa execução: juntos, passariam do limite de memória.
    {
      "split de uma resposta de 5 MB" => [ "return 'a,'.repeat(5 * 512 * 1024).split(',').length;", (5 * 512 * 1024) + 1 ],
      "replaceAll em 5 MB de texto" => [ "return 'abcdefghij'.repeat(512 * 1024).replaceAll('a', 'z').length;", 5 * 1024 * 1024 ],
      "JSON.parse de 5 MB" => [ "return JSON.parse(JSON.stringify({ a: 'y'.repeat(5 * 1024 * 1024) })).a.length;", 5.megabytes ],
      "map em 1 milhão" => [ "return new Array(1000000).fill(1).map(n => n + 1).length;", 1_000_000 ],
      "Array.from de 1 milhão" => [ "return Array.from({ length: 1000000 }).length;", 1_000_000 ],
      "Object.keys de 1 milhão" => [ "return Object.keys(new Array(1000000).fill(1)).length;", 1_000_000 ]
    }.each do |label, (code, expected)|
      it "o que um script usa de verdade passa: #{label}" do
        expect(run(code)).to eq(expected)
      end
    end

    # Estes não abortam, mas sem o teto prendiam a thread muito além do prazo: o builtin
    # varre 2^29 posições sem voltar ao JS.
    {
      "sort" => "const a = []; a.length = 2 ** 29; a.sort();",
      "reverse" => "const a = []; a.length = 2 ** 29; a.reverse();",
      "slice" => "const a = []; a.length = 2 ** 29; a.slice();"
    }.each do |label, code|
      it "recusa na hora, sem esperar o builtin: #{label}" do
        elapsed = elapsed_seconds do
          expect { run(code, timeout_ms: 2_000) }.to raise_error(MiniRacer::RuntimeError, size_error)
        end

        expect(elapsed).to be < 1
      end
    end

    # Sem as proteções estes matam o PROCESSO, então uma regressão derrubaria a suíte inteira
    # em vez de reprovar um exemplo. Rodam em subprocesso, e o `exit` diz se ele sobreviveu.
    it "script não aborta o processo" do
      output, status = Open3.capture2e(
        { "RAILS_ENV" => "test" },
        "bin/rails", "runner", Rails.root.join("spec/fixtures/files/script_engine_vectors.rb").to_s,
        chdir: Rails.root.to_s
      )

      expect(status.exitstatus).to eq(0), "o processo morreu (#{status}):\n#{output.lines.last(15).join}"

      results = output.lines.grep(/\Avector /).to_h { |line| line.split(" ", 3).drop(1) }
      unexpected = results.reject { |_name, outcome| outcome.start_with?("MiniRacer::", "ok") }
      expect(unexpected).to be_empty
      expect(results.size).to be > 50
      expect(output).to include("fork ok")
    end
  end

  # Estas funções são puras e não passam por `attach_method`. O limite do V8 não alcança o que
  # elas fazem no Ruby: `new URLSearchParams('a=1&'.repeat(2 ** 26))` chegava a 4,8 GB.
  describe "funções nativas das Web APIs" do
    {
      "URLSearchParams" => "new URLSearchParams('a=1&'.repeat(2 ** 19));",
      "URL" => "new URL('http://a.b/?' + 'a=1&'.repeat(2 ** 19));",
      "direto" => "__nativeQueryDecode('&'.repeat(2 ** 21));",
      "btoa" => "btoa('x'.repeat(2 ** 25));",
      "atob" => "atob('eHh4'.repeat(2 ** 23));",
      "TextEncoder" => "new TextEncoder().encode('x'.repeat(2 ** 25));",
      "createHash" => "crypto.createHash('md5').update('x'.repeat(2 ** 25)).digest('hex');",
      "createHmac" => "crypto.createHmac('md5', 'k').update('x'.repeat(2 ** 25)).digest('hex');"
    }.each do |label, code|
      it "recusa argumento gigante: #{label}" do
        elapsed = elapsed_seconds do
          expect { run(code, timeout_ms: 5_000) }.to raise_error(MiniRacer::RuntimeError, /too large/)
        end

        expect(elapsed).to be < 2
      end
    end

    it "recusa lista cíclica, em vez de estourar a pilha" do
      expect { run("const a = []; a[0] = a; __nativeTextDecode(a);") }.to raise_error(MiniRacer::RuntimeError, /too large/)
    end

    it "uma falha interna não conta detalhe do Ruby ao script" do
      allow(Rails.logger).to receive(:error)

      message = run("try { __nativeRandomBytes({}); } catch (e) { return e.message; }")

      expect(message).to eq("Internal error in __nativeRandomBytes")
      expect(Rails.logger).to have_received(:error).with(/NoMethodError/)
    end

    it "uso normal continua igual" do
      result = run(<<~JS)
        return [
          new URLSearchParams('a=1&b=2').get('b'),
          new URL('https://a.com/b?c=1').searchParams.get('c'),
          new URLSearchParams({ a: 'x y' }).toString(),
          btoa('x'.repeat(1000000)).length,
          atob(btoa('x'.repeat(1000000))).length,
          new TextDecoder().decode(new TextEncoder().encode('x'.repeat(1000000))).length,
          crypto.createHash('md5').update('x'.repeat(1000000)).digest('hex').length
        ];
      JS

      expect(result).to eq([ "2", "1", "a=x+y", 1_333_336, 1_000_000, 1_000_000, 32 ])
    end
  end

  describe "o script não alcança Ruby" do
    it "não há ponte para o processo" do
      globals = %w[process require module global Ruby Kernel ObjectSpace File IO Rails exports Buffer]

      expect(run("return #{globals.to_json}.map(name => typeof globalThis[name]);")).to all(eq("undefined"))
    end

    it "o global do `new Function` é o mesmo, sem nada a mais" do
      expect(run("return Function('return typeof process')() + constructor.constructor('return typeof require')();"))
        .to eq("undefinedundefined")
    end

    it "uma função anexada é opaca" do
      expect(run("return String(tag.add);")).to eq("function () { [native code] }")
      expect(run("return Object.getOwnPropertyNames(tag.add).includes('prototype') === false || typeof tag.add.prototype;"))
        .not_to include("Ruby")
    end

    it "o que uma extensão devolve é só dado" do
      result = run(<<~JS)
        const info = getContactInfo();
        return {
          keys: Object.keys(info).sort(),
          proto: Object.getPrototypeOf(info) === Object.prototype,
          functions: Object.values(info).filter(v => typeof v === 'function').length
        };
      JS

      expect(result).to eq("keys" => %w[external_id id name phone_number], "proto" => true, "functions" => 0)
    end

    describe "com uma extensão descuidada" do
      let(:careless) do
        Class.new(MiniRacerEngine::EngineModule) do
          def register(worker, context, event)
            @worker = worker
            context.attach("probe.object", proc { |*params| attach_method(method(:object), params, event) })
            context.attach("probe.boom", proc { |*params| attach_method(method(:boom), params, event) })
            context.attach("probe.mongo", proc { |*params| attach_method(method(:mongo), params, event) })
            context.attach("probe.values", proc { |*params| attach_method(method(:values), params, event) })
          end

          private

          def object(_params) = Object.new

          def boom(_params)
            raise ActiveRecord::StatementInvalid, "PG::Error: FATAL senha=segredo host=db.interno SELECT * FROM accounts"
          end

          def mongo(_params) = BSON::ObjectId.new

          def values(_params) = { big: BigDecimal("1.5"), day: Date.new(2026, 1, 2), sym: :sim, at: Time.utc(2026, 1, 2) }
        end
      end

      before do
        stub_const("MiniRacerEngine::Workers::Careless", careless)
        allow(MiniRacerEngine::Worker).to receive(:extension_files).and_wrap_original do |original|
          original.call + [ "/caminho/careless.rb" ]
        end
      end

      it "objeto Ruby não atravessa" do
        expect(run("return probe.object();")).to eq({})
        expect(run("return probe.mongo();")).to match(/\A\h{24}\z/)
      end

      # Sem a conversão, `BigDecimal` e `Date` chegariam como "Undefined Conversion".
      it "converte o que a gem transformaria em lixo" do
        result = run("const v = probe.values(); return { big: v.big, day: v.day, sym: v.sym, isDate: v.at instanceof Date };")

        expect(result).to eq("big" => 1.5, "day" => "2026-01-02", "sym" => "sim", "isDate" => true)
      end

      it "o erro interno fica no log, e o script só sabe que falhou" do
        allow(Rails.logger).to receive(:error)

        message = run("try { probe.boom(); } catch (e) { return e.message; }")

        expect(message).to eq("Internal error in boom")
        expect(Rails.logger).to have_received(:error).with(/senha=segredo/)
      end

      it "sem capturar, chega a quem chama como erro do script" do
        expect { run("probe.boom();") }.to raise_error(MiniRacer::RuntimeError, /Internal error in boom/)
      end
    end

    it "argumento cíclico não vira recursão no Ruby" do
      expect { run("const a = {}; a.a = a; console.log(a);") }.to raise_error(MiniRacer::RuntimeError, /nested too deeply/)
    end

    it "grafo com 2^40 caminhos não prende a thread" do
      elapsed = elapsed_seconds do
        expect { run("let o = {}; for (let i = 0; i < 40; i++) o = { a: o, b: o }; console.log(o);") }
          .to raise_error(MiniRacer::RuntimeError, /too (large|deeply)/)
      end

      expect(elapsed).to be < 2
    end
  end

  describe "isolamento entre execuções" do
    it "duas execuções ao mesmo tempo não se enxergam" do
      org_a = create(:organization)
      org_b = create(:organization)

      results = [ org_a, org_b ].map do |org|
        Thread.new do
          MiniRacerEngine::Worker.new(script_session(organization: org)).perform(<<~JS, { "who" => org.id }).result
            globalThis.mine = params.who;
            for (let i = 0; i < 2e5; i++) {}
            return globalThis.mine;
          JS
        end
      end.map(&:value)

      expect(results).to eq([ org_a.id, org_b.id ])
    end

    it "conversa de outra organização é recusada antes de rodar" do
      foreign = create(:chat, organization: create(:organization))
      session = script_session(organization: organization, chat: foreign)

      expect { MiniRacerEngine::Worker.new(session).perform("return 1;") }
        .to raise_error(MiniRacerEngine::Error, /does not belong/)
    end

    it "sem organização, o contexto de uma conversa também é recusado" do
      session = script_session(chat: chat)

      expect { MiniRacerEngine::Worker.new(session).perform("return 1;") }.to raise_error(MiniRacerEngine::Error)
    end

    # `dispose` não encerra a thread nativa: sem o GC periódico, seriam mais 200.
    it "não acumula threads numa rajada" do
      thread_count = -> { Dir.children("/proc/self/task").size }
      worker.perform("return 1;") # o V8 sobe as threads dele uma vez, no primeiro contexto
      GC.start
      before = thread_count.call
      peak = before

      200.times do
        worker.perform("console.log('x'); return 1;")
        peak = [ peak, thread_count.call ].max
      end

      expect(peak - before).to be <= MiniRacerEngine::Worker::REAP_EVERY * 2
    end
  end
end
