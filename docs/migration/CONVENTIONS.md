# Migração da plataforma de atendimento — convenções

Leitura obrigatória para todo sub-agent. O inventário do que migrar está em
[MANIFEST.md](MANIFEST.md).

**Origem** (somente leitura, nunca altere):

- Back-end: `/home/warley/sandbox/ancient-app` (Rails 7, Ruby 3.0, Mongoid 8). Regras próprias em `CLAUDE.md` de lá, inclusive as de Mongo em escala — continuam valendo aqui.
- Front-end: `/home/warley/sandbox/aiva-frontend` (React 18, MUI, Zustand, Formik). Mapa do chat em `docs/chat-unified-contacts.md` de lá.

**Destino:** este repositório. `CLAUDE.md` da raiz continua valendo inteiro, em especial o **Front-end / UX Charter**, i18n e rotas em inglês. Em caso de conflito, o Vekoo vence a origem.

---

## 1. Mapa de conceitos (a armadilha principal)

| Origem (ancient-app) | Vekoo | Observação |
|---|---|---|
| `Admin::CoreAccount` (workspace) | **`Organization`** | A organização vem da **sessão**. Não há id de organização na URL (`ca_hashid` deixa de existir). |
| `Admin::Organization` (o **assistente**) | **não existe** | Assistentes estão fora do escopo; quem automatiza é o **Fluxo** (`Flow`). |
| `Admin::User` | **`Account`** | Pertence a uma organização (`account.organization`). |
| `Admin::UserAccess` | colunas em `Account` | `access_role_id`, `revoked_at`. Sem multi-workspace por enquanto. |
| `Admin::AuthorizationRole` / `auth_map` | **`AccessRole`** / `permissions` | Chaves em `AccessRole::KEYS`. |
| `Admin::Department` | **`Team`** | Na tela continua "Departamento". |
| `Admin::Current` | **`Current`** | `Current.account`, `Current.organization`. |
| IDs inteiros | **UUID** (Postgres) e **BSON string** (Mongo) | Campo Mongoid que aponta para Postgres é `type: String`. No front, todo id é `string`. |

**"organization" muda de sentido.** Na origem é o assistente; aqui é o workspace. O `recycle.rb` converte o antigo sentido no marcador `legacy_assistant` antes de renomear. **Um arquivo só está portado quando `grep -rn "legacy_assistant\|LegacyAssistant\|LegacyUserAccess" <arquivo>` não acha nada** — cada ocorrência é uma decisão: remover, trocar pela organização, ou trocar pelo equivalente em fluxos.

### Renomeação

Reaproveite o código, mas com nomes próprios. O mapa completo é executável, em [tools/recycle.rb](tools/recycle.rb):

```bash
ruby docs/migration/tools/recycle.rb app/models/kanban_column.rb app/models/pipelines/stage.rb
```

Ele reescreve os nomes e aponta o que exige decisão. **Não renomeie à mão de outro jeito**: todos os domínios precisam chegar aos mesmos nomes. Principais:

| Origem | Vekoo |
|---|---|
| `Conversation` / `MessageHistory::*` / `ConversationTag` | `Chat` / `ChatMessage::{Base,Text,Image,Audio,Media}` / `ChatTag` |
| `Integration::*` | `Connector::*` (`WhatsappBusiness`→`WhatsappCloud`, `WhatsappApi`→`WhatsappWeb`, `ZApi`→`Zapi`, `WebBubble`→`WebWidget`) |
| `MessageTemplate` | `WhatsappTemplate` |
| `ChatSnippet` / `ChatAttachment` / `ChatFilter` | `QuickReply` / `Attachment` / `ChatView` |
| `InstanceVariable::Definition` / `Value` | `CustomField` / `CustomFieldValue` |
| `Kanban*` (menu **Pipelines**) | `Pipelines::*` (`KanbanColumn`→`Pipelines::Stage`), tabelas `pipeline_*` |
| `pipeline` (menu **Funis**) | `Funnel*` |
| `Scheduling::*` | `Agenda::*` (`Appointment`→`Booking`, `Collaborator`→`Professional`, `Service`→`Offering`) |
| `Catalog*` | `Products::*`, tabelas `product_*` (`GET /catalog` já é o acervo da ferramenta) |
| `Campaign::*`, `Campaigns::*`, `Apify::Extraction` | `Outreach::*`, `Outreach::PlaceExtraction` |
| `Webhook`, `WebhookAction::*`, `WebhookLog` | `Hook`, `HookAction::*`, `HookLog` |
| `FunctionAction::*` | `ToolFunction::*` |
| `WorkspaceAlert`, `PushSubscription` | `OrganizationAlert`, `PushDevice` |
| `Aiva::ChatAssistant` | `Copilot` |

