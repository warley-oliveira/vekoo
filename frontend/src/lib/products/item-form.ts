import { z } from "zod"

import { toDateInputValue } from "@/lib/date-format"
import { isWebUrl, normalizeWebUrl } from "./url"
import type { FieldValueType, ProductField, ProductItemDetail } from "./types"

export const ITEM_TITLE_MAX = 300
export const ITEM_SUMMARY_MAX = 1500
export const ITEM_TAGS_MAX = 50

/** O prefixo da chave que a importação dá à linha sem SKU: `Products::Item::AUTO_KEY_PREFIX`. */
const AUTO_KEY_PREFIX = "auto:"

export function isAutoKey(externalId: string | null | undefined): boolean {
  return Boolean(externalId?.startsWith(AUTO_KEY_PREFIX))
}

/** O código para mostrar. A chave automática não é um SKU: para a pessoa, é "sem código". */
export function displaySku(externalId: string | null | undefined): string | null {
  return externalId && !isAutoKey(externalId) ? externalId : null
}

/** Texto, lista e link: `string`. Número: `number | null`. Sim ou não: `boolean | null`. Data: `Date | null`. */
export type CustomFieldValue = string | number | boolean | Date | null

export type ItemFormValues = {
  title: string
  summary: string
  description: string
  externalId: string
  url: string
  active: boolean
  tags: string[]
  categoryIds: string[]
  customFields: Record<string, CustomFieldValue>
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
  if (typeof raw !== "string" || raw.trim() === "") return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** `AAAA-MM-DD` no fuso local: `new Date("2026-12-31")` seria UTC e cairia no dia anterior. */
function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string") return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw
  if (raw === "true") return true
  if (raw === "false") return false
  return null
}

/**
 * Do valor guardado ao valor do controle. `customFields` volta com tipo da API, mas um
 * campo que mudou de tipo pode ter deixado valor de outro, e `defaultValue` é sempre texto.
 */
export function toFieldValue(valueType: FieldValueType, raw: unknown): CustomFieldValue {
  switch (valueType) {
    case "number":
      return parseNumber(raw)
    case "checkbox":
      return parseBoolean(raw)
    case "date":
      return parseDate(raw)
    default:
      return raw === null || raw === undefined ? "" : String(raw)
  }
}

/**
 * `null` no que está vazio, e assim a chave nem vai para a API. Sim ou não nunca tocado
 * também fica de fora: "não informado" é diferente de "não".
 */
function serializeFieldValue(valueType: FieldValueType, value: CustomFieldValue | undefined) {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) return toDateInputValue(value)
  if (valueType === "url" && typeof value === "string") return normalizeWebUrl(value)
  if (typeof value === "string") return value.trim() || null
  return value
}

/** O valor padrão de um campo, como a API o guarda: sempre texto. */
export function serializeDefaultValue(
  valueType: FieldValueType,
  value: CustomFieldValue | undefined
): string | null {
  const serialized = serializeFieldValue(valueType, value)
  return serialized === null ? null : String(serialized)
}

export function emptyItemValues(fields: readonly ProductField[]): ItemFormValues {
  return {
    title: "",
    summary: "",
    description: "",
    externalId: "",
    url: "",
    active: true,
    tags: [],
    categoryIds: [],
    // `defaultValue` é regra da tela: a API guarda e não aplica.
    customFields: Object.fromEntries(
      fields.map((field) => [field.key, toFieldValue(field.valueType, field.defaultValue)])
    ),
  }
}

export function itemToFormValues(
  item: ProductItemDetail,
  fields: readonly ProductField[]
): ItemFormValues {
  return {
    title: item.title,
    summary: item.summary ?? "",
    description: item.description ?? "",
    // Devolver vazio é seguro: a chave automática sobrevive no servidor.
    externalId: displaySku(item.externalId) ?? "",
    url: item.url ?? "",
    active: item.active,
    tags: item.tags,
    categoryIds: item.categories.map((category) => category.id),
    customFields: Object.fromEntries(
      fields.map((field) => [field.key, toFieldValue(field.valueType, item.customFields[field.key])])
    ),
  }
}

export function itemFormToPayload(
  values: ItemFormValues,
  fields: readonly ProductField[],
  item?: ProductItemDetail | null
) {
  const known = new Set(fields.map((field) => field.key))

  // `customFields` substitui o mapa inteiro. O valor de um campo excluído continua
  // guardado no item, como a confirmação de excluir promete; sem isto, ele sumiria no
  // próximo salvar sem a pessoa ter pedido.
  const customFields: Record<string, unknown> = Object.fromEntries(
    Object.entries(item?.customFields ?? {}).filter(([key]) => !known.has(key))
  )
  fields.forEach((field) => {
    const value = serializeFieldValue(field.valueType, values.customFields[field.key])
    if (value !== null) customFields[field.key] = value
  })

  return {
    title: values.title.trim(),
    summary: values.summary.trim() || null,
    description: values.description.trim() ? values.description : null,
    externalId: values.externalId.trim(),
    url: normalizeWebUrl(values.url) || null,
    active: values.active,
    tags: values.tags,
    categoryIds: values.categoryIds,
    customFields,
  }
}

type Translate = (key: string, options?: Record<string, unknown>) => string

function isBlank(value: CustomFieldValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && !value.trim())
}

/**
 * O servidor confere formato, tamanho e tipo. `required` só a tela confere, como o
 * contrato manda; sim ou não fica de fora, porque desligado já é uma resposta.
 */
export function buildItemSchema(t: Translate, fields: readonly ProductField[]) {
  return z
    .object({
      title: z
        .string()
        .trim()
        .min(1, t("products.item.errors.titleRequired"))
        .max(ITEM_TITLE_MAX, t("products.item.errors.titleTooLong", { max: ITEM_TITLE_MAX })),
      summary: z
        .string()
        .max(ITEM_SUMMARY_MAX, t("products.item.errors.summaryTooLong", { max: ITEM_SUMMARY_MAX })),
      description: z.string(),
      externalId: z.string(),
      url: z
        .string()
        .refine(
          (value) => !value.trim() || isWebUrl(normalizeWebUrl(value)),
          t("products.item.errors.urlInvalid")
        ),
      active: z.boolean(),
      tags: z
        .array(z.string())
        .max(ITEM_TAGS_MAX, t("products.item.errors.tooManyTags", { max: ITEM_TAGS_MAX })),
      categoryIds: z.array(z.string()),
      customFields: z.custom<Record<string, CustomFieldValue>>(),
    })
    .superRefine((values, context) => {
      fields.forEach((field) => {
        const value = values.customFields?.[field.key]
        const path = ["customFields", field.key]

        if (field.required && field.valueType !== "checkbox" && isBlank(value)) {
          context.addIssue({
            code: "custom",
            path,
            message: t("products.item.errors.fieldRequired", { name: field.name }),
          })
        } else if (
          field.valueType === "url" &&
          typeof value === "string" &&
          value.trim() &&
          !isWebUrl(normalizeWebUrl(value))
        ) {
          context.addIssue({ code: "custom", path, message: t("products.item.errors.urlInvalid") })
        }
      })
    })
}
