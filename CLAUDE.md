# vekoo-app

Full-stack monorepo. Rails 8.1 API backend + React 19 / Vite / TypeScript frontend.
Environment: **WSL2 Ubuntu** — use Linux commands only.

## Stack

- **Backend:** Ruby on Rails 8.1 (API-only), Ruby 3.4, PostgreSQL 16 + pgvector, MongoDB 7 (Mongoid), Redis, Sidekiq (ActiveJob), ActionCable, mini_racer (V8), RSpec.
- **Frontend:** React 19, Vite, TypeScript (strict), Tailwind v4, shadcn/ui (base-nova, on `@base-ui/react`: compose with `render={<X />}`, not `asChild`), SWR, Motion, sonner, react-hook-form + zod, TanStack Table, PWA.
- **Infra (dev):** Postgres + MongoDB + Redis via Docker Compose. Rails, Sidekiq and Vite run natively on WSL2.
- **Production:** API on a VPS with Kamal, front on Cloudflare. Everything is in `DEPLOY.md`.

## Layout

```
vekoo/
├── backend/            # Rails 8.1 API-only (RSpec, Sidekiq)
├── frontend/           # Vite + React + TS (shadcn, SWR)
├── docs/migration/     # conventions, decisions and one API contract per domain
├── docker-compose.yml  # postgres + mongodb + redis only
├── Procfile.dev        # web + worker + scripts + front
├── bin/setup           # one-time bootstrap, idempotent
├── bin/dev             # start infra + all processes
├── bin/deploy-setup    # provisions the production host
├── .env.example        # every variable the code reads, and what stops without it
└── .env                # single source of truth (NOT committed)
```

## Ports (this project — offset 10)

| Service   | URL / host                  |
|-----------|-----------------------------|
| Postgres  | localhost:5472  |
| MongoDB   | localhost:27057 |
| Redis     | localhost:6419  |
| Rails API | http://localhost:3040 |
| Vite      | http://localhost:5213 |

All derived from `PORT_OFFSET` in `.env`. Docker Compose is namespaced via
`COMPOSE_PROJECT_NAME`, so this project runs alongside others without collision.

## Setup & run

- **First time:** `bin/setup` (creates `.env`, Mongo indexes, database and seed)
- **Every day:** `bin/dev` (infra, pending migrations and new indexes, then Rails, both Sidekiqs and Vite)
- **Backend tests:** `cd backend && bundle exec rspec`
- **Demo account:** `marina.duarte@exemplo.com.br` / `carrossel123` (in two organizations: owner of
  "Marina Duarte Conteúdo", member of "Clínica Bem Viver"). Demo Vekoo support (`master`, dev only):
  `suporte@vekoo.com.br` / `suporte-vekoo-123`.

**WSL2 rule (hard):** this repo must live on the Linux filesystem (`~/workspace/...`),
**never** under `/mnt/c`. Windows-mounted paths destroy Vite HMR and Rails boot performance.

The root `.env` is the single source of truth. The backend reads it via the symlink
`backend/.env -> ../.env`; the frontend reads it via `envDir: '..'` in `vite.config.ts`.

## Deploy (production) — full guide in `DEPLOY.md`

| Piece | URL | Deploy |
|---|---|---|
| API | `https://syco.vekoo.app` (VPS `107.152.37.59`, Kamal) | commit first, then `set -a; . ./.env.deploy; set +a; cd backend && kamal deploy` |
| App | `https://my.vekoo.app` (Cloudflare Worker `vekoo`) | `cd frontend && rm -rf dist && VITE_API_URL=https://syco.vekoo.app npm run build && npx wrangler deploy` |
| Landing | `https://vekoo.app` (Cloudflare Worker `vekoo-landing`) | `cd landingpage && npx wrangler deploy` (source: `vekoo-saas-landing_2.html`) |

Needs `~/.ssh/vekoo_deploy`, the root `.env.deploy` and `wrangler login` on the
**Vekoo** Cloudflare account. Kamal builds from a **git clone** (uncommitted changes
never ship) and uses its local registry (no GHCR). Never turn on *Always Use HTTPS* on
the `vekoo.app` zone — it breaks the Let's Encrypt renewal for `syco`.

## Conventions

**Before working on a domain, read `docs/migration/CONVENTIONS.md`** (the full rules) and its
contract in `docs/migration/api/<domain>.md`. `docs/migration/DECISIONS.md` records what was decided and
what is still open. The rules that apply everywhere:

- **Backend:** thin controllers on `PlatformController`. **The organization comes from the tab's
  account:** the front sends the hashid of the person's `Account` (their link to one organization) in
  `X-Account` (and `account=` on the WebSocket); `Authenticatable` checks it belongs to the session's
  `User` and is active, and `current_account`/`current_organization` come from it — never from an id in
  the path or body. A foreign or unknown hashid is `404 accountNotFound`. Business logic in service objects; JSON through `ApplicationSerializer` (camelCase, dates in
  **milliseconds**, ids as strings); errors always `{ error: { code, field?, message, details? } }`.
  Background work goes through ActiveJob on Sidekiq, and client JavaScript only on the `scripts` queue,
  a process of its own. RSpec only — there is no Minitest.
