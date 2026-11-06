# Motor de scripts

Executa, em V8 isolado, o JavaScript escrito por quem usa a plataforma: gatilhos de pipeline, ações de webhook e ferramentas de fluxo. Não tem rota nem migration. É uma API Ruby, e este documento é tudo de que uma frente precisa para usá-la ou acrescentar uma extensão.

Conteúdo: [Rodar um script](#rodar-um-script) · [Contexto](#contexto) · [Acrescentar uma extensão](#acrescentar-uma-extensão) · [Limites](#limites) · [Erros](#erros) · [API JS](#api-js) · [Operação e riscos](#operação-e-riscos) · [O que mudou em relação à origem](#o-que-mudou-em-relação-à-origem)

## Rodar um script

```ruby
service = MiniRacerService.new(organization, chat)   # chat é opcional
response = service.run("return { nome: getContactInfo().name, soma: params.a + 1 };", { a: 1 })

response.result  # => {"nome" => "Maria Souza", "soma" => 2}
```

`code` é o corpo de uma `async function onMessage(params)`, então `await` e `return` valem direto. O resultado é sempre dado puro de JSON: `Hash` com chave texto, `Array`, `String`, número, `true`, `false` ou `nil`, sem objeto Ruby e sem texto em bytes inválidos. Pode ser gravado como está.

```ruby
service.run(code, params = {}, timeout_ms: nil, max_memory: nil, track_caller: false) { |name, payload| ... }
```

| Parâmetro | | |
|---|---|---|
| `params` | `Hash` | O `params` do script. Precisa virar JSON. |
| `timeout_ms` | `Integer` | Tempo total da execução. `nil` usa 15 s; o máximo é 60 s. |
| `max_memory` | `Integer` | Heap do V8, em bytes. `nil` usa 64 MB; a faixa é de 8 a 256 MB. |
| `track_caller` | `Boolean` | Acrescenta `caller_line` a cada evento. É para a tela de testar script. |
| bloco | | Recebe cada evento, ver abaixo. |

`MiniRacerService.new(organization, chat = nil, credentials: nil)`: `organization` é obrigatória, e uma conversa de outra organização levanta `MiniRacerEngine::Error` antes de qualquer JavaScript rodar. `credentials` vira `credentials` no script, para as chaves de uma ferramenta instalada.

### Rode em job, nunca na thread do Puma

Um script pode fazer `fetch` (até 45 s) ou `sleep` (até 30 s). Gatilho e webhook de entrada enfileiram e voltam na hora. `retry` desligado: script não é idempotente, e reexecutar duplicaria o que ele fez (enviar mensagem, criar card, chamar API externa).

```ruby
class Pipelines::CodeRunnerJob < ApplicationJob
  queue_as :default
  discard_on StandardError # o script não é idempotente: nada de tentar de novo

  def perform(action_id, chat_id, organization_id)
    organization = Organization.find_by(id: organization_id)
    chat = Chat.scoped(organization_id, chat_id) # nunca só pelo id
    return if organization.nil? || chat.nil?

    response = MiniRacerService.new(organization, chat).run(code_of(action_id), {}, timeout_ms: 15_000)
    Rails.logger.info("[CodeRunner] #{action_id}: #{response.result.to_json.truncate(500)}")
  rescue MiniRacer::ScriptTerminatedError
    report_failure(chat, "excedeu o tempo limite")
  rescue MiniRacer::V8OutOfMemoryError
    report_failure(chat, "excedeu o limite de memória")
  rescue MiniRacer::Error, MiniRacerEngine::Error => e
    report_failure(chat, e.message)
  end
end
```

### Eventos

Cada chamada a uma extensão emite um evento, útil para log e para a tela de testar script. O nome é o do método Ruby da extensão.

```ruby
service.run("console.log('oi'); tag.add('VIP');") { |name, payload| ... }
# :console_log, { input: ["oi"], output: ["oi"] }
# :add_tag,     { input: ["VIP"], output: {"success" => true} }
```

Com `track_caller: true`, o payload ganha `caller_line:`, a linha do script. Quem assina o evento não derruba o script: uma exceção no bloco vai para o log e a execução segue.

`:fetch`, `:request` e `:download_file` chegam com `Authorization`, `Cookie` e chaves de API trocados por `[FILTERED]`. A URL e o corpo vão como o script escreveu e podem levar segredo: **não grave o `input` desses eventos sem filtrar**. O `output` pode ter até 5 MB, então corte antes de logar.

### Mais baixo nível

`MiniRacerService` é só uma casca sobre o `Worker`, que continua com a API da origem para quem recicla código:

```ruby
session = MiniRacerEngine::SessionContext.new
session.set(:organization, organization)
session.set(:chat, chat)

worker = MiniRacerEngine::Worker.new(session)
worker.on_event { |name, payload| ... }
worker.perform(code, params, timeout_ms: 15_000) # => MiniRacerEngine::Response
```

## Contexto

O script só alcança o que está no `SessionContext`, e o que não está falha fechado.

| Chave | | Sem ela |
|---|---|---|
| `:organization` | A `Organization` dona da execução | `collection.*`, `catalog.*` e `downloadFile` devolvem `{ ok: false, error: "No organization in context" }`; os demais levantam erro |
| `:chat` | O `Chat`, quando houver | `tag.add`/`tag.remove` devolvem `{ success: false }`; os demais levantam `No chat in context` |
| `:tool_credentials` | `Hash` que vira `credentials` no script | `credentials` é `{}` |

Conversa sem organização, ou de outra organização, é recusada antes de rodar. Uma extensão pode guardar o que quiser durante a execução com `@worker.set_context(chave, valor)`. Não há `Current` aqui: um job não tem sessão, e o escopo é sempre o do contexto. A origem tinha também `:admin_organization_id` e `:conversation`, que não existem mais.

## Acrescentar uma extensão

**Crie um arquivo em `backend/lib/mini_racer_engine/workers/`. Só isso.** Não há lista para editar: o motor descobre as extensões pela pasta, então duas frentes em worktrees separados nunca disputam o mesmo arquivo. A classe segue o nome do arquivo, como manda o Zeitwerk.

```ruby
# backend/lib/mini_racer_engine/workers/exemplo.rb
module MiniRacerEngine::Workers
  class Exemplo < MiniRacerEngine::EngineModule
    # Roda a CADA execução, inclusive nas que nunca tocam esta extensão. Só `attach`.
    def register(worker, context, event)
      @worker = worker
      context.attach("exemplo.contarConversas", proc { |*params| attach_method(method(:contar_conversas), params, event) })
    end

    # Opcional: JavaScript carregado antes do script, para montar uma fachada.
    def bootstrap_js
      <<~JS
        globalThis.exemplo.temConversa = function () {
          return exemplo.contarConversas().data > 0;
        };
      JS
    end

    private

    # `params` é a lista de argumentos do JS: exemplo.contarConversas("closed") => ["closed"]
    def contar_conversas(params)
      require_organization!
      status = params[0] || "open"

      { data: Chat.for_organization(organization_id).where(status: status).count, ok: true }
    end
  end
end
```

Pronto, no script:

```js
exemplo.contarConversas()          // { data: 3, ok: true }
exemplo.temConversa()              // true
```

### O que a classe-base dá

`attach_method(method(:x), params, event)` é o caminho de todo callback: conta a cota, limpa a entrada, não deixa detalhe interno vazar, entrega só dado puro e emite o evento. Passe `charge: false` só para o que não pode gastar cota, como o `console`.

| Helper | |
|---|---|
| `organization`, `organization_id` | Do contexto. `organization_id` é texto. Podem ser `nil`. |
| `chat` | Do contexto. Pode ser `nil`. |
| `require_organization!`, `require_chat!` | Devolvem o valor, ou levantam o erro que o script vê. |
| `budget` | A cota desta execução. `nil` fora dela (ver "chamada sem V8"). |
| `bootstrap_js` | JavaScript da extensão. Pode falar com as funções dela, mas não com as de outra ao carregar, só ao ser chamado. |
| `guarded(nome) { }` | Já usado por `attach_method`. Sobrescreva para traduzir um erro próprio em `{ ok: false }`, como `Workers::DynamicTable` faz. |

### Regras

1. **`register` só faz `attach`.** Nada de consulta, e nada que falhe sem organização: ele roda em todo script, e uma exceção aqui derruba **todos os scripts da plataforma**. O `scheduling.rb` da origem lê a organização dentro de `register`: mova isso para quando a função for chamada.
2. **Escope tudo pela organização do contexto.** Id que vem do script nunca é confiável. É por isso que `Chat.scoped(organization_id, id)` existe. Tem de haver spec com id de outra organização.
3. **Mensagem de exceção que chega ao script é só ASCII.** O `mini_racer` a entrega como Latin-1, e "não" viraria "nÃ£o". Texto com acento vai no retorno: `{ ok: false, error: "..." }`.
4. **Só `MiniRacerEngine::Error` leva a mensagem ao script.** Qualquer outra exceção vira `Internal error in <método>` e o detalhe fica no log, porque mensagem de banco conta host e SQL.
5. **Quem bloqueia respeita o prazo.** O `timeout` do V8 só para JavaScript: ele não interrompe um callback Ruby em andamento. Use `budget&.remaining_seconds` como teto de qualquer espera longa.
6. **Rede só por `SafeHttp`**, se a URL vier do script, e com `budget&.charge_fetch!`. Destino fixo (como a API do Google em `maps`) pode usar outro cliente, mas conta na cota mesmo assim.
7. **Coleção grande não entra na memória.** Limite o que lê e use comando atômico do banco: `collection.*` é o modelo.
8. **Nome de API sem colisão.** `dominio.funcao`. Duas extensões no mesmo nome: a última, em ordem alfabética de arquivo, ganha sem avisar.
9. Helper da extensão mora em `workers/<nome>/`: o motor só olha o primeiro nível.

### Reciclando `kanban.rb`, `scheduling.rb` e `class_group_scheduling.rb`

**O `recycle.rb` também renomeia a API JS, e ela não pode mudar**: é contrato de quem escreve script. Depois de reciclar, compare cada `context.attach` com a origem e restaure:

| O que o `recycle.rb` faz | Restaure para |
|---|---|
| `class Pipelines`, `pipelines.listBoards` | `workers/kanban.rb`, `class Kanban`, `kanban.listBoards` |
| `pipelines.findCardsForChat` | `kanban.findCardsForConversation` |
| `booking.services`, `booking.create` | `appointment.services`, `appointment.create` |

E nas chamadas ao contexto:

| Origem | Aqui |
|---|---|
| `@worker.get_context(:conversation)` | `chat` |
| `@worker.get_context(:organization)` (o assistente) | não existe; `organization` agora é a organização |
| `@worker.get_context(:admin_organization_id)` | `organization_id` |
| `Admin::Organization.find(id).admin_core_account` | `organization` |
| `organization.mirror_to_id` | sai junto com o assistente |

`grep -rn "legacy_assistant\|LegacyAssistant" <arquivo>` precisa voltar vazio. `kanban.addComment` guarda o assistente como autor: com ele fora, decida quem assina o comentário.

### Chamada sem V8

O `FlowRuntime::KanbanGateway` da origem chama a extensão direto, sem script. Continua valendo: `MiniRacerEngine::Worker.new(session)` dá o contexto, e `budget` é `nil`, então nada de cota nem de prazo. Use `@worker` e os helpers normalmente, e não dependa de `budget` sem o `&.`.

### Spec

Rode em V8 de verdade, pelo script, como quem usa. `spec/support/script_engine.rb` já traz os atalhos.

```ruby
RSpec.describe MiniRacerEngine::Workers::Exemplo do
  let(:organization) { create(:organization) }

  def run(code) = run_script(code, organization: organization)

  it "conta só as da organização" do
    create(:chat, organization: organization)
    create(:chat, organization: create(:organization))

    expect(run("return exemplo.contarConversas();")).to eq("data" => 1, "ok" => true)
  end

  it "falha fechado sem organização" do
    expect { run_script("exemplo.contarConversas();") }.to raise_error(MiniRacer::RuntimeError, /No organization/)
  end
end
```

`run_script(code, params = {}, organization:, chat:, **opcoes)` devolve o resultado. `stub_public_dns("api.exemplo.test")` libera um host para o `fetch`, já que a rede está fechada pelo WebMock.

## Limites

Todos valem sempre e moram em `MiniRacerEngine::Limits`. Na origem, o tempo era opcional e a memória não tinha limite.

| Limite | Valor | Ao passar |
|---|---|---|
| Tempo total | 15 s; até 60 s, se pedido | `MiniRacer::ScriptTerminatedError`. O script não consegue capturar. |
| Heap do V8 | 64 MB; de 8 a 256 MB, se pedido | `MiniRacer::V8OutOfMemoryError`. O script não consegue capturar. |
| Memória binária (`ArrayBuffer`, typed arrays), somada | 128 MB | `RangeError` no script |
| Objetos `Intl` criados | 5.000 por execução | `RangeError` no script |
| Coleção num builtin (`sort`, `map`, `fill`, `Array.from`, `Object.entries`…) | 2^22 itens (4,2 milhões) | `RangeError` no script |
| Texto num builtin (`split`, `replace`, `match`, `JSON.parse`…) | 2^24 caracteres (16,7 milhões) | `RangeError` no script |
| Argumento das Web APIs (`btoa`, `atob`, `TextEncoder`, `crypto.createHash`…) | 16 MB | Erro no script |
| Argumento de `URL` e `URLSearchParams` | 1 MB | Erro no script |
| Resultado do script | 5 MB de JSON, 100 níveis | `MiniRacer::RuntimeError` |
| Chamadas a extensões | 5.000 por execução | Erro no script, que não ganha mais cota mesmo capturando |
| Chamadas de rede (`fetch`, `request`, `downloadFile`, `maps.*`, `catalog.Search`) | 50 por execução | Idem |
| Resposta de `fetch`/`request` | 5 MB cada, 20 MB somadas | `{ ok: false, status: 413 }` |
| `downloadFile` | 25 MB | `{ ok: false, status: 413 }` |
| Tempo de `fetch`/`request` | 45 s, e nunca além do prazo da execução | `{ ok: false, status: 504 }` |
| Redirecionamentos | 5 | `{ ok: false, status: 400 }` |
| Portas de `fetch` | 80, 443, 8080, 8443 | `{ ok: false, status: 403 }` |
| Argumento de chamada | Texto de até 16 MB, 64 níveis, 200 mil itens | Erro no script |
| Gravação (`collection.*`, `contactStorage`, `contactAttribute`, `downloadFile`) | 50 MB por execução | Erro no script |
| `contactStorage`/`contactAttribute` | 64 KB por valor, 200 chaves de até 128 caracteres por conversa | Erro no script |
| `collection`: registro | 256 KB | `{ ok: false }` |
| `collection`: tabelas | 1.000 por organização | `{ ok: false }` |
| `collection`: lote | 100 em `BulkCreate`, 200 por página | `{ ok: false }` ou teto |
| `collection`: leitura sem paginar | 1.000 registros; `Aggregate` varre 10.000 | Corta e devolve `truncated: true` |
| `sleep` | 30 s, e nunca além do prazo | Dorme menos |
| `console.*` | 500 linhas de até 2.000 caracteres | Some em silêncio |

Cada execução roda num contexto V8 novo, com tudo carregado, o que custa cerca de 8 ms: nada sobrevive entre execuções. O prazo é um só para a execução inteira, inclusive `toJSON` e getter do resultado.

## Erros

**O rescue de quem chama é `MiniRacer::Error`**, que cobre todo erro de script, mais `MiniRacerEngine::Error` para quando o motor recusa rodar. O script não consegue impedir nem forjar nenhum dos dois primeiros da tabela.

| Classe | Quando | `message` real |
|---|---|---|
| `MiniRacer::ScriptTerminatedError` | Passou do tempo | `terminated` |
| `MiniRacer::V8OutOfMemoryError` | Passou da memória | `out of memory` |
| `MiniRacer::ParseError` | Erro de sintaxe | `Uncaught SyntaxError: Invalid or unexpected token at user-code.js:2:7` |
| `MiniRacer::RuntimeError` | `throw`, promise rejeitada, resultado cíclico ou grande demais, cota estourada e não capturada | `Error: faltou o CPF`, `ReferenceError: naoExiste is not defined` |
| `MiniRacer::RuntimeError` | A promise nunca termina (não há timer nem event loop) | `Promise pendente após execução do código JS — apenas operações síncronas (fetch/request) são suportadas; setTimeout/setInterval/SSE não funcionam.` |
| `MiniRacerEngine::Error` | Conversa de outra organização no contexto | `Chat does not belong to the organization in context` |
| `MiniRacerEngine::Error` | V8 subiu sem `--jitless` | `V8 sem --jitless: os limites não valeriam` |

A primeira linha do stack do script vira `message`, e as demais vão no início de `backtrace`, com a linha que a pessoa escreveu: `JavaScript at onMessage (user-code.js:2:7)`. Em `ParseError` a linha vem na própria mensagem.

O que chega ao script como erro normal, que ele pode capturar com `try/catch`:

| Mensagem | |
|---|---|
| `No organization in context`, `No chat in context` | Falta no contexto |
| `Internal error in <método>` | A extensão falhou; o detalhe está no log |
| `Script exceeded the limit of 50 network calls per run`, `... 5000 calls per run`, `... stored bytes per run` | Cota |
| `Arguments too large`, `Arguments nested too deeply` | Argumento grande ou cíclico |
| `RangeError: Script exceeded the binary memory limit` | Memória binária |
| `RangeError: Script exceeded the Intl object limit` | Objetos `Intl` |
| `RangeError: Script exceeded the collection size limit` | Coleção gigante |

## API JS

Globais do V8 estão disponíveis (`JSON`, `Math`, `Date`, `Promise`, `Intl`, `Map`, `Set`, `RegExp`…), e não há `process`, `require`, `setTimeout`, `WebAssembly`, `SharedArrayBuffer`, `Atomics` nem `Intl.Segmenter`. `credentials` é um objeto, e `params` é o argumento de `onMessage`.

### `console`

`console.log(...)`, `console.warn(...)`, `console.error(...)` vão para o log e para os eventos, e devolvem a lista de argumentos. `console.info` e `console.debug` existem e não fazem nada.

### Rede

**`fetch(url, opcoes?)`** devolve uma `Promise` da resposta. **`request(url, opcoes?)`** é a versão síncrona, que devolve o objeto cru.

| Opção | |
|---|---|
| `method` | `GET` (padrão), `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| `headers` | Objeto. `Host` é ignorado. |
| `body` | Texto. Objeto vira formulário (`a=1&b=2`). |
| `handleUrl` / `handle_url` | Tira acento da URL antes de enviar |
| `preserveHeaderCase` / `preserve_header_case` | Envia os nomes de cabeçalho na caixa escrita, para servidor fora da RFC |

```js
const res = await fetch('https://api.exemplo.com.br/pedidos', { method: 'POST', body: JSON.stringify({ a: 1 }) });
res.ok; res.status; res.url; res.error;      // error só em falha sem resposta
res.headers.get('content-type');             // sem ligar para caixa; também has, keys, values, entries
await res.json();                            // já interpretado pelo Content-Type
await res.text();

const raw = request('https://api.exemplo.com.br/pedidos');
// { status: 200, ok: true, body: {...}, headers: {"content-type": ["application/json"]}, url: "..." }
```

O corpo é interpretado pelo `Content-Type`, como o HTTParty fazia: JSON e XML viram objeto, CSV vira lista, o resto é texto em UTF-8. Corpo que diz ser JSON e não é chega como texto. Status 4xx e 5xx **não** rejeitam a promise: vêm com `ok: false`.

Quando não há resposta, `fetch` e `request` também não rejeitam: devolvem `ok: false`, e `error` explica.

| `status` | `error` | |
|---|---|---|
| 403 | `Destination not allowed` | Endereço interno, host que não resolve, porta ou esquema fora da lista, usuário e senha na URL. O motivo não é revelado, porque seria um mapa da rede. |
| 413 | `Response too large` | |
| 504 | `Request timed out` | |
| 400 | `Request refused: ...` | Método desconhecido, cabeçalho inválido, redirecionamentos demais |
| 500 | A mensagem do erro | Falha de rede, como conexão recusada |

Estourar a **cota** de chamadas é diferente: `request` levanta e `fetch` rejeita.

Redirecionamento é seguido e revalidado a cada salto. 301, 302 e 303 viram `GET` sem corpo; 307 e 308 mantêm o método. `Authorization` e `Cookie` não seguem para outro host.

**`downloadFile(url, opcoes?)`** baixa e guarda como anexo privado da organização. Aceita `method`, `headers`, `body` e `fileName`, e devolve `{ ok: true, id, url, name, fileName, contentType, size }` ou `{ ok: false, status, error }`. **Depende de `Attachment`, do domínio inbox:** sem ele, responde `{ ok: false, status: 501 }`.

### Web APIs

Montadas pelo motor, porque o V8 puro não tem:

| | |
|---|---|
| `btoa(texto)`, `atob(base64)` | Usam os bytes UTF-8 do texto, o que funciona para Basic Auth com acento |
| `TextEncoder`, `TextDecoder` | Só UTF-8 |
| `URL`, `URLSearchParams` | URL sem esquema ou host lança `Invalid URL` |
| `structuredClone(valor)` | Cópia por JSON: sem `Date`, `Map`, `Set` nem ciclo |
| `crypto.randomUUID()`, `crypto.randomBytes(n)`, `crypto.getRandomValues(uint8array)` | Até 65.536 bytes. `randomBytes` tem `.toString('hex' \| 'base64' \| 'utf8')` |
| `crypto.createHash(alg)`, `crypto.createHmac(alg, chave)` | `md5`, `sha1`, `sha256`, `sha384`, `sha512`, com `.update(texto).digest('hex' \| 'base64' \| 'base64url' \| 'binary')` |
| `sleep(ms)` | Síncrono. Até 30 s, e nunca além do prazo. |

### Contato

| | Retorno |
|---|---|
| `getContactInfo()` | `{ id, name, external_id, phone_number }`, sem o sufixo do provedor |
| `contactStorage.getItem(chave)`, `.setItem(chave, valor)` | O valor; `true`. Dados do script, que a tela não mostra. |
| `contactAttribute.getItem(chave)`, `.setItem(chave, valor)` | O valor; `true`. Campos personalizados, que a tela mostra e são atualizados na lista na hora. |
| `enableAutomation()`, `disableAutomation()` | `true`. Deixam a nota no histórico. |
| `setFupEnabled(x)`, `setStepperStage(x)` | `{ success: false, error: "Not supported: ..." }`. Eram do assistente: continuam para o script não quebrar, sem efeito. |

A chave é normalizada (`'Cor Preferida!'` vira `cor_preferida`). A escrita é atômica por chave: dois scripts na mesma conversa não apagam a chave um do outro.

### Etiquetas e atribuição

| | Retorno |
|---|---|
| `tag.add(nome)` | `{ success }`. Cria a etiqueta na organização, se preciso. |
| `tag.remove(nome)` | `{ success }`, ou `null` se a etiqueta não existe |
| `tag.list()`, `tag.listUserTags()` | `[{ name, description, color }]`, as da conversa. São iguais, como na origem. |
| `tag.userHasTag(nome)` | `true` ou `false` |
| `assignedUser()` | `{ id, name, email }` ou `null` |
| `userList()` | `[{ id, name, email }]`, sem revogados e sem quem só configura |
| `assignUserByEmail(email)` | `true`. E-mail desconhecido, de outra organização ou `null` **tira o responsável**, como na origem. |
| `assignDepartmentByName(nome)` | `true`. Sem ligar para caixa e acento. Nome desconhecido tira o departamento, como na origem. |
| `assignUser(nome)` | Igual a `assignDepartmentByName`: o nome engana, mas é o contrato da origem |

### `maps`

`maps.routes(origem, destino, opcoes?)`, sobre a Google Routes API. A chave fica no servidor (`GOOGLE_MAPS_API_KEY`).

Opções: `travelMode` (`DRIVE`, `WALK`, `BICYCLE`, `TWO_WHEELER`, `TRANSIT`), `language`, `region`, `units` (`METRIC`, `IMPERIAL`), `avoidTolls`, `avoidHighways`, `avoidFerries`, `departureTime`, `sortBy` (`distance`, `duration`), `maxRoutes` (até 5). Também em snake_case.

```js
{ ok: true, count: 1, origin: "...", destination: "...", travelMode: "DRIVE", sortBy: "distance",
  routes: [{ index: 0, summary: "Av. Paulista", distanceMeters: 2400, distanceText: "2,4 km", durationSeconds: 480,
             durationText: "8 min", staticDurationSeconds: 480, encodedPolyline: "abc", warnings: [] }] }
// ou { ok: false, status: 400, error: "Missing origin" }
```

### `collection`

Tabelas livres, criadas na hora e separadas por organização. Devolvem `{ data, ok: true }` ou `{ error, ok: false }`. Cada registro volta como `{ ...campos, id }`.

| | `data` |
|---|---|
| `Create(tabela, dados)` | O registro. Cria a tabela, se preciso. |
| `Where(tabela, filtro?)` | Lista, até 1.000, com `truncated: true` se cortou |
| `FindById(tabela, id)` | O registro, ou erro `Record not found` |
| `FindOne(tabela, filtro?)` | O mais antigo que atende, ou `null` |
| `Update(tabela, id, dados)` | O registro, com os campos mesclados |
| `Delete(tabela, id)` | O registro apagado |
| `Count(tabela, filtro?)`, `Exists(tabela, filtro?)` | Número; booleano |
| `Paginate(tabela, filtro?, { limit, skip, sort })` | Lista, mais `total`, `limit`, `skip`, `has_more`. `sort: { campo: 'asc' \| 'desc' }`. |
| `Search(tabela, texto, campos)` | Lista dos que contêm o texto, sem ligar para caixa |
| `Distinct(tabela, campo, filtro?)` | Lista de valores, em texto |
| `BulkCreate(tabela, lista)` | Lista dos criados, até 100 |
| `UpdateWhere(tabela, filtro, dados)` | `{ updated }` |
| `DeleteWhere(tabela, filtro)` | `{ deleted }`. Filtro vazio é recusado. |
| `Upsert(tabela, filtro, dados)` | O registro, mais `upserted: true` se criou |
| `Increment(tabela, id, campo, valor = 1)` | O registro. Atômico, e campo que não é número dá erro. |
| `Aggregate(tabela, campo, 'sum' \| 'avg' \| 'min' \| 'max' \| 'count', filtro?)` | O valor. Texto numérico conta como número, e ausente vale 0 em `sum` e `avg`. |
| `ListTables()` | `[{ id, name }]` |
| `DropTable(tabela)` | `{ table, deleted_records }` |

**Filtro:** `{ campo: valor }`, ou com operador: `{ total: { $gte: 10 } }`. Valem `$eq $ne $gt $gte $lt $lte $in $nin $exists $regex $options $not $all $size $elemMatch $and $or $nor $type $mod` no valor de um campo. Os demais, como `$where`, voltam `{ ok: false, error: "Operator not allowed: $where" }`, e o que o próprio Mongo recusar volta `{ ok: false, error: "Query rejected by the database" }`. A chave `id` filtra pelo id do registro.

### `catalog`

Somente leitura, com a mesma busca da tela (`Products::SearchService`). Devolve `{ data, ok: true }` ou `{ error, ok: false }`.

| | `data` |
|---|---|
| `catalog.Search(busca, opcoes?)` | Lista de itens, mais `total` e `strategy`. Opções: `categories`, `tags`, `custom`, `limit` (padrão 5, até 20), `includeInactive`. Conta na cota de rede, porque pode chamar a API de embeddings. |
| `catalog.Get(idOuSku)` | O item, mais `description` e `categories` |
| `catalog.Categories()` | `[{ path, name, items }]` |
| `catalog.Facets(campo)` | `[{ value, count }]`, até 50, para `'tags'` ou a chave de um campo personalizado |
| `catalog.Similar(idOuSku, limite?)` | Lista de itens por proximidade de embedding. Vazia, sem erro, se não houver vetor. |

```js
{ id: "uuid", sku: "DOM-COZ-001", title: "Caneca", summary: "...", url: "https://...", tags: ["presente"],
  image: "https://.../produto.png", images: ["https://.../produto.png"], fields: { cor: "Terracota", preco: 59.9 } }
```

`image` é uma URL absoluta, com a extensão no nome, pronta para mandar pelo WhatsApp como mídia.

## Operação e riscos

| | |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Opcional. Sem ela, `maps.routes` responde `{ ok: false, status: 500 }`. |
| Índices do Mongo | `bin/rails db:mongoid:create_indexes` cria o índice único de `DynamicTable` e o de `DynamicRecord`. |
| `--jitless` | `config/initializers/mini_racer.rb`. Tem de vir antes do primeiro contexto do processo, e o motor recusa rodar sem ele. Script de automação quase não sente: 5 milhões de iterações levam 36 ms em vez de 3 ms. |
| Puma em cluster | Seguro com `preload_app!`: o flag é definido no processo pai, e o V8 só sobe no primeiro contexto, depois do fork. Conferido em spec. |

### Riscos que continuam abertos

**Um script mal-intencionado ainda pode derrubar o processo.** Este motor roda V8 dentro do processo Ruby, e alguns builtins do V8 abortam o processo inteiro em vez de levantar um erro. O `Sandbox` fecha todos os vetores conhecidos, cobertos em `spec/fixtures/files/script_engine_vectors.rb`, mas é uma lista: não prova que não exista outro. **Recomendação ao integrador: rodar os jobs de script numa fila própria, em um processo Sidekiq separado**, para o pior caso matar só esse processo, e não o de mensagens. Isolamento de verdade, com um processo por execução, ficou fora: seria outro projeto.

**Pico de memória além do limite.** Alguns builtins só param ao terminar. `new RegExp` com um padrão de centenas de MB chegou a 870 MB antes do `V8OutOfMemoryError`, e `Function.prototype.apply` com um array enorme a 2 GB. Uma string de 512 MB passada a uma função nativa também é copiada até o Ruby antes de ser recusada, perto de 1 GB. É transitório, mas com vários scripts ao mesmo tempo soma.

**Sem cota por organização.** Os limites são por execução. Nada impede que um script rodando em laço, execução após execução, encha `collection.*` no Mongo.

**`$regex` em `collection.*`** roda no Mongo, com a expressão que o script mandar. A proteção é a do próprio banco contra expressão catastrófica.

## O que mudou em relação à origem

### A gem: de `mini_racer` 0.12 para 0.22

Conferido com scripts rodando em V8 de verdade. `lib/mini_racer/shared.rb` é só o caminho do TruffleRuby: o que vale está na extensão em C/C++.

| | Comportamento na 0.22 | O que o motor faz |
|---|---|---|
| `attach("a.b", proc)` | Igual: cria o namespace, e `console.log` entra no `console` que o V8 já tem. | Nada. |
| `Context.new(timeout:)` | Por `eval`, em relógio de parede. Alcança laço, microtask, regex, getter, `try/finally`. **Não interrompe um callback Ruby**: um `sleep` de 1 s sob timeout de 200 ms durou 1 s. | Script e leitura do resultado no mesmo `eval`; quem bloqueia usa `budget.remaining_seconds`. |
| `Context.new(max_memory:)` | Callback pós-GC sobre o heap. **Não conta `ArrayBuffer` nem objetos ICU**, e não fixa limite no V8. | `Sandbox`. |
| JIT | Em laço que aloca, otimizado pelo TurboFan, nem `timeout` nem `max_memory` param: o V8 aborta o **processo** ao chegar a 1,4 GB, em menos de 1 s, mesmo com `max_memory` de 64 MB. | `--jitless`. |
| Exceção em callback | O JS agora captura, com a mensagem em Latin-1. Se ninguém capturar no topo do `eval`, a classe Ruby original sobe. | Só `MiniRacerEngine::Error` leva a mensagem; o sentinela de `web_apis` continua, por causa do Latin-1. |
| Ruby para JS | `BigDecimal`, `Date` e `Proc` viram a string `"Undefined Conversion"`. Objeto comum levanta `MiniRacer::InternalError`. Texto binário vira UTF-8, com U+FFFD no que for inválido. | `Values.to_js`. |
| JS para Ruby | Função no topo vira `MiniRacer::JavaScriptFunction`, e aninhada some. `Error` vira `MiniRacer::ScriptError`. Ciclo vira Hash recursivo. Surrogate solto vira bytes crus. `Date` inválida levanta `RangeError`. | O resultado sai em JSON; argumentos passam por `Values.from_js`. |
| Microtasks | Drenam antes do `eval` voltar, então o `timeout` as cobre. | O desfecho do script volta por callback, dentro do `eval`. |
| `eval_await` | Novo. Com promise que nunca termina, espera até o timeout. | Não usa: a origem responde na hora com um erro claro, e isso continua. |
| `dispose` | Libera o V8, mas a thread nativa só termina quando o GC do Ruby finaliza o objeto: 200 execuções sem GC, 217 threads. | GC menor a cada 32 execuções, que custa 5 ms. |
| Fork | O V8 só sobe no primeiro contexto, e `set_flags!` só guarda o flag. | Conferido em spec. |
| Custo | 2 a 3 ms por contexto; 8 ms com tudo carregado. | Nada. |

### Buracos que a origem tinha

| Origem | Aqui |
|---|---|
| `HTTParty.send(method.to_sym, ...)` com `method` vindo do script: dava para chamar `load`, `send` e outros métodos Ruby | Tabela de métodos HTTP |
| `fetch` alcançava qualquer endereço, inclusive metadados da nuvem, Redis e Postgres | `SafeHttp` |
| `collection.Search` usava `.or`, que no Mongoid quer dizer "da tabela OU o filtro": devolvia registros de **qualquer organização** | `any_of` |
| `assignUserByEmail` procurava em todas as contas da plataforma | Só na organização, e só quem atende |
| Sem organização no contexto, `collection.*` caía num espaço de tabelas compartilhado por toda execução sem contexto | Falha fechado |
| `$where` e afins chegavam ao Mongo pelo filtro | Lista de operadores |
| Exceção Ruby levava a mensagem ao script | `Internal error in <método>`, e o detalhe no log |

### Comportamento que mudou de propósito

| Origem | Aqui |
|---|---|
| Sem limite de tempo por padrão, e sem limite de memória | Sempre ligados |
| `request` em falha de rede devolvia JSON em texto, e `res.status` ficava `undefined` | Sempre objeto, com `ok: false` |
| `fetch` em qualquer porta | 80, 443, 8080, 8443 |
| O resultado podia trazer `Time`, `MiniRacer::JavaScriptFunction`, Hash cíclico ou bytes inválidos | Sempre JSON. `Date` vira texto ISO, `BigInt` vira texto, `Map` vira objeto, `Set` vira lista, função some, e ciclo é erro. |
| `catalog`: `image` no formato `attachment_id_<id>`, que a assistente conhecia | URL absoluta |
| `collection.Where`/`Search` liam a tabela inteira | Até 1.000, com `truncated` |
| `collection.Increment` lia, somava e salvava, e texto numérico contava como número | `$inc` atômico, e campo não numérico é erro |
| `collection.Update`/`Upsert`/`UpdateWhere` regravavam o mapa inteiro | `$set` por chave. Chave com ponto vira caminho aninhado, igual ao filtro. |
| `new URL('so-um-caminho')` devolvia uma URL em branco, por faltar um `return` | Lança `Invalid URL` |
| `randomBytes().toString('base64')` codificava os bytes errados | Os bytes de verdade |
| `console.*` não tinha `caller_line` em `track_caller` | Tem |
| A linha do erro vinha com 1 a mais | A linha que a pessoa escreveu |

### Ficou de fora

| | |
|---|---|
| `workers/kanban.rb`, `scheduling.rb`, `class_group_scheduling.rb` | Das frentes `be-pipelines` e `be-automation` |
| `register_follow_up`, `semantic_search` | Presos a assistente |
| `MiniRacerService#execute!` e `#chat_completion_request` | O laço de ferramentas da OpenAI, preso às configurações do assistente. Os blocos de IA dos fluxos ficam sobre `Ai::` (`be-automation`). Daqui eles usam `MiniRacerService#run` para executar cada ferramenta chamada. |
| `credentials_for` | Depende de `ToolInstallation`. Passe `credentials:` ao criar o `MiniRacerService`. Só instalação `enabled` deve passar credencial. |
| `TriggerAction`, `FunctionAction`, `WebhookAction` e canais de playground | Das frentes que os usam |
