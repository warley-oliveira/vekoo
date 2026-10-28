# vekoo-app

Full-stack monorepo. Rails 8.1 API backend + React 19 / Vite / TypeScript frontend.
Environment: **WSL2 Ubuntu** — use Linux commands only.

## Stack

- **Backend:** Ruby on Rails 8.1 (API-only), Ruby 3.4, PostgreSQL 16, Sidekiq (ActiveJob), RSpec.
- **Frontend:** React 19, Vite, TypeScript (strict), Tailwind v4, shadcn/ui (new-york), SWR, Motion, sonner, react-hook-form + zod, TanStack Table.
- **Infra (dev):** Postgres + Redis via Docker Compose. The Rails app and Vite run natively on WSL2.

## Layout

```
vekoo_app/
├── backend/            # Rails 8.1 API-only (RSpec, Sidekiq)
├── frontend/           # Vite + React + TS (shadcn, SWR)
├── docker-compose.yml  # postgres + redis only
├── Procfile.dev        # web + worker + front
├── bin/setup           # one-time bootstrap
├── bin/dev             # start infra + all processes
└── .env                # single source of truth (NOT committed)
```

## Ports (this project — offset 10)

| Service   | URL / host                  |
|-----------|-----------------------------|
| Postgres  | localhost:5442  |
| Redis     | localhost:6389     |
| Rails API | http://localhost:3010 |
| Vite      | http://localhost:5183  |

All derived from `PORT_OFFSET` in `.env`. Docker Compose is namespaced via
`COMPOSE_PROJECT_NAME`, so this project runs alongside others without collision.

## Setup & run

- **First time:** `bin/setup`
- **Every day:** `bin/dev` (brings up Postgres + Redis, then runs Rails, Sidekiq, and Vite)
- **Backend tests:** `cd backend && bundle exec rspec`

**WSL2 rule (hard):** this repo must live on the Linux filesystem (`~/projects/...`),
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

- **Backend:** keep controllers thin; put business logic in service objects; serialize JSON
  explicitly. Background work goes through ActiveJob (Sidekiq is the adapter). RSpec only —
  there is no Minitest.
- **i18n (hard rule):** **no user-visible string literal in JSX, ever.** Frontend uses
  **i18next + react-i18next** (`src/lib/i18n.ts`, one namespace, static bundles in
  `src/locales/<lang>.json`). Languages: `pt-BR` (source, fallback) and `en`; add a key to
  **both** files in the same commit. `useTranslation()` for copy, `<Trans>` when the string
  contains markup, `{ count }` for plurals (`key_one` / `key_other`) — never string
  concatenation. Dates/numbers come from `Intl` with `useLanguage()` (see `lib/format.ts`),
  never hand-written per locale. Non-UI modules (`lib/auth.tsx`, `lib/store.tsx`) stay
  language-free: they carry **codes** (`AuthErrorCode`, `plan`, `NotificationKey`) and the
  screen translates them. Backend: `Localizable` resolves the locale per request from
  `?locale=` or `Accept-Language`; strings live in `config/locales/{pt-BR,en}.yml`.
  Fictitious carousel content in `mock-data.ts` is the *user's work*, not UI — it stays
  pt-BR on purpose.
- **Frontend:** data fetching goes through the `useApi` hook (SWR) over the typed client in
  `@/lib/api`. shadcn primitives live untouched in `@/components/ui`; composed domain
  components live in `@/components`. Add primitives with
  `npx shadcn@latest add <component>`.
- **Routes (hard rule):** every URL path in the platform is in **English**, kebab-case —
  frontend routes and Rails API paths alike (`/login`, `/signup`, `/forgot-password`,
  `/folders/:id`, `/templates`, `/brands`, `/trash`). Query params too (`?next=`). Only the
  **visible copy** is pt-BR; the URL never is. Same for file and component names.
- **Git:** single `main` branch. No feature-branch flow. Small, descriptive commits.

