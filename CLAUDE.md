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

## Ports (this project — offset 40)

| Service   | URL / host                  |
|-----------|-----------------------------|
| Postgres  | localhost:5472  |
| Redis     | localhost:6419     |
| Rails API | http://localhost:3040 |
| Vite      | http://localhost:5213  |

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
- **Frontend:** data fetching goes through the `useApi` hook (SWR) over the typed client in
  `@/lib/api`. shadcn primitives live untouched in `@/components/ui`; composed domain
  components live in `@/components`. Add primitives with
  `npx shadcn@latest add <component>`.
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
