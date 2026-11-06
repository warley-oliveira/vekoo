/**
 * Busca como uma pessoa espera em português: "joao" acha "João" e "ACAO" acha "ação".
 * Sem isto, quem não digita acento não encontra nada.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

export function matchesSearch(text: string, query: string): boolean {
  return normalizeSearchText(text).includes(normalizeSearchText(query))
}