## Testing scope

RSpec runs in the backend only. The frontend has **no** test framework by design — do not
add one.

## Domínio — Vekoo (essencial)

Plataforma onde a pessoa descreve um assunto em uma frase e recebe um carrossel de
Instagram pronto para editar e exportar. Público amplo (social media, lojista,
nutricionista, professor…) — a interface não assume repertório de designer nem pode
parecer ferramenta corporativa.

**Etapa atual (1 — entrada e organização):** tudo com dados fictícios, front-only.
Sem geração de conteúdo, editor, exportação, planos/pagamento, colaboração ou
autenticação real — deixar portas abertas, não construir. O estado fictício vive em
`frontend/src/lib/mock-data.ts` + `store.tsx` (localStorage, chave versionada
`vekoo.etapa1.v1`). O backend Rails existe mas ainda não é consumido.

**Autenticação (fictícia, front-only):** `frontend/src/lib/auth.tsx` (chave
`vekoo.auth.v1`) guarda contas, organizações e sessão em localStorage. Telas em
`/login`, `/signup` e `/forgot-password`; guardas em
`components/auth-guard.tsx`. **Criar conta cria a organização** e a pessoa entra
como `owner` — é essa organização que vai receber convites depois. Conta de
demonstração: `marina.duarte@exemplo.com.br` / `carrossel123`. Quando o Rails
entrar, trocar só este módulo (hash e sessão no servidor) sem mexer nas telas.

**API do backend (já existe):** o domínio inteiro está no Rails —
`Organization`, `Account`, `Session`, `PasswordReset`, `Folder`, `Carousel`
(documento em jsonb: `theme` + `cards`, o mesmo formato de `lib/doc.ts`),
`Notification` e o acervo da ferramenta (`ThemePreset`, `LibraryImage`,
`PaletteColor`). Endpoints: `POST /signup`, `POST /login`, `DELETE /logout`,
`GET /me`, `POST /password-resets` + `PATCH /password-resets/:token`,
`/folders`, `/carousels` (+ `duplicate`, `restore`, `permanent`),
`DELETE /trash`, `/notifications` + `POST /notifications/read-all`, `/credits` +
`POST /credits/consume` e `GET /catalog`. Sessão por `Authorization: Bearer`
(o banco guarda só o resumo SHA-256 do token). O JSON sai em **camelCase** e as
datas em **milissegundos** — a mesma forma dos tipos do front, para a troca do
mock pela API não mexer nas telas. Erro sempre como
`{ error: { code, field?, message, details? } }`: `code` é o contrato de
máquina (os mesmos de `AuthErrorCode`), `message` já vem no idioma da
requisição. **A semente (`backend/db/seeds.rb`) reproduz `mock-data.ts` card a
card** (14 carrosséis, 84 cards, mesma conta de demonstração) e é idempotente:
`bin/rails db:seed`. O front ainda lê o localStorage — rewirar `lib/store.tsx`
e `lib/auth.tsx` para `useApi` é o passo que falta.

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
ele só anota e o **logotipo tipográfico** (`RenderWordmark`, libvips) é desenhado ao
chegar no resumo, com a fonte escolhida. Logo enviada passa por `PngInspector` e
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
`published_document` via `BrandCore#generation_contract`. A etapa **"produtos & ofertas"**
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