- **Two databases:** Mongoid for high volume or free-form data, ActiveRecord for the rest. A Mongo
  `index(...)` only exists after `bin/rails db:mongoid:create_indexes`, and aggregations use `hint`:
  without the index, Mongo refuses them. Never fetch `Chat` or `ChatMessage::*` by id alone, and a
  person's access to a chat always goes through `Chat.visible_to(account)`.
- **One file per domain** (routes, locales, schedule, seeds; `routes/<domain>/`, `components/<domain>/`
  and `hooks/<domain>/` on the front), so nobody fights over the same one.
- **Environment (hard rule):** a new `ENV` or `import.meta.env` goes into `.env.example` and, if it
  applies to production, `.env.deploy.example`, `backend/config/deploy.yml` and `backend/.kamal/secrets`,
  in the same commit, with what stops working without it.
- **i18n (hard rule):** **no user-visible string literal in JSX, ever.** Frontend uses
  **i18next + react-i18next** (`src/lib/i18n.ts`, static bundles in `src/locales/<lang>/<domain>.json`,
  root key = domain). Languages: `pt-BR` (source, fallback) and `en`; add a key to **both** files in the
  same commit. `useTranslation()` for copy, `<Trans>` when the string contains markup, `{ count }` for
  plurals (`key_one` / `key_other`) — never string concatenation. Dates/numbers come from `Intl` with
  `useLanguage()` (see `lib/format.ts`), never hand-written per locale. Non-UI modules (`lib/auth.tsx`)
  carry **codes** (`AuthErrorCode`) and the screen translates them. Backend: `Localizable` resolves the
  locale per request from `?locale=` or `Accept-Language`. Example content in the seeds is the fictional
  *user's work*, not UI — it stays pt-BR on purpose.
- **Frontend:** data through `useApi` (SWR) over the typed client in `@/lib/api`, realtime through
  `useChannel`, permissions through `useCan`. Every platform screen lives under `/a/:account/...`;
  import the router from `@/lib/router` (never `react-router`, the lint refuses it), which prefixes
  absolute paths with the tab's account, so screens keep writing `/chat`. **Read `src/components/shared/README.md` before building a
  screen:** `@/components/shared` is the kit, with a live showcase at `/dev/kit`. **Every task, edit or
  detail opens in a modal (`ResponsiveDialog`) sized by its content; a drawer only for low-relevance
  information** (action menus, pickers, filters, notifications). Never `Dialog` or `Sheet` directly, no
  side panels. One title per screen, in the top bar, declared by
  `RouteFrame`. shadcn primitives live untouched in `@/components/ui`; domain components in
  `@/components/<domain>`. Add primitives with `npx shadcn@latest add <component>`. It is a PWA: every
  screen must work at 390 px.
- **Routes (hard rule):** every URL path in the platform is in **English**, kebab-case —
  frontend routes and Rails API paths alike (`/login`, `/quick-replies`, `/folders/:id`, `/settings/users`).
  Platform screens carry the account prefix (`/a/<hashid>/settings/users`); account-level screens don't
  (`/login`, `/signup`, `/organizations`).
  Query params too (`?next=`). Only the **visible copy** is pt-BR; the URL never is. Same for file and
  component names.
- **Git:** single `main` branch. No feature-branch flow. Small, descriptive commits. Until the decision to
  take it to `main`, the platform lives in `platform-migration`.

## Testing scope

RSpec runs in the backend only. The frontend has **no** test framework by design — do not
add one.

## Domínio — Vekoo (essencial)

Duas frentes no mesmo produto, para um público amplo (social media, lojista, nutricionista,
professor…): a interface não assume repertório técnico nem pode parecer ferramenta corporativa.

- **Atendimento:** conversas de WhatsApp, Instagram, Messenger e widget num só chat, com contatos,
  catálogo, agenda, pipelines, funis, campanhas e automação por fluxos.
- **Criação:** a pessoa descreve um assunto em uma frase e recebe um carrossel de Instagram pronto para
  editar e exportar. Tudo nasce dentro de uma marca: `/brands/:brandId/...` (início, `create`,
  `contents`, `carousels`, `folders/:id`, `templates`, `trash`, `settings`); ver "Marca como contexto raiz".

`/` abre o Dashboard, ou a primeira tela que a pessoa pode ver. O menu está em
`frontend/src/lib/navigation.ts`. A IA fica em `app/services/ai/` (Anthropic, com geração por SSE) e cobra
créditos.

