// As cores que um card pode usar. O que fica guardado é a chave (`cat-2`, `tone-danger`), e o valor mora nos tokens
// (`components/custom-dashboards/viz-tokens.css`), validados com o script da skill. Hex só quando a pessoa escolheu.

export const CATEGORICAL_COLORS = ["cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6", "cat-7", "cat-8"] as const

/** Faixas de um número: o que a cor quer dizer, sempre com ícone ou texto ao lado. */
export const TONE_COLORS = ["tone-success", "tone-warning", "tone-danger", "tone-accent"] as const

const TOKENS: Record<string, string> = {
  accent: "var(--viz-accent)",
  ink: "var(--viz-ink)",
  context: "var(--viz-context)",
  "tone-success": "var(--status-success)",
  "tone-warning": "var(--status-warning)",
  "tone-danger": "var(--status-danger)",
  "tone-accent": "var(--viz-accent)",
}

for (const key of CATEGORICAL_COLORS) TOKENS[key] = `var(--viz-${key})`

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i

export function isToken(value: string | null | undefined): boolean {
  return Boolean(value && value in TOKENS)
}

/** O que vai no `fill` e no `backgroundColor`. Chave que este app não conhece cai no padrão. */
export function resolveColor(value: string | null | undefined, fallback = "var(--viz-accent)"): string {
  if (!value) return fallback
  if (value in TOKENS) return TOKENS[value]
  return HEX.test(value) ? value : fallback
}

/** A posição na paleta. A nona série nunca ganha cor nova: vira "Outros" antes de chegar aqui. */
export function categoricalColor(slot: number): string {
  return TOKENS[CATEGORICAL_COLORS[Math.min(slot, CATEGORICAL_COLORS.length - 1)]]
}

// A cor segue a coisa, nunca a posição dela no gráfico: num período sem Facebook, o Instagram continua da mesma cor.
// A memória é por card e dura a sessão; a primeira vez distribui em ordem alfabética, então recarregar dá a mesma cor
// para os mesmos dados.
const slotMemory = new Map<string, Map<string, number>>()

export function assignSlots(scope: string, entities: string[]): Map<string, number> {
  let slots = slotMemory.get(scope)
  if (!slots) {
    slots = new Map()
    slotMemory.set(scope, slots)
  }

  const taken = new Set<number>()
  for (const entity of entities) {
    const slot = slots.get(entity)
    if (slot !== undefined) taken.add(slot)
  }

  for (const entity of [...entities].sort()) {
    if (slots.has(entity)) continue

    let slot = 0
    while (taken.has(slot)) slot += 1
    taken.add(slot)
    slots.set(entity, slot)
  }

  return slots
}
