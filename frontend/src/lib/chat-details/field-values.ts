// Valores de campo personalizado: sempre texto no servidor, até número e sim ou não.

/** Uma data guardada como texto, sem cair no dia anterior por causa do fuso. */
export function parseStoredDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function isFilled(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

/** "tamanho_preferido" vira "Tamanho preferido", para o que um fluxo gravou sem campo cadastrado. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
