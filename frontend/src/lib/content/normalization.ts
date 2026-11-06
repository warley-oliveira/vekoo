// Sugestão de normalização de valores de campos personalizados para um texto numérico
// canônico ("R$ 50.000,00/mês" vira "50000"). A mesma regra do back
// (`CustomAttributes::ValueNormalizer`), para a sugestão bater com o que a escrita automática
// faria. Faixas ("20 a 40/dia") usam a estratégia escolhida.

import type { DistinctFieldValue, NormalizationStrategy } from "./types"

// Milhar pt-BR ("50.000,00"), decimais com vírgula ou ponto. Sem sinal negativo: os valores são
// sempre positivos e o "-" separa faixa ("1-2" é [1, 2], nunca [1, -2]).
const NUMBER_PATTERN = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g

function parseLocaleNumber(raw: string): number | null {
  const normalized =
    /\d\.\d{3}(?:\D|$)/.test(raw) || (raw.includes(".") && raw.includes(","))
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** Um número canônico a partir de um valor livre, ou `null` se não houver número nele. */
export function suggestNormalizedValue(
  raw: string,
  strategy: NormalizationStrategy = "min"
): string | null {
  const numbers = (raw.match(NUMBER_PATTERN) ?? [])
    .map(parseLocaleNumber)
    .filter((value): value is number => value !== null)
  if (numbers.length === 0) return null
  if (numbers.length === 1) return String(numbers[0])

  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  if (strategy === "max") return String(max)
  if (strategy === "avg") return String((min + max) / 2)
  return String(min)
}

/** De-para sugerido: só os textos que mudariam. */
export function buildSuggestedMapping(
  values: readonly DistinctFieldValue[],
  strategy: NormalizationStrategy
): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const entry of values) {
    if (!isEditableText(entry)) continue
    const suggestion = suggestNormalizedValue(entry.value, strategy)
    if (suggestion !== null && suggestion !== entry.value) mapping[entry.value] = suggestion
  }
  return mapping
}

/** Só texto de verdade entra no de-para: vazio e valor de sistema ficam de fora. */
export function isEditableText(
  entry: DistinctFieldValue
): entry is DistinctFieldValue & { value: string } {
  return entry.editable && typeof entry.value === "string" && entry.value.trim() !== ""
}

/** Os pares que mudam algo: em branco, ou igual ao atual, é manter. */
export function effectiveMapping(mapping: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [from, to] of Object.entries(mapping)) {
    const target = to.trim()
    if (target && target !== from) result[from] = target
  }
  return result
}

export function isNumericValue(value: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(value.trim())
}

/**
 * A chave que o nome daria, com a regra do back (`name.parameterize.underscore`): "Como
 * conheceu" vira "como_conheceu". Vazia quando o nome não tem letra nem número.
 */
export function deriveCustomFieldKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