**Mapa de conceitos** (completo em `CONVENTIONS.md`). O código veio de outro produto, com nomes trocados, e a
tela nem sempre usa o nome do código:

| Código | Na tela | Contrato |
|---|---|---|
| `User` (a pessoa e o login: e-mail, senha, nome, foto, idioma; `master` = suporte do Vekoo) | Pessoa, Perfil | `access` |
| `Organization` (o workspace), `Account` (o vínculo `User` × `Organization`: papel, grupo, revogação; vem de `X-Account`), `AccessRole`, `Team` | Organização, Usuário, Grupo, Departamento | `access` |
| `Connector::*` (`WhatsappCloud`, `WhatsappWeb`, `WebWidget`…), `WhatsappTemplate` | Integrações | `connectors` |
| `Chat`, `ChatMessage::*`, `ChatTag`, `QuickReply`, `Attachment`, `CustomField`, `Copilot` | Chat, Contatos, Etiquetas, Mensagens Rápidas | `inbox` |
| `Flow`, `Tool`, `ToolFunction::*`, `Hook` | Fluxos, Ferramentas, Webhooks | `automation` |
| `Pipelines::*` (`Board`, `Stage`, `Card`) | Pipelines (o kanban) | `pipelines` |
| `Funnel` | Funis (a posição fica em `Chat#funnel_stages`) | `insights` |
| `Agenda::*` (`Booking`, `Professional`, `Offering`) | Calendário | `agenda` |
| `Products::*` | Catálogo. Atenção: `GET /catalog` é outra coisa, o acervo da ferramenta de carrossel | `products` |
| `Outreach::*` | Campanhas | `outreach` |
| `lib/mini_racer_engine` | Script de cliente em V8 isolado | `script-engine` |

**Autenticação:** sessão do `User` por `Authorization: Bearer` (o banco guarda só o resumo SHA-256 do
token); a organização da aba vem do vínculo em `X-Account`. Uma pessoa pode estar em várias organizações,
um `Account` por organização. **Criar conta cria a organização** e a pessoa entra como `owner`. Permissão
por `AccessRole` e `Account#can?`, que é sempre verdadeiro para dono, para o vínculo de suporte e para
`User#master` (o suporte do Vekoo, ligado só por `bin/rails "support:grant[EMAIL]"`). `User#staff` é
quem opera a criação na Vekoo: a curadoria (`/admin`) e a entrada nas organizações **internas** (as das
marcas de teste, `organizations.internal`) pela mesma lista do suporte, com um vínculo de suporte; liga só
por `bin/rails 'staff:grant[EMAIL]'`.

**Semente:** `db/seeds.rb` tem o acervo e a conta de demonstração, e cada domínio tem a sua em
`db/seeds/<domain>.rb`, tudo idempotente. Em produção só o acervo roda, a menos que `SEED_DEMO_DATA=1`: dado do produto que precisa
existir em todo ambiente vai em `platform:sync`, que o deploy roda sozinho.

**Onboarding por conversa (a porta de entrada de toda marca):** marca nova cai em
`/brands/:id/onboarding` — intro e depois uma **conversa**: o agente pergunta um
tema por vez, a pessoa responde do jeito dela e o LLM grava no campo certo do
rascunho. Ela nunca vê campo, seção ou schema. Temas (`BrandCore::Onboarding`):
`brand` (nome + o que vende + ramo), `audience` (`identity.audience`),
`differential` (`identity.positioning`), `voice` (exemplo → `voice.examples`,
essência e tons inferidos), `banned`, `offers`, `logo`, `palette`, `fonts` —
paleta e fonte são **uma** pergunta (`brandcore · 8/8`) e dois temas. Obrigatórios:
`brand`, `palette`, `fonts` (não fecham vazios); resposta vaga ganha **um**
seguimento por tema, escrito pelo modelo sobre o que ela disse (fallback fixo). A
conversa é uma `AgentConversation` de `purpose: "onboarding"` (uma por marca, fora
da faxina de 30 dias) e cada fala é um `AgentTurn` (`answer`/`suggest`/`choose`/`logo`)
— mesma fila (`AgentTurnJob` → `Onboarding::Run`) e mesmo canal (`AgentChannel`) da
criação de peças. O agente responde em **códigos** (`plan["reply"]`: status, pergunta,
propostas, resumo) e a tela traduz; só o seguimento vem como texto. Leitura em
`Onboarding::Interpret` (campos permitidos por tema) + `Onboarding::Fields` (grava via
`assign_section`). Sem chave ou com o teto de OPEX batido, lê sem modelo (as palavras
dela no campo principal); falha do modelo vira `modelDown` com "tenta de novo"
(`POST .../onboarding/retry`). **Não gasta crédito.** "Não sei — cria pra mim" (chip
em tom, logo, paleta, fonte) usa `Onboarding::Suggest` — três opções validadas, nunca
falha (curadas em `Onboarding::Fallbacks`); escolher paleta já abre as fontes; na logo
ele só anota e, ao chegar no resumo (com paleta e fonte), sai o **logotipo tipográfico**
(`RenderWordmark`, libvips, grátis e reserva) e, em segundo plano (`LogoConceptsJob` →
`Logos::Concepts`), as **logos com símbolo**: o Opus escreve a direção de arte de quatro
símbolos (figurativo, geométrico, monograma, emblema — sem texto), o Nano Banana desenha,
o **vtracer** vetoriza (ladrilho e branco viram fundo) e `Logos::Lockup` monta símbolo +
nome na fonte da marca, ao lado e em cima, em claro e escuro (~US$ 0,31 por marca, no
teto de OPEX). Elas chegam no mesmo bloco de opções (`pending`/`failed`); escolher uma
leva o símbolo como **glifo** da marca. Logo enviada passa por `PngInspector` e
alimenta a paleta (`DominantColors`). Fonte fora do catálogo não entra: o agente avisa
e o "cria pra mim" propõe as que chegam perto. Depois do resumo, o que se escreve é
ajuste (qualquer campo). `POST /onboarding/finish` publica a **versão 1** pelo
`PublishBrandCore` e leva ao agente. Marcas do onboarding de telas retomam no primeiro
tema aberto; publicadas contam como concluídas. O wizard de oito seções segue em
`/setup/:step` como modo de edição, sem link no fluxo. Telemetria em
`onboarding_events` (`bin/rails onboarding:funnel`). Front: `routes/onboarding.tsx` +
`components/onboarding/` (labels e status em IBM Plex Mono, `font-mono`).

