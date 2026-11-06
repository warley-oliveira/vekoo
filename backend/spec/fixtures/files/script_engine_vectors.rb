# Rodado em subprocesso por spec/lib/mini_racer_engine/sandbox_spec.rb. Cada um destes aborta o
# processo ou prende a thread se as proteções do motor regredirem: por isso não roda dentro
# da suíte. O que importa é chegar ao fim com exit 0.
BIG = "let s = 'x'; for (let i = 0; i < 28; i++) s += s;".freeze # string gigante, sem passar pelo repeat
UNDER = "let s = 'x'; for (let i = 0; i < 24; i++) s += s; s = s.slice(1);".freeze # logo abaixo do teto

VECTORS = {
  # abortavam com `Fatal JavaScript ...`
  "array_fill" => "return new Array(2 ** 29).fill(0).length;",
  "array_from" => "return Array.from({ length: 2 ** 28 }).length;",
  "typed_like" => "return new Uint8Array({ length: 2 ** 28 }).length;",
  "length_fill" => "const a = []; a.length = 2 ** 29; a.fill(0); return a.length;",
  "fill_call" => "return Array.prototype.fill.call({ length: 2 ** 29 }, 0).length;",
  "getter_from" => "let n = 0; return Array.from({ get length() { return n++ ? 2 ** 28 : 1 } }).length;",
  "getter_typed" => "let n = 0; return new Uint8Array({ get length() { return n++ ? 2 ** 28 : 1 } }).length;",
  "split" => "return 'x'.repeat(2 ** 28).split('').length;",
  "split_cons" => "#{BIG} return s.split('').length;",
  "match" => "#{BIG} return s.match(/x/g).length;",
  "replace_all" => "#{BIG} return s.replaceAll('x', 'yy').length;",
  "replace_fn" => "#{BIG} return s.replace(/x/g, () => 'yy').length;",
  "symbol_match" => "#{BIG} return /x/g[Symbol.match](s).length;",
  "symbol_replace" => "#{BIG} return /x/g[Symbol.replace](s, 'yy').length;",
  "symbol_split" => "#{BIG} return /x/[Symbol.split](s).length;",
  "json_parse" => "return JSON.parse('[' + '1,'.repeat(2 ** 27) + '1]').length;",
  "swap_number" => "globalThis.Number = () => 0; return new Array(2 ** 29).fill(0).length;",
  "swap_string" => "globalThis.String = () => ''; #{BIG} return s.split('').length;",
  "swap_math" => "Math.max = () => 0; Math.trunc = () => 0; return new Array(2 ** 29).fill(0).length;",
  "swap_symbol" => "Symbol.iterator = 1; return Array.from({ length: 2 ** 28 }).length;",
  # laço otimizado que aloca, o caso que o --jitless resolve
  "alloc_loop" => "const a = []; while (true) a.push(new Array(1000));",
  "warm_alloc" => "function f(n) { const a = []; for (let i = 0; i < n; i++) a.push(new Array(1000)); return a.length } " \
                  "for (let i = 0; i < 2e5; i++) f(1); return f(1e12);",
  # prendiam a thread além do prazo
  "sort" => "const a = []; a.length = 2 ** 29; return a.sort().length;",
  "reverse" => "const a = []; a.length = 2 ** 29; return a.reverse().length;",
  "slice" => "const a = []; a.length = 2 ** 29; a[2 ** 29 - 1] = 1; return a.slice().length;",
  # logo abaixo do teto: erro limpo ou sucesso, nunca abortar
  "under_match" => "#{UNDER} return s.match(/x/g).length;",
  "under_replace" => "#{UNDER} return s.replaceAll('x', 'yy').length;",
  "under_split" => "#{UNDER} return s.split('').length;",
  "under_fill" => "return new Array(2 ** 24).fill(0).length;",
  "under_from" => "return Array.from({ length: 2 ** 24 }).length;",
  "under_sort" => "const a = []; a.length = 2 ** 24; return a.sort().length;",
  "under_map" => "return new Array(2 ** 24).fill(0).map(x => x + 1).length;",
  "many_under" => "#{UNDER} const k = []; while (true) k.push(s.split(''));",
  # outros caminhos para encher a memória
  "spread_string" => "#{BIG} return [...s].length;",
  "from_string" => "#{BIG} return Array.from(s).length;",
  "keys_spread" => "return [...new Array(2 ** 27).keys()].length;",
  "set_iter" => "return new Set(new Array(2 ** 27).keys()).size;",
  "map_iter" => "return new Map(new Array(2 ** 27).entries()).size;",
  "fn_spread" => "function f() { return arguments.length } return f(...new Array(2 ** 27));"
}.freeze

session = MiniRacerEngine::SessionContext.new

VECTORS.each do |name, code|
  outcome =
    begin
      MiniRacerEngine::Worker.new(session).perform(code, {}, timeout_ms: 2_000).result
      "ok"
    rescue MiniRacer::Error => e
      "#{e.class}: #{e.message.lines.first.to_s.strip}"
    end
  puts "vector #{name} #{outcome}"
  $stdout.flush
end

# Puma em cluster e `preload_app!`: o flag é definido no processo pai, e o primeiro contexto
# nasce depois do fork.
reader, writer = IO.pipe
pid = fork do
  reader.close
  writer.write(MiniRacerEngine::Worker.new(session).perform("return 40 + 2;").result.to_s)
  writer.close
  exit!(0)
end
writer.close
output = reader.read
Process.wait(pid)
puts "fork #{output == "42" && $?.success? ? "ok" : "falhou: #{output.inspect}"}"
