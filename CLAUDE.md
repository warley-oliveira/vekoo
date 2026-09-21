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

**Onboarding guiado (a porta de entrada de toda marca):** marca nova cai em
`/brands/:id/onboarding/:step` — dez telas, uma pergunta por vez, em linguagem
de dono de negócio: `intro` (o que esperar e por que detalhe importa), `name`,
`what` (frase + chip de ramo), `handle`, `logo`, `colors`, `fonts`, `voice`,
`offers`, `done`. **Não pergunta hierarquia de texto**: os estilos saem dos
defaults do schema e o ajuste fino fica no modo de edição. Cada resposta entra
numa seção do **mesmo** documento pelo `PATCH /brands/:id/onboarding` — não
existe brandcore do onboarding, existe outra porta; o wizard de oito seções
continua inteiro em `/setup/:step`, agora como modo de **edição**, alcançável
pelas configurações da marca. O estado (onde parou, o que respondeu, o que
pulou, o código do ramo) mora em `progress["onboarding"]`
(`BrandCore::Onboarding`, `#track_onboarding`); marca publicada conta como
concluída, o que dispensa migração das antigas. Em toda pergunta de cor, fonte
e voz existe **"não sei / cria pra mim"**: `POST /brands/:id/onboarding/suggest`
(`Onboarding::Suggest`) devolve **três** opções validadas — paleta já com os
papéis derivados e contraste conferido (`BrandCore::PaletteBuilder`, espelhado
em `buildPalette()` no front), par de fontes que existe no catálogo, voz com
tons válidos. **Nunca falha**: sem chave, sem rede ou com resposta torta entram
as propostas curadas de `Onboarding::Fallbacks`, e a tela não muda de forma.
Quem não tem logo ganha um **logotipo tipográfico** (`RenderWordmark`, libvips —
determinístico, nada de imagem por IA), desenhado no fechamento porque ele usa a
tipografia escolhida depois da pergunta da logo. Logo enviada tem transparência
conferida de verdade (`PngInspector`) e nunca é substituída
(`brand_assets.generated`); ela também alimenta a proposta de paleta
(`BrandCore::DominantColors`). `POST /onboarding/finish` publica a **versão 1**
e leva direto ao agente. O mínimo é nome + o que faz + cores + fontes — voz
pulada é preenchida no fechamento e **aparece no cartão antes de publicar**.
Telemetria de funil e custo em `onboarding_events`
(`bin/rails onboarding:funnel`). Front: `routes/onboarding.tsx` +
`components/onboarding/`.

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

**Motores e peças (a contraparte do Brandcore):** um motor é um diretório em
`backend/engines/<id>/` com `manifest.yml` (ficha declarativa: formatos, campos com
tipo e restrições) e
`render.rb` (`Engines::<Id> < Engines::Base`, função pura de composição sobre o
`Engines::Canvas`, libvips por camadas). `Engines::Registry` varre o diretório no
primeiro uso e valida cada manifesto — **motor novo = diretório novo**, nada mais muda
(guia em `backend/engines/README.md`). Campos são `text`, `textList`, `number`,
`choice` (opções fixas ou derivadas da paleta) e `image` — **não existe referência a
dado da marca: o texto da peça se digita no formulário dela**. A geração lê **só**
`published_document` via `Engines::Tokens`; a `Piece` guarda `provenance` (de que
versão da marca saiu) e fica `outdated` quando a marca é publicada de novo. Fluxo: `POST /pieces`
valida (`Engines::Values`) e enfileira `RenderPieceJob` (Sidekiq, adapter do ActiveJob
em `config/initializers/sidekiq.rb`; `:test` nas specs); `PieceChannel` avisa quando
fica pronta; `POST /engines/:id/preview` devolve o PNG do primeiro quadro. libvips
fora do sistema: `lib/vips_userspace.rb` relança o processo com `LD_LIBRARY_PATH`
quando `VIPS_USERSPACE_ROOT` está no `.env`. **Quem escolhe o motor e preenche o
manifesto é o agente, não o usuário** (ver abaixo): o catálogo e o formulário
manual continuam existindo em `/brands/:id/advanced[/:engineId]` (formulário
**gerado do manifesto** em `components/pieces/field-inputs.tsx`, prévia ao vivo),
como modo avançado atrás de link discreto. Front: `/contents` (galeria, filtro,
desatualizadas = saíram de uma versão anterior da marca) e `/contents/:id`
(imagens, proveniência, regenerar). Spec por motor em
`spec/engines/engines_spec.rb`, valores de exemplo em
`spec/support/engine_examples.rb`.

**Criação por conversa (o caminho principal):** a pessoa descreve a peça numa
frase e recebe 2–3 variações prontas. Um `AgentTurn` é uma chamada ao modelo:
`POST /brands/:id/conversations` abre a conversa com o primeiro pedido,
`POST .../conversations/:id/turns` manda os seguintes (`kind`: `create` = pedido
livre com 3 variações, `adjust` = ajuste em linguagem natural sobre uma peça
(1 variação), `vary` = outras composições). O controlador só confere marca,
saldo e teto e enfileira; quem pensa é o `AgentTurnJob` e quem avisa é o
`AgentChannel` — as imagens continuam chegando pelo `PieceChannel`, porque
decidir e desenhar são dois tempos. O contexto do modelo vai em três blocos, na
ordem que o cache premia: regras do produto (`Agent::Prompts`), catálogo de
manifestos (`Agent::Catalog`, ponto de cache) e a ficha da marca publicada
(`Agent::BrandBrief`, ponto de cache); só o pedido e a data de hoje viajam na
mensagem. A saída é JSON validado por `Agent::Plan` contra os mesmos
`Engines::Values` do formulário manual — plano inválido ganha **uma** tentativa
de correção com o erro no contexto e depois falha limpo. **Regra-mestra do
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

**Marca como contexto raiz (hard rule):** todo conteúdo nasce dentro de uma marca —
nunca é vinculado depois; não existe tela de associação manual. A organização tem
**várias** marcas (`BrandCore`, `GET/POST /brands`); carrossel, pasta e peça carregam
`brand_core_id` desde a criação (`POST /carousels` e `POST /folders` exigem `brandId`,
senão `brandRequired`), e o carrossel ainda grava `brand_core_version_id` (a versão
publicada da marca no nascimento) e nasce com o tema derivado da paleta
(`BrandCore#carousel_theme`). API sob a marca: `/brands/:id` (+`publish`, `versions`,
`assets`, `pieces`, `engines/:id/preview`); carrosséis e pastas mantêm rota própria e
filtram por `?brand_id=`. Front: tudo vive sob `/brands/:brandId/...` (início,
`carousels`, `folders/:id`, `carousels/:id/edit`, `contents`, `contents/:pieceId`,
`create[/:conversationId]`, `advanced[/:engineId]`, `settings`,
`onboarding/:step`, `setup/:step`, `templates`, `trash`); a raiz `/` só
escolhe a marca ativa (última usada em `localStorage`, senão a primeira) e redireciona;
o seletor de marca fica no topo (`components/brand-switcher.tsx`); `useActiveBrand()`
(`lib/brand-context.tsx`) dá `brandId` e `path("/contents")` para links. A primeira
marca nasce com a conta (`SignUp`) e cai direto no onboarding guiado. O criador de carrossel é **acoplamento raso** por
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