---

## 2. Isolamento: cada sub-agent no seu worktree

Você recebe um worktree só seu e um **número de agente**. Antes de tudo:

```bash
bash /home/warley/workspace/vekoo/docs/migration/tools/worktree-setup.sh <numero>   # uma vez, na raiz do worktree
```

Isso dá banco de teste, Mongo e portas exclusivos; rspec e Vite rodam sem interferir nos outros.

**Regras de convivência** (é o que permite juntar tudo sem conflito):

1. Mexa só nos arquivos do seu domínio (seção no MANIFEST). Precisou de algo de outro domínio? Se já existe, use; se não existe, **não crie** — anote em "Pendências" no relatório final.
2. **Não comite `backend/db/schema.rb`.** Rode as migrations à vontade; antes de comitar: `git checkout -- backend/db/schema.rb`. O integrador regenera o schema ao juntar.
3. Versão de migration: `20261107` + `00` + número do agente com 2 dígitos + sequência de 2 dígitos. Agente 7, primeira migration: `20261107000701_create_...rb`. Assim nunca há colisão, todas rodam depois da fundação (`20261106120001`) e na ordem das fases, e o Rails aceita: ele recusa versão mais de um dia à frente do relógio, proteção que não deve ser desligada.
4. Não instale dependência: `node_modules` e gems são compartilhados e já contêm o necessário. Se faltar algo indispensável, adicione a linha no `Gemfile`/`package.json`, explique no relatório e siga sem depender dela para os testes, se possível.
5. Arquivos por domínio, para ninguém disputar o mesmo arquivo:
   - Rotas: `backend/config/routes/<dominio>.rb`
   - Associações da organização: `backend/app/models/concerns/organization_relations/<dominio>.rb`
   - i18n do back: `backend/config/locales/<dominio>.pt-BR.yml` e `.en.yml`
   - Jobs recorrentes: `backend/config/schedule/<dominio>.yml`
   - Semente: `backend/db/seeds/<dominio>.rb`
   - i18n do front: `frontend/src/locales/pt-BR/<dominio>.json` e `en/<dominio>.json` (raiz do JSON = nome do domínio)
   - Front: `frontend/src/routes/<dominio>/`, `frontend/src/components/<dominio>/`, `frontend/src/hooks/<dominio>/`, `frontend/src/lib/<dominio>/`
6. Comite no seu branch do worktree **cedo e com frequência**, em commits pequenos e descritivos (mensagens em português, no estilo do `git log`), a cada parte que funciona: a máquina pode reiniciar e o trabalho precisa estar salvo. Termine com a árvore limpa (fora `schema.rb`). **Não faça push nem merge.** Não toque no `main`.
   Nada que precise durar vai para `/tmp`: ele some ao reiniciar. Scripts e arquivos temporários seus ficam em `~/.cache/vekoo-shot/wt<numero>/`, para não colidir com os de outro agente.
7. **Memória é recurso compartilhado:** a máquina tem 16 GB para o editor, os outros agentes e todos os serviços, e cada Vite ocioso ocupa mais de 1 GB. Suba Vite, Rails e Sidekiq só enquanto estiver verificando, e derrube em seguida, sem deixar processo para trás ao encerrar. Não rode a suíte inteira do rspec a cada alteração: rode as specs do que mudou, e a suíte inteira antes de encerrar.
8. `CLAUDE.md` e `DEPLOY.md` são do integrador: não edite. O que precisar constar neles vai no relatório.