**Fontes que realmente renderizam:** `BrandFonts` baixa o TTF do catálogo aberto
(Google Fonts) e guarda em `tmp/brand_fonts`; `Engines::Tokens#font` passa o
arquivo ao Pango. Sem isso o catálogo era decorativo — o servidor só tem DejaVu
e Ubuntu instaladas, e toda peça saía na mesma fonte independentemente da
escolha da marca. Falha vira `nil` e cai no comportamento antigo, nunca derruba
a renderização. `bin/rails fonts:warm` enche o cache. A lista vive nos dois
lados (`BrandCore::FontCatalog` / `lib/font-catalog.ts`), com spec que compara
as duas.

**Brandcore (a marca como dado):** um por organização, recurso singular na API —
`GET/PATCH /brand-core` (rascunho salvo **seção a seção**, `PATCH` recebe
`{ brandCore: { document: { <seção> }, progress } }`), `POST /brand-core/publish`
(exige o mínimo obrigatório; cada publicação depois da primeira vira
`BrandCoreVersion` com `change_list`), `GET /brand-core/versions`,
`POST/DELETE /brand-core/assets` (logo/glifo/foto/fonte por arquivo; PNG passa por
`PngInspector`, que confere transparência real sem libvips). A forma do documento é
**uma só**: `backend/app/models/brand_core/schema.rb` (normaliza, valida por caminho
`palette.colors.2.hex`, defaults dos estilos) espelhado em
`frontend/src/lib/brand-core.ts` (tipos, enums e zod por etapa) — mudou um, muda o
outro. Completude e mínimo em `BrandCore::Completeness`; a geração lê só
`published_document` via `BrandCore#generation_contract`. A identidade carrega também
`niche` e `archetypes: { primary, secondary }` ("Nicho" e "Estilo da marca" no passo de
identidade; o onboarding deduz o nicho no tema `brand` e o estilo no tema `voice`), nos
códigos da taxonomia do banco de referências — dentro do documento de propósito, para
versionar como o resto. Marca publicada antes do campo não ganha nicho no rascunho:
`BrandCore#generation_niche` lê o publicado e, sem ele, deduz por
`BrandCore::NicheInference` (palavra-chave no ramo, depois no conceito; padrão só para
`restaurant`/`health`/`education`; loja e serviço sem pista ficam **vazios** — nicho
errado é pior que nenhum). `bin/rails brands:infer_niche` (`DRY_RUN=1`) preenche só o
rascunho das nunca publicadas. A etapa **"produtos & ofertas"**
(`document.offers.items`: nome, preço, descrição, vigência — tudo texto livre) é
o conhecimento de que o agente tira todo número que a peça mostra; a etapa
"anotações" é um texto livre e opcional (`document.notes.text`) para o que sobra
(horário, endereço). Nenhuma das duas entra na conta da completude nem bloqueia
nada. Tempo real por ActionCable
(`BrandCoreChannel`, montado em `/cable`, token em `?token=`): a outra aba recarrega
pelo SWR e ignora o próprio eco via `X-Client-Id`. Front: `/brands` (visão geral,
histórico, publicar) e `/brands/setup/:step` (wizard, 8 etapas, autosave em
`components/brand/use-step-form.ts`). Cadastro novo cai no **onboarding
guiado** (acima); o wizard é o modo de edição.