**Marca como contexto raiz (hard rule):** todo conteúdo nasce dentro de uma marca —
nunca é vinculado depois; não existe tela de associação manual. A organização tem
**várias** marcas (`BrandCore`, `GET/POST /brands`); carrossel, pasta e peça carregam
`brand_core_id` desde a criação (`POST /carousels` e `POST /folders` exigem `brandId`,
senão `brandRequired`), e o carrossel ainda grava `brand_core_version_id` (a versão
publicada da marca no nascimento) e nasce com o tema derivado da paleta
(`BrandCore#carousel_theme`). API sob a marca: `/brands/:id` (+`publish`, `versions`,
`assets`, `logos`, `image-generations`, `pieces`, `conversations`, `onboarding`); carrosséis e pastas mantêm rota própria e
filtram por `?brand_id=`. Front: tudo vive sob `/brands/:brandId/...` (início,
`carousels`, `folders/:id`, `carousels/:id/edit`, `contents`, `contents/:pieceId`,
`create[/:conversationId]`, `settings`,
`onboarding`, `setup/:step`, `templates`, `trash`); a raiz `/` só
escolhe a marca ativa (última usada em `localStorage`, senão a primeira) e redireciona;
o seletor de marca fica no topo (`components/brand-switcher.tsx`); `useActiveBrand()`
(`lib/brand-context.tsx`) dá `brandId` e `path("/contents")` para links. A primeira
marca nasce com a conta (`SignUp`) e cai direto no onboarding por conversa. O criador de carrossel é **acoplamento raso** por
decisão: continua editor por blocos com IA e exportação no navegador, só nasce na marca
e lê os tokens dela. Legado sem marca: `bin/rails brands:migrate_orphans` (resolve quem
tem uma marca só) ou a tela temporária `/migration/orphans` (`GET /orphans`,
`POST /orphans/assign`, desligável com `ORPHAN_MIGRATION=false`) — para remover depois.

**Linguagem (pt-BR, sem jargão):** carrossel, card, pasta, marca, créditos — nunca
projeto, deck, slide, asset ou workspace. Botões com verbo, o mesmo verbo do começo ao
fim de cada ação. Dados fictícios com conteúdo brasileiro de verdade, nunca lorem ipsum.

**Direção visual:** tema claro, interface quieta e quase sem cor; hierarquia por
tipografia (títulos `font-heading` = Bricolage Grotesque; texto = Geist) e espaçamento.
Um único acento saturado (violeta, `--primary`) reservado a ação principal, seleção e
foco. A única outra coisa saturada na tela é a obra do usuário: capas de carrossel
(`CarouselCover`, especs em `mock-data.ts`) têm cor própria e **cantos retos**
(Instagram não arredonda imagem) — o resto da interface pode ser suave.

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
Do **not** default to a raw HTML table — a naked `<table>` is often the unprofessional choice. Deliberately pick what communicates best: cards, stat tiles, grouped lists, timelines, or charts. When a table genuinely is right, build it as a proper **DataTable** (via `@tanstack/react-table`): sticky header, sortable columns, column-level filtering, density/pagination, row actions, and its own loading/empty states. Never a bare table dump.

### Reusable component system
Build a composition layer on top of shadcn primitives — no scattered one-off UI. shadcn primitives live untouched in `@/components/ui`; composed domain components live in `@/components`. Single source of truth for tokens (spacing, radius, color, typography) via the Tailwind theme / shadcn CSS variables — **no magic hex values** in components. Keep spacing scale, elevation/shadow language, and motion timing consistent app-wide.

### Motion (purposeful, accessible)
Use **Motion** (`motion/react`) for orchestrated animation: enter/exit with `AnimatePresence`, layout and shared-element transitions with `layoutId`, `whileInView` reveals. Use Tailwind transitions for micro-interactions (hover/press/focus). Motion must serve feedback, spatial continuity, or hierarchy — never decoration for its own sake. Springs for interactive UI (bounce < 0.1); easing for decorative/sequential motion. Keep durations ~150–300ms; animate `transform`/`opacity` (avoid layout thrash) targeting 60fps+. **Always** honor `useReducedMotion` / `prefers-reduced-motion` with a reduced path.

### UX quality bar
Accessible by default (lean on Radix/shadcn a11y): `focus-visible` states, full keyboard navigation, ARIA, adequate contrast, hit targets ≥ 40px. Clear visual hierarchy, generous whitespace, a consistent type scale. Responsive from the first pass (mobile → desktop), not retrofitted. Every action gives feedback; every destructive action confirms.
