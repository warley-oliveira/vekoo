import { useTranslation } from "react-i18next"

import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { TagChip } from "@/components/shared"
import { Button } from "@/components/ui/button"
import type { ContactLookups } from "@/hooks/contacts/use-contacts"
import {
  ASSIGNEE_ME,
  ASSIGNEE_NONE,
  EMPTY_FILTERS,
  TEAM_NONE,
  type ContactFilters,
  type FieldFilter,
} from "@/lib/contacts/filters"
import type { CustomField } from "@/lib/contacts/types"
import { formatDate, formatDateInterval, startOfDay } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

type Chip = {
  id: string
  label: string
  color?: string
  onRemove: () => void
}

export type ActiveFilterChipsProps = {
  filters: ContactFilters
  lookups: ContactLookups
  customFields: CustomField[] | undefined
  onChange: (patch: Partial<ContactFilters>) => void
}

function dateLabel(value: string, language: string) {
  return formatDate(startOfDay(`${value}T12:00:00`), language)
}

/** O que está filtrando, à vista, com um X em cada valor. No celular, é a única pista de que há filtro. */
export function ActiveFilterChips({ filters, lookups, customFields, onChange }: ActiveFilterChipsProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const texts = useConnectorTexts()

  const without = (list: string[], value: string) => list.filter((item) => item !== value)
  const removeLabel = (label: string) => t("contacts.filters.remove", { label })

  const chips: Chip[] = []

  for (const id of filters.connectors) {
    const connector = lookups.connectors.get(id)
    chips.push({
      id: `connector-${id}`,
      label: t("contacts.filters.chip.connector", {
        value: connector ? texts.title(connector) : t("contacts.connector.removed"),
      }),
      onRemove: () => onChange({ connectors: without(filters.connectors, id) }),
    })
  }

  for (const id of filters.tags) {
    const tag = lookups.tags.get(id)
    if (!tag) continue
    chips.push({
      id: `tag-${id}`,
      label: tag.name,
      color: tag.color,
      onRemove: () => onChange({ tags: without(filters.tags, id) }),
    })
  }

  for (const id of filters.teams) {
    chips.push({
      id: `team-${id}`,
      label:
        id === TEAM_NONE
          ? t("contacts.team.none")
          : t("contacts.filters.chip.team", {
              value: lookups.teams.get(id)?.name ?? t("kit.noValue"),
            }),
      onRemove: () => onChange({ teams: without(filters.teams, id) }),
    })
  }

  for (const id of filters.assignees) {
    chips.push({
      id: `assignee-${id}`,
      label:
        id === ASSIGNEE_ME
          ? t("contacts.filters.assignedToMe")
          : id === ASSIGNEE_NONE
            ? t("contacts.assignee.none")
            : t("contacts.filters.chip.assignee", {
                value: lookups.users.get(id)?.name ?? t("contacts.assignee.unknown"),
              }),
      onRemove: () => onChange({ assignees: without(filters.assignees, id) }),
    })
  }

  for (const value of filters.status) {
    chips.push({
      id: `status-${value}`,
      label: t("contacts.filters.chip.status", { value: t(`contacts.status.${value}`) }),
      onRemove: () => onChange({ status: filters.status.filter((item) => item !== value) }),
    })
  }

  for (const value of filters.automation) {
    chips.push({
      id: `automation-${value}`,
      label: t("contacts.filters.chip.automation", { value: t(`contacts.automation.${value}`) }),
      onRemove: () => onChange({ automation: filters.automation.filter((item) => item !== value) }),
    })
  }

  if (filters.session) {
    chips.push({
      id: "session",
      label: t("contacts.filters.session"),
      onRemove: () => onChange({ session: false }),
    })
  }

  const createdFrom = filters.from ?? filters.to
  const createdTo = filters.to ?? filters.from
  if (createdFrom && createdTo) {
    chips.push({
      id: "created",
      label: t("contacts.filters.chip.createdAt", {
        value: formatDateInterval(
          startOfDay(`${createdFrom}T12:00:00`),
          startOfDay(`${createdTo}T12:00:00`),
          language
        ),
      }),
      onRemove: () => onChange({ from: null, to: null }),
    })
  }

  const fieldName = (key: string) =>
    customFields?.find((field) => field.key === key)?.name ?? key

  const fieldValue = ({ op, value }: FieldFilter) => {
    switch (op) {
      case "has":
        return t("contacts.filters.chip.contains", { value })
      case "gt":
        return t("contacts.filters.chip.greaterThan", {
          value: formatNumber(Number(value), language),
        })
      case "lt":
        return t("contacts.filters.chip.lessThan", {
          value: formatNumber(Number(value), language),
        })
      case "yes":
        return t("contacts.custom.yes")
      case "no":
        return t("contacts.custom.no")
      case "from":
        return t("contacts.filters.chip.from", { value: dateLabel(value, language) })
      case "to":
        return t("contacts.filters.chip.to", { value: dateLabel(value, language) })
      default:
        return value
    }
  }

  for (const filter of filters.fields) {
    chips.push({
      id: `field-${filter.key}-${filter.op}-${filter.value}`,
      label: t("contacts.filters.chip.field", {
        name: fieldName(filter.key),
        value: fieldValue(filter),
      }),
      onRemove: () => onChange({ fields: filters.fields.filter((item) => item !== filter) }),
    })
  }

  if (chips.length === 0) return null

  return (
    <div
      role="group"
      aria-label={t("contacts.filters.active")}
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map((chip) => (
        <TagChip
          key={chip.id}
          color={chip.color}
          className="max-w-64"
          onRemove={chip.onRemove}
          removeLabel={removeLabel(chip.label)}
        >
          {chip.label}
        </TagChip>
      ))}
      {chips.length > 1 ? (
        // No desktop, a barra de filtros já tem o seu "Limpar filtros". No celular ele fica
        // dentro do painel, a um toque a mais.
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground md:hidden pointer-coarse:h-10"
          onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q })}
        >
          {t("contacts.filters.clearAll")}
        </Button>
      ) : null}
    </div>
  )
}
