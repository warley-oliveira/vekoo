import type { ProductField, ProductItem } from "./types"

// A API não tem um campo de preço: preço é um campo personalizado como outro qualquer,
// do tipo número. Mas é o que o lojista procura na grade, e um valor em reais pede a
// máscara de moeda. Por isso a tela reconhece o campo pela chave, que nasce do nome e
// nunca muda ("Preço" vira `preco`), e trata todo o resto como número comum.
const PRICE_KEY = /^(preco|price)(_|$)|^valor$/
const PROMO_KEY = /promo|desconto|oferta|sale/

export function isPriceField(field: Pick<ProductField, "key" | "valueType">): boolean {
  return field.valueType === "number" && PRICE_KEY.test(field.key)
}

export type PriceKeys = { main?: string; promo?: string }

export function findPriceKeys(fields: readonly ProductField[]): PriceKeys {
  const prices = fields.filter(isPriceField)
  return {
    main: prices.find((field) => !PROMO_KEY.test(field.key))?.key,
    promo: prices.find((field) => PROMO_KEY.test(field.key))?.key,
  }
}

function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** O que mostrar na grade: o preço que vale e, em promoção, o de antes. */
export function itemPrice(
  item: Pick<ProductItem, "customFields">,
  keys: PriceKeys
): { current: number; previous: number | null } | null {
  const main = keys.main ? numberOf(item.customFields[keys.main]) : null
  const promo = keys.promo ? numberOf(item.customFields[keys.promo]) : null

  if (promo !== null && (main === null || promo < main)) {
    return { current: promo, previous: main }
  }
  return main === null ? null : { current: main, previous: null }
}