**Layouts e peças (a contraparte do Brandcore):** a peça **é** um documento
(`PieceDocument`, espelho em `frontend/src/lib/piece-document.ts`); a imagem é
derivada dele. O documento tem `format` (`feed_square`, `feed_portrait`, `story`,
`carousel`), `slides` (cada lâmina = um `layoutId` + `background` + `blocks` nos
slots do layout), `caption` (legenda + hashtags) e `meta`. Três travas de marca
moram na forma: cor é **token** (`primary`, `secondary`, `accent`, `surface`,
resolvido contra a paleta publicada no render), tipografia é **papel** (`display`,
`headline`, `body`, `label`, `caption`) + `sizeStep` relativo, posição é **slot** do
layout (bloco arrastado ganha `frame`, preso na área segura). Um layout é um
**contrato** em `backend/layouts/<id>.yml` (slots com tipo `text`/`image`/`logo`,
`max_chars`/`max_lines`, formatos, posição no carrossel, opções de fundo e
`geometry` por formato), lido por `Layouts::Registry` — **layout novo = arquivo
novo** + o componente nos dois renderizadores (guia em `backend/layouts/README.md`).
`PieceDocument.normalize` dá a forma (bloco sem slot vai para `orphans`, nunca some)
e `PieceDocument::Validator` confere contra os contratos (modo `strict` para o
agente). Cada gravação é uma `PieceVersion` imutável (`source`: `generation`,
`user_edit`, `conversation`, `layout_change`, `restore`, `migration`…); restaurar
cria versão nova. Editor: `PATCH .../pieces/:id/document` (autosave, com
`baseVersionId` — outra aba salvou antes = 409, sem merge), `POST .../operations`
(vocabulário fechado de `PieceDocument::Operations`, espelho em
`lib/piece-operations.ts`), `GET .../versions` + `restore`. Render: dois intérpretes
da mesma geometria — `libvips` (Pango, padrão em `PIECE_RENDERER`) e `react` (o
Chromium via Ferrum abre a rota `/render` do front com um token de 10 min,
`FRONTEND_URL` + `CHROME_PATH`) —, um `PieceRender` por lâmina, reaproveitado por
**checksum** (lâmina igual não redesenha, nem em outra peça). `RenderPieceJob`
(Sidekiq, adapter do ActiveJob em `config/initializers/sidekiq.rb`; `:test` nas
specs) roda o render e o `PieceChannel` avisa. Ciclo da peça-documento: `generating
→ draft → approved → scheduled → published` (+ `failed`). A geração lê **só**
`published_document` (o tema por `PieceDocument::Theme`); a peça guarda de que versão
da marca saiu e fica `outdated` quando a marca é publicada de novo. `GET /layouts`
entrega os contratos ao editor (que valida localmente). Front: `/contents` (galeria,
filtro, desatualizadas) e `/contents/:pieceId` (editor em `components/piece-editor/`,
lâmina em `components/piece-render/`). **Motores (legado, só leitura):** a peça antiga
de `backend/engines/<id>/` (`engine_id` + `values`, ciclo `queued → rendering →
ready`) continua abrindo com as imagens que tem; `bin/rails pieces:to_documents`
converte as que têm layout equivalente (`PieceDocument::Legacy`, `DRY_RUN=1` só
relata). O formulário manual por manifesto saiu; `/advanced` redireciona para a
criação. libvips fora do sistema: `lib/vips_userspace.rb` relança o processo com
`LD_LIBRARY_PATH` quando `VIPS_USERSPACE_ROOT` está no `.env`.