---

## 3. Back-end

**Reciclar, não reescrever:** comece pelo `recycle.rb` e adapte. Regras de negócio, validações e casos de borda da origem devem chegar intactos.

### Bancos

Mesma divisão da origem: o que é `Mongoid::Document` lá continua em Mongo, o que é ActiveRecord continua em Postgres. Tabelas Postgres com `id: :uuid` e `organization_id` `uuid`. Campos Mongoid `organization_id`, `account_id`, `team_id` etc. são `String`.

Regras de Mongo (da origem, não negociáveis):

- Nunca `.first`/`.last` sem `order_by` explícito em coleção grande: use `.take`.
- Nunca busque `Chat`/`ChatMessage::*` só por id: escope por `organization_id` (Chat) ou `chat_id` (mensagem). Job recebe o escopo junto com o id.
- Respeite o prefixo dos índices compostos. Webhook de provedor responde 2xx e joga o trabalho para job.
- `index(...)` só existe depois de `bin/rails db:mongoid:create_indexes`.
- Em Postgres: nada de acumular histórico em `jsonb` sem teto; atenção a escrita concorrente na mesma linha.

### Controladores

```ruby
class QuickRepliesController < PlatformController
  require_permission :chat

  def index
    records, meta = paginate(QuickReply.where(organization_id: current_organization.id).order(:name))
    render json: { quickReplies: QuickReplySerializer.many(records), meta: meta }
  end
end
```

- Herdam de `PlatformController` (sessão, `Current`, `@organization`, `paginate`, `require_permission`, e a entrada camelCase → snake_case; mapas livres passam intactos, ver `CamelParams::DEFAULT_OPAQUE`).
- **Entrada com envelope explícito:** o front manda `{ quickReply: { name: "x" } }` e o controlador lê `params.require(:quick_reply).permit(:name)`. `PlatformController` desliga o `wrap_parameters` do Rails, porque ele conflita com o camelCase. Controlador que hoje aceita corpo solto lê os campos soltos (`params[:name]`), sem `require`.
- **Saída:** serializer explícito (`app/serializers/`, herda `ApplicationSerializer`): chaves em **camelCase**, datas em **milissegundos** (`epoch_ms`), ids como string. Mapas livres (atributos personalizados, definição de fluxo) saem como estão.
- **Erro:** sempre `render_error` / `render_invalid` / `render_forbidden` (`{ error: { code, field?, message, details? } }`). `code` em camelCase é contrato de máquina; `message` vem de `config/locales`.
- **Webhook de entrada** (provedores) herda de `ApplicationController`, sem sessão, em `/inbound/...`.
- **Rotas em inglês e kebab-case**: `resources :quick_replies, path: "quick-replies"`; ações `post "read-all"`. Sem prefixo `/api/platform`. Listagens: `{ <recurso>: [...], meta: {...} }`.
- Controladores finos, regra de negócio em service object.

### Jobs e tempo real

- `ApplicationJob` + ActiveJob (adaptador Sidekiq), `perform_later` / `set(wait:)`. Filas: `critical` (mensagens), `default`, `campaigns`, `low`. **Sem `Sidekiq::Status`**: cancelamento por token checado ao executar.
- **Job que executa script de cliente** (`MiniRacerService`) usa `queue_as :scripts`: essa fila roda em processo próprio (`config/sidekiq_scripts.yml`), para um script não derrubar quem entrega mensagens. Contrato do motor em `docs/migration/api/script-engine.md`.
- **Visibilidade de conversa:** todo acesso a `Chat` em nome de uma pessoa passa por `Chat.visible_to(account)`, em REST e em canal.
- ActionCable: `ApplicationCable::Channel`, stream sempre com `organization_stream("nome")` (`self.class.organization_stream(id, nome)` para transmitir de fora). Payloads em camelCase.

### Fora do escopo: remova ao reciclar

