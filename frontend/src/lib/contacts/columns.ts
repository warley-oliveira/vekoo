// As colunas da lista. As que ordenam têm o nome que a API espera em `sortBy`: uma tradução a
// menos entre a tabela e o servidor.

export const BASE_COLUMNS = [
  "connector",
  "status",
  "tags",
  "assignee",
  "team",
  "last_message_at",
  "session",
  "automation",
  "unread_messages",
  "created_at",
  "notes",
] as const

export type BaseColumn = (typeof BASE_COLUMNS)[number]

/** O nome e o telefone: sem eles a linha não diz de quem é, então não dá para esconder. */
export const IDENTITY_COLUMN = "user_name"

export const DEFAULT_COLUMNS: string[] = [
  "connector",
  "status",
  "tags",
  "assignee",
  "last_message_at",
]

export const COLUMNS_STORAGE_KEY = "vekoo.contacts.columns.v1"

const CUSTOM_PREFIX = "cf:"

export function customColumnId(key: string): string {
  return `${CUSTOM_PREFIX}${key}`
}

export function customColumnKey(id: string): string | null {
  return id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : null
}