**Criação por conversa (o caminho principal):** a pessoa descreve a peça numa
frase e recebe 2–3 variações prontas. Um `AgentTurn` é uma chamada ao modelo:
`POST /brands/:id/conversations` abre a conversa com o primeiro pedido,
`POST .../conversations/:id/turns` manda os seguintes (`kind`: `create` = pedido
livre com 3 variações, `adjust` = ajuste em linguagem natural sobre uma peça
(1 variação), `vary` = outras composições). O controlador só confere marca,
saldo e teto e enfileira; quem pensa é o `AgentTurnJob` e quem avisa é o
`AgentChannel` — as imagens continuam chegando pelo `PieceChannel`, porque
decidir e desenhar são dois tempos. O agente escolhe formato e layout de cada
lâmina e **escreve o conteúdo de cada slot** (mais legenda e hashtags). O contexto
do modelo vai em três blocos, na ordem que o cache premia: regras do produto
(`Agent::Prompts`), biblioteca de layouts (`Agent::Catalog`, gerada dos mesmos
contratos de `layouts/*.yml`, ponto de cache) e a ficha da marca publicada
(`Agent::BrandBrief`: identidade, voz, ofertas, `tokensDeCor`, `ativosDisponiveis`;
ponto de cache); só o pedido e a data de hoje viajam na mensagem — o que muda por
pedido **nunca** entra no sistema, senão quebra o cache da marca. A saída é JSON
que `Agent::Plan` transforma em `PieceDocument` (`PieceDocument::Build.from_agent`)
e confere no `Validator` estrito — o mesmo do editor; plano inválido ganha **uma**
tentativa de correção com o erro no contexto e depois falha limpo. A peça nasce em
`draft` com a primeira `PieceVersion` (`source: generation`); no `plan` do turno
fica a forma compacta (`PieceDocument::Compact`), que é o que volta ao modelo no
histórico e em `adjust`/`vary`. **Regra-mestra do
prompt: nunca inventar preço, data ou fato** — faltando um dado essencial o
agente devolve `question` e a tela pergunta, sem cobrar. Cada turno guarda
tokens, modelo e `cost_micro_usd`: é dessa soma que sai o teto mensal de OPEX
(`Agent::Budget`, `AGENT_MONTHLY_COST_CENTS_CAP`), que é controle da Vekoo —
o cliente vê créditos (`AI_COSTS[:agent]` / `[:agentAdjust]`). Modelo em
`AGENT_MODEL` (padrão `claude-opus-5`). A conversa é andaime e some em 30 dias
(`bin/rails agent:purge`); a peça é obra e fica (`pieces.agent_turn_id` vira
nulo). Front: `/brands/:id/create[/:conversationId]`
(`routes/create.tsx` + `components/create/`), com campo único, exemplos
rotativos no placeholder, anexo de foto (vira `BrandAsset` de tipo `photo`) e
ajuste em linguagem natural sobre a variação escolhida.

**Foto como ferramenta do agente (não há tela de "gerar imagem"):** o agente tem
a tool `generate_image` (`Agent::ImageTool`, só oferecida quando o Vertex está
configurado). Ele cria foto quando a peça pede uma que a marca não tem, ou entrega
**só fotos** quando foi isso que a pessoa pediu (`onlyImages: true`, o crédito do
pedido volta; cada foto cobra `AI_COSTS[:image]`). Cada chamada é um
`ImageGeneration` de `origin: "agent"` ligado ao turno, no máximo 2 chamadas / 4
fotos por pedido, e o resultado volta ao modelo com o id **e a foto em miniatura**
(ele compõe olhando o que saiu). A trilha vai ao vivo em `agent_turns.steps`. Laço em
`Agent::Run#converse`: o assistente volta **como veio** (pensamento + `tool_use`) e
o prompt de sistema é montado uma vez por turno — mudar a ficha da marca entre
voltas invalida a assinatura do pensamento (400). Foto gerada entra em
`ativosDisponiveis` com `descricao`, para ser reaproveitada. Gerador:
`Ai::GeminiImage` (Nano Banana 2, `gemini-3.1-flash-image`, Vertex AI por ADC,
`bin/rails images:smoke` testa). O "gerar" do seletor de imagem do editor
continua (`components/images/image-generator.tsx`).