Billing/planos/pacotes (`Stripe`, `Packages::`, `PlanLimitEnforcement`, `plan_gated`), assistentes (`OrganizationPrompt`, `classification_steps`, `Trigger` de assistente, follow-ups de assistente), agentes/Marketing Pro, playground, RabbitMQ (eventos do Evolution chegam por webhook), super_user. Créditos: `organization.consume_credits`. LLM: camada `Ai::` do Vekoo (`backend/app/services/ai/`), SDK da Anthropic; embeddings podem usar `ruby-openai`.

### Specs (obrigatórias)

- **Toda classe ou endpoint novo tem spec.** Recicle as specs da origem (`recycle.rb` também serve) quando fizer sentido; onde elas só testam dublês, reescreva contra o banco de verdade.
- Request specs entram como a API manda: `headers: auth_headers(account)` e `as: :json`, sem stub de autenticação. Cubra: sessão ausente (401), permissão (403), isolamento entre organizações (404), validação (422).
- Grupo sem nenhum acesso, para testar 403: `create(:access_role, organization:, permissions: AccessRole::BLANK_PERMISSIONS)`. Não monte o mapa à mão: os níveis são validados, e `chat_list_to` não aceita `none`.
- `create` em documento Mongoid é permitido: o Mongo de teste é real e limpo a cada exemplo. Rede fechada por WebMock: stub explícito para cada provedor. Factories por domínio em `spec/factories/<dominio>.rb`.
- Antes de encerrar: `cd backend && bundle exec rspec` **inteiro** verde no seu worktree. Não apague nem pule spec para passar.

### Contrato para o front

Ao terminar, escreva `docs/migration/api/<dominio>.md`: cada endpoint (método, caminho, parâmetros, resposta real de exemplo), cada canal de ActionCable (nome, parâmetros, eventos e payloads), e códigos de erro. É dele que o agente de front vai partir. A semente `db/seeds/<dominio>.rb` precisa ser idempotente, usar a organização da conta de demonstração (`marina.duarte@exemplo.com.br`) e ter conteúdo brasileiro realista, em quantidade que exercite as telas.

---

## 4. Front-end

**Recriar, não traduzir.** A origem é referência de **funcionalidade**: toda ação, filtro, estado e atalho que existe lá precisa existir aqui. A **aparência** é nova. Comece lendo as telas e os hooks da origem e faça uma lista de funcionalidades; ao final, confira item a item. Hooks, chamadas de API, stores, utilitários e regras de negócio do cliente **são reaproveitados** (adaptando a API para `@/lib/api`, sem MUI, Formik ou axios).

### Stack

React 19 + TS estrito, Tailwind v4, shadcn **base-nova sobre `@base-ui/react`** (a composição é por `render={<X />}`, não `asChild`), SWR via `useApi`, react-hook-form + zod (não Formik), Motion, sonner, TanStack Table. Sem MUI, sem axios, sem Emotion. Zustand é permitido para estado de cliente complexo, com selectors granulares.

### Direção visual

O produto é **quieto e moderno**, não um painel corporativo: tema claro, quase sem cor, hierarquia por tipografia (`font-heading` = Bricolage Grotesque; texto = Geist) e espaçamento generoso. **Um único acento saturado** (violeta, `--primary`) reservado a ação principal, seleção e foco. Nada de sombras pesadas, gradientes decorativos, bordas em tudo, ou cor para enfeitar. Status usam os tons sóbrios de `StatusBadge`. Tokens sempre pelo tema: **sem hex solto em componente** (a exceção é cor escolhida pela pessoa, como etiquetas e pastas).

Não copie o layout da origem por inércia: pergunte qual é a melhor forma de apresentar aquilo hoje. Tabela só quando for mesmo a melhor representação, e então `DataTable`. Prefira lista densa bem espaçada, cards e painéis laterais (`Sheet`) a modais empilhados.

### Componentes

