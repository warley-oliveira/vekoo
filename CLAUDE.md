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

## Ports (this project — offset 40)

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
- **Demo account:** `marina.duarte@exemplo.com.br` / `carrossel123`

**WSL2 rule (hard):** this repo must live on the Linux filesystem (`~/workspace/...`),
**never** under `/mnt/c`. Windows-mounted paths destroy Vite HMR and Rails boot performance.

The root `.env` is the single source of truth. The backend reads it via the symlink
`backend/.env -> ../.env`; the frontend reads it via `envDir: '..'` in `vite.config.ts`.

## Conventions

**Before working on a domain, read `docs/migration/CONVENTIONS.md`** (the full rules) and its
contract in `docs/migration/api/<domain>.md`. `docs/migration/DECISIONS.md` records what was decided and
what is still open. The rules that apply everywhere:

- **Backend:** thin controllers on `PlatformController` (the organization comes from the session, never
  the URL); business logic in service objects; JSON through `ApplicationSerializer` (camelCase, dates in
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
  `useChannel`, permissions through `useCan`. **Read `src/components/shared/README.md` before building a
  screen:** `@/components/shared` is the kit, with a live showcase at `/dev/kit`. `ResponsiveDialog` and
  `SidePanel`, not `Dialog` or `Sheet` directly. One title per screen, in the top bar, declared by
  `RouteFrame`. shadcn primitives live untouched in `@/components/ui`; domain components in
  `@/components/<domain>`. Add primitives with `npx shadcn@latest add <component>`. It is a PWA: every
  screen must work at 390 px.
- **Routes (hard rule):** every URL path in the platform is in **English**, kebab-case —
  frontend routes and Rails API paths alike (`/login`, `/quick-replies`, `/folders/:id`, `/settings/users`).
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
  editar e exportar. Fica em `/carousels` (com `/folders/:id`, `/templates`, `/brands`, `/trash`).

`/` abre o Dashboard, ou a primeira tela que a pessoa pode ver. O menu está em
`frontend/src/lib/navigation.ts`. A IA fica em `app/services/ai/` (Anthropic, com geração por SSE) e cobra
créditos.

**Mapa de conceitos** (completo em `CONVENTIONS.md`). O código veio de outro produto, com nomes trocados, e a
tela nem sempre usa o nome do código:

| Código | Na tela | Contrato |
|---|---|---|
| `Organization` (o workspace, vem da sessão), `Account`, `AccessRole`, `Team` | Organização, Usuário, Grupo, Departamento | `access` |
| `Connector::*` (`WhatsappCloud`, `WhatsappWeb`, `Zapi`, `WebWidget`…), `WhatsappTemplate` | Integrações | `connectors` |
| `Chat`, `ChatMessage::*`, `ChatTag`, `QuickReply`, `Attachment`, `CustomField`, `Copilot` | Chat, Contatos, Etiquetas, Mensagens Rápidas | `inbox` |
| `Flow`, `Tool`, `ToolFunction::*`, `Hook` | Fluxos, Ferramentas, Webhooks | `automation` |
| `Pipelines::*` (`Board`, `Stage`, `Card`) | Pipelines (o kanban) | `pipelines` |
| `Funnel` | Funis (a posição fica em `Chat#funnel_stages`) | `insights` |
| `Agenda::*` (`Booking`, `Professional`, `Offering`) | Calendário | `agenda` |
| `Products::*` | Catálogo. Atenção: `GET /catalog` é outra coisa, o acervo da ferramenta de carrossel | `products` |
| `Outreach::*` | Campanhas | `outreach` |
| `lib/mini_racer_engine` | Script de cliente em V8 isolado | `script-engine` |

**Autenticação:** sessão por `Authorization: Bearer` (o banco guarda só o resumo SHA-256 do token). **Criar
conta cria a organização** e a pessoa entra como `owner`. Permissão por `AccessRole` e `Account#can?`.

**Semente:** `db/seeds.rb` tem o acervo e a conta de demonstração, e cada domínio tem a sua em
`db/seeds/<domain>.rb`, tudo idempotente. Em produção só a primeira roda: dado do produto que precisa existir
em todo ambiente vai em `platform:sync`, que o deploy roda sozinho.

**Linguagem (pt-BR, sem jargão):** carrossel, card, pasta, marca, créditos, conversa, contato, fluxo,
pipeline — nunca projeto, deck, slide, asset ou workspace. Botões com verbo, o mesmo verbo do começo ao
fim de cada ação. Dados fictícios com conteúdo brasileiro de verdade, nunca lorem ipsum.

**Direção visual:** tema claro, interface quieta e quase sem cor; hierarquia por
tipografia (títulos `font-heading` = Bricolage Grotesque; texto = Geist) e espaçamento.
Um único acento saturado (violeta, `--primary`) reservado a ação principal, seleção e
foco. A única outra coisa saturada na tela é a obra do usuário: capas de carrossel
(`CarouselCover`) têm cor própria e **cantos retos** (Instagram não arredonda imagem) — o
resto da interface pode ser suave. Status usam os tons sóbrios de `StatusBadge`.

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