**Banco de referências (interno — o assinante nunca vê):** cards de padrão
(`ReferenceCard`): posts reais analisados e guardados como texto estruturado — gancho,
estrutura, visual, **função** do copy (nunca a frase), por que funciona, replicabilidade
e métricas —, que o agente de criação vai consultar na geração. É acervo da plataforma,
como os layouts: sem organização e sem marca. Nenhuma rota, serializer ou canal fora de
`Admin::` toca o modelo, e a peça guarda em `pieces.reference_ids` os cards usados sem
que o `PieceSerializer` os mostre. A taxonomia tem **uma fonte só**:
`backend/config/reference_taxonomy.yml` (`Taxonomy`: nicho, porte, arquétipos, objetivo,
formato, tipo de gancho, replicabilidade 1–3, origem, status) → `bin/rails
taxonomy:export` gera `frontend/src/lib/taxonomy.ts` (spec falha se ficar velho); rótulos
de tela em `locales/<idioma>/taxonomy.json`, descrição para o modelo no próprio YAML. A
análise é um JSON Schema (`ReferenceCard::Analysis`, `json_schemer`), leve no rascunho e
estrito para publicar (é também o contrato da saída do modelo); engajamento relativo é
sempre a conta (curtidas + comentários) / mediana dos últimos 30 posts da conta, nulo sem
os três números. Curadoria: `draft → in_review → published`, `archived` = rejeitado ou
aposentado, sempre com motivo; `version` sobe a cada mudança de conteúdo depois da primeira
publicação. Embedding em `vector(768)` (pgvector + gem `neighbor`, cosseno, busca exata —
sem HNSW de propósito, o filtro duro vem antes). **Curadoria (`/admin`, só `users.staff`,
`bin/rails 'staff:grant[email]'`):** `Admin::BaseController` responde **404** a quem não é
staff (com ou sem sessão), como rota inexistente; front em `src/admin/` carregado por
`React.lazy` (o assinante não baixa o código nem os textos — `src/admin/locales/`, lidos
pela guarda de i18n). Cadastro: imagens (até 10) ou o link **direto** de uma imagem
(`References::FetchImage`: só https, IP público conferido, redirecionamento reconferido —
página de post do Instagram não serve, manda-se o print), mais nicho/porte/@/termos
proibidos/mediana. `AnalyzeReferenceJob` → `References::Analyze`: as imagens vão ao
Claude com o schema estrito como saída estruturada (`ReferenceCard::Analysis.model_schema`
tira o que a API não aceita; `fallbacks: :default` na recusa), devolvendo análise,
classificação e a transcrição do texto visível — que vira só resumos de janelas de 6
palavras (`copy_shingles`, `References::CopyGuard`) e é descartada. Depois: vetor
(`References::Embed`, `Ai::Embeddings` no Vertex, refeito a cada edição de conteúdo), o
original apagado (fica a miniatura, servida só pela rota da curadoria) e `in_review`.
`ReferenceCard#findings`: `leak` (`References::Leakage`: link, @, site, perfil, termos
proibidos), `copied` e `noEmbedding`; os dois primeiros barram a publicação. Credenciais do
Vertex em `Ai::Vertex` (divididas com o `Ai::GeminiImage`). Custo da análise no card, fora
do teto de OPEX das organizações.
**Importação do Instagram (`/admin/imports`):** a curadoria cola até 20 @ e
`ImportReferenceAccountJob` lê os ~50 posts recentes de cada conta pela **Business
Discovery** oficial (`InstagramGraph::Client`, único lugar que fala com o Meta, token no
cabeçalho; sem raspagem; só contas profissionais públicas). `References::InstagramRanking`
mede cada post contra a **mediana da própria conta** (curtidas + comentários), deixa fora
da lista e da mediana o post de menos de 7 dias e o de curtida oculta fica sem métrica;
≥ 1,5× é destaque, 5 por conta na tela. Os escolhidos viram card em rascunho
(`References::Imports.analyze!`: fonte, @ e nome da conta nos termos proibidos, métricas
e a mediana) e `FetchInstagramReferenceJob` busca **de novo** mídia e legenda (a URL do
Meta expira) — carrossel com mais de 10 lâminas vai com as 9 primeiras e a última; vídeo
vai pela capa, com `partial_analysis` (melhoria futura: vídeo pelo Gemini no Vertex). **A
legenda nunca é gravada**: só viaja na mensagem ao modelo, marcada como dado e não
instrução, e entra na conferência de cópia; nenhum job a recebe por argumento. Um post vira
no máximo um card (índice único em `source->>'igMediaId'`). Lotes e candidatos somem em 30
dias (a cada lote novo, ou `bin/rails references:purge_imports`). Erros do Meta viram
código (`tokenInvalid`, `rateLimited` — trava o app inteiro até a hora indicada —,
`accountUnavailable`, `permissionDenied`); `InstagramGraph::TokenStatus` (cache de 1 h)
avisa a 14 dias do vencimento do token ou do acesso aos dados. Setup e Passo 0
(`references:instagram_smoke`) em DEPLOY.md §2.

**Marca como contexto raiz (hard rule):** todo conteúdo nasce dentro de uma marca —
nunca é vinculado depois; não existe tela de associação manual. A organização tem
**várias** marcas (`BrandCore`, `GET/POST /brands`); carrossel, pasta e peça carregam
`brand_core_id` desde a criação (`POST /carousels` e `POST /folders` exigem `brandId`,
senão `brandRequired`), e o carrossel ainda grava `brand_core_version_id` (a versão
publicada da marca no nascimento) e nasce com o tema derivado da paleta
(`BrandCore#carousel_theme`). API sob a marca: `/brands/:id` (+`publish`, `versions`,
`assets`, `logos`, `image-generations`, `pieces`, `conversations`, `onboarding`); carrosséis e pastas mantêm rota própria e
filtram por `?brand_id=`. Front: tudo da criação vive sob `/a/<hashid>/brands/:brandId/...` (início,
`carousels`, `folders/:id`, `carousels/:id/edit`, `contents`, `contents/:pieceId`,
`create[/:conversationId]`, `settings`,
`onboarding`, `setup/:step`, `templates`, `trash`); `/brands` só
escolhe a marca ativa (última usada em `localStorage`, senão a primeira) e redireciona, e os caminhos
antigos (`/carousels`, `/folders/:id`, `/trash`, `/templates`) caem na marca ativa. A raiz `/` continua
sendo o Dashboard da plataforma;
o seletor de marca fica no topo (`components/brand-switcher.tsx`); `useActiveBrand()`
(`lib/brand-context.tsx`) dá `brandId` e `path("/contents")` para links. A primeira
marca nasce com a conta (`SignUp`) e cai direto no onboarding por conversa. O criador de carrossel é **acoplamento raso** por
decisão: continua editor por blocos com IA e exportação no navegador, só nasce na marca
e lê os tokens dela. Legado sem marca: `bin/rails brands:migrate_orphans` (resolve quem
tem uma marca só) ou a tela temporária `/migration/orphans` (`GET /orphans`,
`POST /orphans/assign`, desligável com `ORPHAN_MIGRATION=false`) — para remover depois.