**Leia `frontend/src/components/shared/README.md` antes de escrever a primeira tela**, e reutilize antes de criar: importe de `@/components/shared` (`PageBody`, `PageHeader`, `DataTable`, `FilterBar`, `SearchInput`, `FacetedFilter`, `SortMenu`, `StatTile`, `StatusBadge`, `TagChip`, `UserAvatar`, `ResponsiveDialog`, `SidePanel`, `useConfirm`, `Form` e os campos de formulário, `SortableArea`, `ChipsInput`, `CreatableSelect`, `AreaNav`, `EntityCard`, `Callout`, `ImagePicker`, os esqueletos…). A vitrine viva está em `/dev/kit`. Primitivas shadcn ficam intactas em `@/components/ui`. Componente de domínio em `@/components/<dominio>/`. Faltou algo genérico? Crie no seu domínio e cite no relatório; não edite `components/shared` nem `components/shell`.

- **Cada tela tem um título só, na barra superior.** `RouteFrame` declara o título da rota; `PageHeader` leva título e ações para a barra e deixa no conteúdo só a descrição. Não ponha um título grande no conteúdo.
- **Use `ResponsiveDialog` e `SidePanel`**, não `Dialog` ou `Sheet` direto: as primitivas têm "Close" fixo em inglês para leitor de tela, e o kit já resolve isso.
- **Dois cortes de "celular":** layout de tela e sobreposição por `useIsMobile` (< 768 px); navegação da casca por `useMobileShell` (< 1024 px). Interação (hover, Enter envia) por `useIsTouch`.

### Matriz de estados (toda tela com dados)

**Carregando** (skeleton espelhando o layout final, nunca spinner solto) · **vazio** (`EmptyState` com orientação e CTA) · **erro** (`ErrorState` com tentar de novo) · **sucesso** · parcial/tempo real quando houver.

### Comportamento

- Coleções: busca, filtro e ordenação; paginação ou rolagem infinita; ações em lote e por linha quando fizer sentido.
- Formulários: validação inline, submit com estado de carregando e sem clique duplo, foco inicial e teclado.
- Toda mutação dá retorno (toast ou otimista com SWR). Toda ação destrutiva confirma (`ConfirmDialog`).
- Motion com propósito: `AnimatePresence`, `layoutId`, springs (bounce < 0.1), 150–300 ms, só `transform`/`opacity`, **sempre** com `useReducedMotion`. Presets em `@/lib/motion`.
- Acessível: `focus-visible`, teclado completo, ARIA, contraste, alvo ≥ 40 px em toque.
- **Responsivo desde o início, mobile primeiro**: isto é um PWA; toda tela precisa funcionar em 390 px. Áreas seguras (`pb-safe`), teclado virtual (`useVisualViewport`), `Sheet` no lugar de popover grande no celular.

### Dados e tempo real

- Leitura: `useApi` (SWR) em hooks tipados em `@/hooks/<dominio>/`. Chave = o próprio caminho. Mutação com `mutate` e invalidação por prefixo.
- Tempo real: `useChannel("ChatChannel", params, handler)` de `@/hooks/use-channel`.
- Permissão: `useCan("chat")`, `<RequirePermission permission="chat">`. O menu já filtra.
- Contrato da API: `docs/migration/api/<dominio>.md`. Back-end em `http://localhost:3040`, com a semente carregada. Tipos no próprio domínio. Datas chegam em milissegundos.

### API da casca

Está pronta e é o que as telas devem usar. Não recrie nada disto:

