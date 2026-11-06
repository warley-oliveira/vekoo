// Formato da API de conteúdo (`docs/migration/api/inbox.md`): chaves em camelCase, datas em
// milissegundos e ids como string.

export type QuickReply = {
  id: string
  name: string
  /** Sem a barra, já em slug: `frete-gratis`. */
  trigger: string
  /** Texto com as citações de anexo (`attachment_id_<id>`) e as variáveis (`{{nome}}`). */
  content: string
  createdAt: number
  updatedAt: number
}

export type QuickReplyInput = Pick<QuickReply, "name" | "trigger" | "content">

export type AttachmentFile = {
  id: string
  filename: string
  contentType: string | null
  byteSize: number
  /** Relativa à API, ou absoluta: passe por `apiAssetUrl`. */
  url: string
}

export type Attachment = {
  id: string
  name: string
  description: string | null
  private: boolean
  createdAt: number
  updatedAt: number
  file: AttachmentFile | null
}

/** Os tipos que `GET /attachments?kind=` entende. */
export const ATTACHMENT_KINDS = ["image", "video", "audio", "document"] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

export const ATTACHMENT_SORT_FIELDS = ["created_at", "name", "updated_at"] as const
export type AttachmentSortField = (typeof ATTACHMENT_SORT_FIELDS)[number]

export const VALUE_TYPES = ["text", "number", "list", "checkbox", "date"] as const
export type CustomFieldValueType = (typeof VALUE_TYPES)[number]

export const NORMALIZATION_STRATEGIES = ["min", "avg", "max"] as const
export type NormalizationStrategy = (typeof NORMALIZATION_STRATEGIES)[number]

export type CustomField = {
  id: string
  name: string
  /** Nasce do nome e não muda ao renomear: é por ela que os valores estão gravados. */
  key: string
  description: string | null
  valueType: CustomFieldValueType
  defaultValue: string | null
  optionValues: string[]
  autoNormalize: boolean
  normalizationStrategy: NormalizationStrategy
  normalizationTargetKey: string | null
  createdAt: number
  updatedAt: number
}

export type CustomFieldInput = Partial<
  Pick<
    CustomField,
    | "name"
    | "description"
    | "valueType"
    | "defaultValue"
    | "optionValues"
    | "autoNormalize"
    | "normalizationStrategy"
    | "normalizationTargetKey"
  >
>

/** Um valor distinto do campo nas conversas. `value: null` são as que não têm o campo. */
export type DistinctFieldValue = {
  value: unknown
  count: number
  /** `false`: valor que não é texto simples, e a normalização não alcança. */
  editable: boolean
}

export type CustomFieldValues = {
  values: DistinctFieldValue[]
  /** Passou de 500 valores distintos: só os mais usados vieram. */
  truncated: boolean
}

export type NormalizeChange = { from: string; to: string; count: number }

export type NormalizeResult = {
  dryRun: boolean
  changes: NormalizeChange[]
  targetKey: string | null
}

export type NormalizePayload = {
  mapping: Record<string, string>
  /** Sem `dryRun: false`, a API só mostra a prévia. */
  dryRun: boolean
  convertToNumber?: boolean
  targetKey?: string
  startDate?: string
  endDate?: string
}