**Linguagem (pt-BR, sem jargão):** carrossel, card, pasta, marca, créditos, conversa, contato, fluxo,
pipeline — nunca projeto, deck, slide, asset ou workspace. Botões com verbo, o mesmo verbo do começo ao
fim de cada ação. Dados fictícios com conteúdo brasileiro de verdade, nunca lorem ipsum.

**Direção visual:** claro e escuro, os dois quietos e quase sem cor (Sistema é o padrão; a
pessoa troca no menu dela e em Perfil); hierarquia por
tipografia (títulos `font-heading` = Bricolage Grotesque; texto = Geist) e espaçamento.
Um único acento saturado (violeta, `--primary`) reservado a ação principal, seleção e
foco. A única outra coisa saturada na tela é a obra do usuário: capas de carrossel
(`CarouselCover`) têm cor própria e **cantos retos** (Instagram não arredonda imagem) — o
resto da interface pode ser suave. Status usam os tons sóbrios de `StatusBadge`.
Cor só por token de `index.css`, que tem os dois temas (`:root` e `.dark`): componente
nenhum pergunta o tema, e a obra do usuário não muda com ele.

---

## Front-end / UX Charter (non-negotiable)

When asked to build or change any screen, treat the literal request as the **floor, not the ceiling**. Your job is to understand the user's underlying goal (the job-to-be-done) and design the complete, professional experience around it — proactively, by inference — while briefly stating the reasoning behind any non-obvious decision so a human can veto it. Be proactive on UX quality, restrained on scope: add what a senior product designer would consider table stakes for that screen, not speculative features. If a proactive addition needs a new endpoint or data dependency, flag it instead of silently building it.

### Design the full state matrix
Every data-driven view must handle: **loading** (skeletons that mirror the final layout, not bare spinners), **empty** (guidance + a clear CTA, never a blank void — use the `EmptyState` component), **error** (recoverable, with retry), **success**, and **partial/streaming** where relevant. Never ship a view that only renders the happy path.

### Infer the affordances the user didn't name
A professional product has these even when unrequested — add them by inference:
- Collections: search, **filter, and sort** (e.g., a dropdown of options gets a search/filter when the list is non-trivial), plus pagination or infinite scroll for long lists, and bulk/row actions where they make sense.
- Forms: inline validation, disabled/loading submit, no double-submit, sensible autofocus and keyboard flow.
- Feedback: a toast (sonner) or optimistic update (SWR) for every mutating action; never leave an action without visible feedback.

### Choose the representation that fits the data
Do **not** default to a raw HTML table — a naked `<table>` is often the unprofessional choice. Deliberately pick what communicates best: cards, stat tiles, grouped lists, timelines, or charts. When a table genuinely is right, build it as a proper **DataTable** (`@/components/shared`, on `@tanstack/react-table`): sticky header, sortable columns, column-level filtering, density/pagination, row actions, and its own loading/empty states. Never a bare table dump.

### Reusable component system
Build a composition layer on top of shadcn primitives — no scattered one-off UI. shadcn primitives live untouched in `@/components/ui`; the shared kit lives in `@/components/shared`, and domain components in `@/components/<domain>`. Single source of truth for tokens (spacing, radius, color, typography) via the Tailwind theme / shadcn CSS variables — **no magic hex values** in components. Keep spacing scale, elevation/shadow language, and motion timing consistent app-wide.

### Motion (purposeful, accessible)
Use **Motion** (`motion/react`) for orchestrated animation: enter/exit with `AnimatePresence`, layout and shared-element transitions with `layoutId`, `whileInView` reveals. Use Tailwind transitions for micro-interactions (hover/press/focus). Motion must serve feedback, spatial continuity, or hierarchy — never decoration for its own sake. Springs for interactive UI (bounce < 0.1); easing for decorative/sequential motion. Keep durations ~150–300ms; animate `transform`/`opacity` (avoid layout thrash) targeting 60fps+. **Always** honor `useReducedMotion` / `prefers-reduced-motion` with a reduced path.

### UX quality bar
Accessible by default (lean on Base UI/shadcn a11y): `focus-visible` states, full keyboard navigation, ARIA, adequate contrast, hit targets ≥ 40px. Clear visual hierarchy, generous whitespace, a consistent type scale. Responsive from the first pass (mobile → desktop), not retrofitted. Every action gives feedback; every destructive action confirms.
