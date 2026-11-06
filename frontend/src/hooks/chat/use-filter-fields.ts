import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"

import type { SelectOption } from "@/components/shared"
import { needsNoValue } from "@/lib/chat/filters"
import type { CustomFieldType, FilterCondition } from "@/lib/chat/types"
import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import {
  useChatConnectors,
  useChatPeople,
  useChatTags,
  useChatTeams,
  useCustomFields,
} from "./use-chat-refs"

export type FilterInput = "select" | "text" | "number" | "date"

export type FilterField = {
  key: string
  label: string
  group: "conversation" | "contact"
  input: FilterInput
  options?: SelectOption[]
  operators: string[]
  /** Só em campo personalizado: é texto no Mongo, e a condição diz como comparar. */
  valueType?: CustomFieldType
}

const COMPARE = ["equal_to", "not_equal_to"]
const COMPARE_SET = [...COMPARE, "is_set", "is_empty"]
const ORDERED = ["is_less_than", "is_greater_than", "equal_to"]

function operatorsFor(type: CustomFieldType): string[] {
  switch (type) {
    case "text":
      return ["text_contains", ...COMPARE_SET]
    case "number":
      return [...COMPARE, "is_greater_than", "is_less_than", "is_set", "is_empty"]
    case "list":
      return COMPARE_SET
    case "checkbox":
      return ["equal_to", "is_set"]
    case "date":
      return ["equal_to", "is_greater_than", "is_less_than", "is_set", "is_empty"]
    default:
      return COMPARE
  }
}

function inputFor(type: CustomFieldType): FilterInput {
  if (type === "list" || type === "checkbox") return "select"
  if (type === "number") return "number"
  return type === "date" ? "date" : "text"
}

/**
 * Os campos do construtor de filtros, com os nomes que a API aceita (`docs/migration/api/inbox.md`).
 * Da origem saíram "Etapa do funil" e "Assistente": assistente não existe aqui, e a etapa ainda é do
 * domínio de pipelines. "Campos do contato" vêm de `/custom-fields`.
 */
export function useFilterFields() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { people } = useChatPeople()
  const { tags } = useChatTags()
  const { teams } = useChatTeams()
  const { connectors } = useChatConnectors()
  const { customFields } = useCustomFields()

  const fields = useMemo<FilterField[]>(() => {
    const yesNo: SelectOption[] = [
      { value: "true", label: t("chat.filters.values.yes") },
      { value: "false", label: t("chat.filters.values.no") },
    ]

    const conversation: FilterField[] = [
      {
        key: "assigned_account_id",
        label: t("chat.filters.fields.assignee"),
        group: "conversation",
        input: "select",
        options: people.map((person) => ({
          value: person.id,
          label: person.name,
          description: person.email,
        })),
        operators: COMPARE_SET,
      },
      {
        key: "team_id",
        label: t("chat.filters.fields.team"),
        group: "conversation",
        input: "select",
        options: teams.map((team) => ({ value: team.id, label: team.name })),
        operators: COMPARE_SET,
      },
      {
        key: "tagIds",
        label: t("chat.filters.fields.tags"),
        group: "conversation",
        input: "select",
        options: tags.map((tag) => ({ value: tag.id, label: tag.name })),
        operators: ["contains", "not_contains"],
      },
      {
        key: "connector_id",
        label: t("chat.filters.fields.connector"),
        group: "conversation",
        input: "select",
        options: connectors.map((connector) => ({
          value: connector.id,
          label: connector.name,
          description: t(`chat.channel.${connector.type}`, { defaultValue: "" }) || undefined,
        })),
        operators: COMPARE,
      },
      {
        key: "audience_type",
        label: t("chat.filters.fields.channelType"),
        group: "conversation",
        input: "select",
        options: [
          { value: "whatsapp_api", label: t("chat.channel.whatsapp") },
          { value: "instagram", label: t("chat.channel.instagram") },
          { value: "facebook", label: t("chat.channel.messenger") },
          { value: "web", label: t("chat.channel.web") },
        ],
        operators: COMPARE,
      },
      {
        key: "automation_enabled",
        label: t("chat.filters.fields.automation"),
        group: "conversation",
        input: "select",
        options: [
          { value: "true", label: t("chat.filters.values.on") },
          { value: "false", label: t("chat.filters.values.off") },
        ],
        operators: COMPARE,
      },
      {
        key: "unread_messages",
        label: t("chat.filters.fields.unread"),
        group: "conversation",
        input: "number",
        operators: ["is_greater_than", "equal_to", "is_less_than"],
      },
      {
        key: "last_message_by",
        label: t("chat.filters.fields.lastMessageBy"),
        group: "conversation",
        input: "select",
        options: [
          { value: "user", label: t("chat.filters.values.contact") },
          { value: "assistant", label: t("chat.filters.values.team") },
        ],
        operators: COMPARE,
      },
      {
        key: "created_at",
        label: t("chat.filters.fields.createdAt"),
        group: "conversation",
        input: "date",
        operators: ORDERED,
      },
      {
        key: "last_message_at",
        label: t("chat.filters.fields.lastMessageAt"),
        group: "conversation",
        input: "date",
        operators: ORDERED,
      },
    ]

    const contact = customFields.map<FilterField>((field) => ({
      key: `custom_attributes.${field.key}`,
      label: field.name,
      group: "contact",
      input: inputFor(field.valueType),
      options:
        field.valueType === "list"
          ? field.optionValues.map((option) => ({ value: option, label: option }))
          : field.valueType === "checkbox"
            ? yesNo
            : undefined,
      operators: operatorsFor(field.valueType),
      valueType: field.valueType,
    }))

    return [...conversation, ...contact]
  }, [connectors, customFields, people, t, tags, teams])

  const byKey = useMemo(() => new Map(fields.map((field) => [field.key, field])), [fields])

  /** "Responsável é igual a Camila Rocha": o texto do chip, derivado na hora, nunca guardado. */
  const describe = useCallback(
    (condition: FilterCondition): string => {
      const field = byKey.get(condition.attributeKey)
      const operator = t(`chat.filters.operators.${condition.filterOperator}`, {
        defaultValue: condition.filterOperator,
      })
      const name = field?.label ?? t("chat.filters.unknownField")
      if (needsNoValue(condition.filterOperator)) return `${name} ${operator}`

      const raw = condition.values[0] ?? ""
      const value =
        field?.options?.find((option) => option.value === raw)?.label ??
        (field?.input === "date" && raw ? formatDate(`${raw}T00:00:00`, language, "short") : raw)

      return `${name} ${operator} ${value}`
    },
    [byKey, language, t]
  )

  return { fields, byKey, describe }
}
