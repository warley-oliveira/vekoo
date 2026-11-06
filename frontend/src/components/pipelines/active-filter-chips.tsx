import { memo, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Filter, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { BoardFiltersApi } from "@/hooks/pipelines/use-board-filters"
import { useLabels } from "@/hooks/pipelines/use-labels"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { formatCurrency } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { parseDayKey } from "@/lib/pipelines/card-meta"
import {
  ASSIGNEE_ME,
  ASSIGNEE_NONE,
  labelOfAdvanced,
  readRange,
  type BoardFilters,
} from "@/lib/pipelines/filters"
import { formatShortDay } from "@/lib/pipelines/format"
import type { CustomField, PresetFilter, SavedFilter, Stage } from "@/lib/pipelines/types"

type Chip = {
  key: string
  label: string
  patch: Partial<BoardFilters>
}

function Pill({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <span className="inline-flex h-7 max-w-64 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 text-xs pointer-coarse:h-9">
      <span className="truncate">{children}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-5 text-muted-foreground pointer-coarse:size-8"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <X />
      </Button>
    </span>
  )
}

type ActiveFilterChipsProps = {
  api: Pick<BoardFiltersApi, "filters" | "advanced" | "setFilters" | "setAdvanced" | "clearAll">
  stages: Stage[]
  customFields: CustomField[]
  savedFilters: SavedFilter[]
  presets: PresetFilter[]
  /** Clicar no filtro avançado abre o construtor com ele. */
  onEditAdvanced: () => void
}

/** O que está filtrando agora, em uma linha, com o X de cada um. Sem filtro, não ocupa lugar. */
export const ActiveFilterChips = memo(function ActiveFilterChips({
  api,
  stages,
  customFields,
  savedFilters,
  presets,
  onEditAdvanced,
}: ActiveFilterChipsProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { filters, advanced, setFilters, setAdvanced, clearAll } = api
  const { labels } = useLabels()
  const { people } = usePeopleOptions()

  const chips = useMemo<Chip[]>(() => {
    const list: Chip[] = []

    const day = (value: string) => formatShortDay(value, language)
    const range = (from: string | null, to: string | null) =>
      from && to
        ? `${day(from)} – ${day(to)}`
        : from
          ? t("pipelines.filters.chips.from", { value: day(from) })
          : t("pipelines.filters.chips.to", { value: day(to ?? "") })

    for (const id of filters.assignees) {
      const name =
        id === ASSIGNEE_ME
          ? t("pipelines.filters.assigneeMe")
          : id === ASSIGNEE_NONE
            ? t("pipelines.filters.assigneeNone")
            : (people.find((person) => person.id === id)?.name ?? "…")
      list.push({
        key: `assignee-${id}`,
        label: t("pipelines.filters.chips.assignee", { value: name }),
        patch: { assignees: filters.assignees.filter((item) => item !== id) },
      })
    }
    for (const id of filters.labels) {
      list.push({
        key: `label-${id}`,
        label: labels.find((label) => label.id === id)?.name ?? "…",
        patch: { labels: filters.labels.filter((item) => item !== id) },
      })
    }
    for (const id of filters.stages) {
      list.push({
        key: `stage-${id}`,
        label: t("pipelines.filters.chips.stage", {
          value: stages.find((stage) => stage.id === id)?.name ?? "…",
        }),
        patch: { stages: filters.stages.filter((item) => item !== id) },
      })
    }
    for (const priority of filters.priorities) {
      list.push({
        key: `priority-${priority}`,
        label: t(`pipelines.priority.${priority}`),
        patch: { priorities: filters.priorities.filter((item) => item !== priority) },
      })
    }
    for (const status of filters.deals) {
      list.push({
        key: `deal-${status}`,
        label: t(`pipelines.deal.status.${status}`),
        patch: { deals: filters.deals.filter((item) => item !== status) },
      })
    }
    if (filters.overdue) {
      list.push({
        key: "overdue",
        label: t("pipelines.filters.presetsQuick.overdue"),
        patch: { overdue: false },
      })
    }
    if (filters.dueFrom || filters.dueTo) {
      list.push({
        key: "due",
        label: t("pipelines.filters.chips.due", { value: range(filters.dueFrom, filters.dueTo) }),
        patch: { dueFrom: null, dueTo: null },
      })
    }
    if (filters.closeFrom || filters.closeTo) {
      list.push({
        key: "close",
        label: t("pipelines.filters.chips.close", {
          value: range(filters.closeFrom, filters.closeTo),
        }),
        patch: { closeFrom: null, closeTo: null },
      })
    }

    const numberRange = (
      key: string,
      labelKey: string,
      min: number | null,
      max: number | null,
      format: (value: number) => string,
      patch: Partial<BoardFilters>
    ) => {
      if (min === null && max === null) return
      const value =
        min !== null && max !== null
          ? `${format(min)} – ${format(max)}`
          : min !== null
            ? `≥ ${format(min)}`
            : `≤ ${format(max ?? 0)}`
      list.push({ key, label: t(labelKey, { value }), patch })
    }

    numberRange(
      "value",
      "pipelines.filters.chips.value",
      filters.valueMin,
      filters.valueMax,
      (value) => formatCurrency(value, language, { maximumFractionDigits: 0 }),
      { valueMin: null, valueMax: null }
    )
    numberRange(
      "probability",
      "pipelines.filters.chips.probability",
      filters.probabilityMin,
      filters.probabilityMax,
      (value) => `${value}%`,
      { probabilityMin: null, probabilityMax: null }
    )
    numberRange(
      "score",
      "pipelines.filters.chips.score",
      filters.scoreMin,
      filters.scoreMax,
      String,
      { scoreMin: null, scoreMax: null }
    )

    if (filters.company) {
      list.push({
        key: "company",
        label: t("pipelines.filters.chips.company", { value: filters.company }),
        patch: { company: "" },
      })
    }
    if (filters.chat) {
      list.push({
        key: "chat",
        label: t("pipelines.filters.chips.chat"),
        patch: { chat: null },
      })
    }

    for (const [key, values] of Object.entries(filters.custom)) {
      const field = customFields.find((candidate) => candidate.key === key)
      let value = values.join(", ")
      if (field?.fieldType === "checkbox") {
        value = t(values[0] === "1" ? "pipelines.filters.yes" : "pipelines.filters.no")
      } else if (field?.fieldType === "user") {
        value = values
          .map((id) => people.find((person) => person.id === id)?.name ?? "…")
          .join(", ")
      } else if (field?.fieldType === "date") {
        const { from, to } = readRange(values[0])
        value = [from, to]
          .filter(Boolean)
          .map((item) => formatShortDay(parseDayKey(item).getTime(), language))
          .join(" – ")
      } else if (field?.fieldType === "number") {
        const { from, to } = readRange(values[0])
        value = [from, to].filter(Boolean).join(" – ")
      }
      const rest = { ...filters.custom }
      delete rest[key]
      list.push({
        key: `custom-${key}`,
        label: `${field?.name ?? key}: ${value}`,
        patch: { custom: rest },
      })
    }

    return list
  }, [customFields, filters, labels, language, people, stages, t])

  const advancedLabel = useMemo(() => {
    if (!advanced) return null
    return labelOfAdvanced(advanced, savedFilters, presets, t)
  }, [advanced, presets, savedFilters, t])

  if (chips.length === 0 && !advanced) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {advanced ? (
        <span className="inline-flex h-7 max-w-72 items-center rounded-md bg-accent pr-0.5 text-xs font-medium text-accent-foreground pointer-coarse:h-9">
          <button
            type="button"
            className="inline-flex h-full min-w-0 items-center gap-1 rounded-l-md pl-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            title={t("pipelines.filters.editActive")}
            onClick={onEditAdvanced}
          >
            <Filter className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{advancedLabel}</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5 pointer-coarse:size-8"
            aria-label={t("pipelines.filters.removeAdvanced")}
            onClick={() => setAdvanced(null)}
          >
            <X />
          </Button>
        </span>
      ) : null}

      {chips.map((chip) => (
        <Pill
          key={chip.key}
          removeLabel={t("pipelines.filters.removeChip", { label: chip.label })}
          onRemove={() => setFilters(chip.patch)}
        >
          {chip.label}
        </Pill>
      ))}

      {chips.length + (advanced ? 1 : 0) > 1 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-muted-foreground max-md:hidden"
          onClick={clearAll}
        >
          {t("pipelines.filters.clearAll")}
        </Button>
      ) : null}
    </div>
  )
})