```ts
// Rota: src/routes/<dominio>/index.tsx fica pequeno; a página entra por lazy().
// Não mexa em App.tsx: ele já importa o index.tsx de cada domínio.
<RouteFrame title="chave.i18n" permission="chat"><Pagina /></RouteFrame>
// routes/dev/<nome>.tsx com export default vira /dev/<nome>, só em desenvolvimento.

// @/hooks/use-header-slot: ações da página na barra superior
useHeaderSlot(node, { mobileNode?, mobilePlacement?: "overflow" | "inline" | "toolbar" | "hidden" })
usePageTitle(title, { color?, backTo?, parentTitle? })   // barra superior e aba do navegador

// @/components/app-shell
useShell(): { openCreate, openSearch, scroller }

// @/hooks/use-app-shell
useImmersive(active)   // esconde topbar e barra inferior (conversa no celular)
useFullBleed(active)   // sem padding do <main>; a tela reserva --app-bottom-nav-total no fim do que rola

// @/hooks/use-channel: params por valor; mesmo canal e params dividem a assinatura
useChannel<T>(nome | null, params?, onMessage?): { connected, perform(acao, dados?) => boolean }

// @/hooks/use-can
useCan(key?): boolean; useCanAccess(): (key?) => boolean; usePermissionLevel(key)
<RequirePermission permission="chat" fallback?>   // sem fallback, redireciona e avisa

// @/hooks/use-back-layer: camada que não é popup do Base UI (seleção, painel feito à mão). O resto é sozinho.
useBackLayer(ativa, fechar)                // o voltar do aparelho fecha isto antes de sair da tela

// Dados
useApi(path, config?)                      // @/hooks/use-api
useOptionalApi(path, fallback, config?)    // 404 vira fallback (endpoint opcional)
usePipelineBoards(): { boards, isLoading, error, reload }   // + PIPELINE_BOARDS_KEY
useAlerts(): { badges, reload }
useNotifications(tab?, perPage?); useNotificationMutations(): { readAll, read, dismiss }
usePushNotifications(): { isSupported, isAvailable, permission, isSubscribed, isLoading, error, subscribe, unsubscribe, sendTest }
useNotificationPermission()
apiAssetUrl(path)                          // @/lib/api: avatarUrl, logoUrl

// Viewport
useMobileShell(): { isMobileShell, isCompactPhone, isKeyboardOpen }
useIsTouch() /* @/hooks/use-media-query */; useVisualViewport(); useScrollDirection({ element, ... })
```

- CSS: `--app-bottom-nav-total`, `--app-header-total`, `--app-vh`, `--kb-inset`; utilitários `pb-safe`, `pt-safe`, `pl-safe`, `pr-safe`.
- Folha de baixo: `BottomSheet` em `@/components/shell/bottom-sheet`. Telas sem `fullBleed` já recebem a folga da barra inferior do `<main>`.
- Erros de domínio: `ApiError.code` passa direto (`error.code === "lastOwner"`).

### i18n (regra dura)

**Nenhum texto visível literal em JSX.** Chaves em `frontend/src/locales/{pt-BR,en}/<dominio>.json`, as duas línguas no mesmo commit, chave raiz = domínio (`t("chat.list.empty")`). `{ count }` com `_one`/`_other` para plural; `<Trans>` quando houver marcação; datas e números por `Intl` com `useLanguage()` (`@/lib/format`). Vocabulário sem jargão: "carrossel", "card", "conversa", "contato", "fluxo", "pipeline" — botões com verbo, o mesmo verbo do início ao fim da ação.

### Verificação visual (obrigatória)

Não dê tela por pronta sem olhar. Com `npx vite --port $VITE_PORT` rodando em segundo plano:

```bash
node docs/migration/tools/shot.mjs http://localhost:$VITE_PORT/rota ~/.cache/vekoo-shot/shots/<dominio>-rota.png [--mobile] [--full]
```

Abra o PNG com a ferramenta Read e corrija o que estiver feio, desalinhado ou quebrado, em desktop **e** em `--mobile`. `--full` estica a janela até caber o que rola no `<main>`. O script também lista erros de console e de rede: zero é a meta. Antes de encerrar: `npm run build` e `npm run lint` sem erros novos.

Teste de front: não há framework, por decisão do projeto. Não adicione.

---

## 5. Relatório final do sub-agent

Responda com, nesta ordem:

1. **Branch e último commit** do worktree.
2. **Feito:** o que foi migrado, com contagem de specs/rotas/telas.
3. **Lista de funcionalidades da origem:** o que ficou de fora e por quê (seja específico; "tudo migrado" só se conferiu item a item).
4. **Decisões** que outra pessoa pode querer vetar.
5. **Pendências** para outros domínios (o que precisa existir fora do seu escopo).
6. **Resultado das verificações**, com a saída real: `rspec` (nº de exemplos e falhas) e/ou `npm run build`, `npm run lint` e o que foi visto nos screenshots.

Se algo não funcionou ou não foi testado, diga exatamente isso.
