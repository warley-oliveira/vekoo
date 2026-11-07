import { memo, useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Calendar, Flame, SlidersHorizontal, User } from "lucide-react"

import {
  CurrencyInput,
  DatePicker,
  DateRangePicker,
  FacetedFilter,
  FilterBar,
  FilterPopover,
  NumberInput,
  useFilterLayout,
  type DateRangeValue,
  type FacetOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { BoardFiltersApi } from "@/hooks/pipelines/use-board-filters"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { useLabels } from "@/hooks/pipelines/use-labels"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { localDayKey, parseDayKey, type LeadScoreConfig } from "@/lib/pipelines/card-meta"
import {
  ASSIGNEE_ME,
  ASSIGNEE_NONE,
  countActiveFilters,
  readRange,
  writeRange,
} from "@/lib/pipelines/filters"
import { CARD_PRIORITIES, DEAL_STATUSES, type CustomField, type Stage } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

function colorDot(color: string | null | undefined) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

function dayRangeValue(from: string | null, to: string | null): DateRangeValue | null {
  if (!from && !to) return null
  return {
    from: parseDayKey(from ?? to ?? ""),
    to: parseDayKey(to ?? from ?? ""),
  }
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  )
}

/** Mínimo e máximo. Sem unidade própria: o rótulo de cada caixa diz o que é. */
function NumberRange({
  label,
  min,
  max,
  currency = false,
  onChange,
}: {
  label: string
  min: number | null
  max: number | null
  currency?: boolean
  onChange: (min: number | null, max: number | null) => void
}) {
  const { t } = useTranslation()
  const Control = currency ? CurrencyInput : NumberInput
  return (
    <FilterField label={label}>
      <div className="grid grid-cols-2 gap-2">
        <Control
          aria-label={t("pipelines.filters.minOf", { label })}
          placeholder={t("pipelines.filters.min")}
          value={min}
          onChange={(value) => onChange(value, max)}
        />
        <Control
          aria-label={t("pipelines.filters.maxOf", { label })}
          placeholder={t("pipelines.filters.max")}
          value={max}
          onChange={(value) => onChange(min, value)}
        />
      </div>
    </FilterField>
  )
}

function CustomFieldFilter({
  field,
  values,
  peopleOptions,
  onChange,
}: {
  field: CustomField
  values: string[]
  peopleOptions: FacetOption[]
  onChange: (values: string[]) => void
}) {
  const { t } = useTranslation()

  switch (field.fieldType) {
    case "select":
      return (
        <FacetedFilter
          title={field.name}
          value={values}
          onChange={onChange}
          options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
        />
      )
    case "user":
      return (
        <FacetedFilter
          title={field.name}
          value={values}
          onChange={onChange}
          options={peopleOptions}
        />
      )
    case "checkbox":
      return (
        <FilterField label={field.name}>
          <div className="flex gap-1">
            {(["1", "0"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={values[0] === option ? "secondary" : "outline"}
                className="flex-1 pointer-coarse:h-10"
                aria-pressed={values[0] === option}
                onClick={() => onChange(values[0] === option ? [] : [option])}
              >
                {t(option === "1" ? "pipelines.filters.yes" : "pipelines.filters.no")}
              </Button>
            ))}
          </div>
        </FilterField>
      )
    case "number": {
      const { from, to } = readRange(values[0])
      return (
        <NumberRange
          label={field.name}
          min={from === "" ? null : Number(from)}
          max={to === "" ? null : Number(to)}
          onChange={(min, max) => {
            const next = writeRange(min, max)
            onChange(next ? [next] : [])
          }}
        />
      )
    }
    case "date": {
      const { from, to } = readRange(values[0])
      return (
        <FilterField label={field.name}>
          <div className="grid grid-cols-2 gap-2">
            <DatePicker
              label={t("pipelines.filters.fromOf", { label: field.name })}
              clearable
              value={from ? parseDayKey(from) : null}
              onChange={(date) => {
                const next = writeRange(date ? localDayKey(date) : null, to || null)
                onChange(next ? [next] : [])
              }}
            />
            <DatePicker
              label={t("pipelines.filters.toOf", { label: field.name })}
              clearable
              value={to ? parseDayKey(to) : null}
              onChange={(date) => {
                const next = writeRange(from || null, date ? localDayKey(date) : null)
                onChange(next ? [next] : [])
              }}
            />
          </div>
        </FilterField>
      )
    }
    default:
      return (
        <FilterField label={field.name}>
          <Input
            value={values[0] ?? ""}
            onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
          />
        </FilterField>
      )
  }
}

/** A segunda linha de filtros: atrás de um botão, ou direto no painel, no celular. */
function MoreFilters({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useTranslation()
  const layout = useFilterLayout()
  if (layout === "stacked") return <>{children}</>
  return (
    <FilterPopover label={t("pipelines.filters.more")} activeCount={count}>
      {children}
    </FilterPopover>
  )
}

function PresetChip({
  icon,
  label,
  active,
  onToggle,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      aria-pressed={active}
      className={cn("pointer-coarse:h-10", active && "bg-accent text-accent-foreground")}
      onClick={onToggle}
    >
      {icon}
      {label}
    </Button>
  )
}

type BoardFilterBarProps = {
  api: Pick<BoardFiltersApi, "filters" | "setFilters" | "clearAll">
  stages: Stage[]
  customFields: CustomField[]
  isCrm: boolean
  leadScore: LeadScoreConfig | null
  hasAdvanced: boolean
  resultLabel: ReactNode
  actions: ReactNode
  searching?: boolean
}

/**
 * A barra de filtros do pipeline. Os que mais se usam ficam à vista; o resto, em "Mais filtros".
 * No celular, tudo vai para o painel de filtros, e a linha fica só com a busca e os botões.
 */
export const BoardFilterBar = memo(function BoardFilterBar({
  api,
  stages,
  customFields,
  isCrm,
  leadScore,
  hasAdvanced,
  resultLabel,
  actions,
  searching,
}: BoardFilterBarProps) {
  const { t } = useTranslation()
  const { filters, setFilters, clearAll } = api
  const isMobile = useIsMobile()
  const { labels } = useLabels()
  const { people } = usePeopleOptions()

  const peopleOptions = useMemo<FacetOption[]>(
    () => people.map((person) => ({ value: person.id, label: person.name })),
    [people]
  )

  const assigneeOptions = useMemo<FacetOption[]>(
    () => [
      { value: ASSIGNEE_ME, label: t("pipelines.filters.assigneeMe") },
      { value: ASSIGNEE_NONE, label: t("pipelines.filters.assigneeNone") },
      ...peopleOptions,
    ],
    [peopleOptions, t]
  )
  const labelOptions = useMemo<FacetOption[]>(
    () =>
      labels.map((label) => ({ value: label.id, label: label.name, icon: colorDot(label.color) })),
    [labels]
  )
  const stageOptions = useMemo<FacetOption[]>(
    () =>
      stages.map((stage) => ({ value: stage.id, label: stage.name, icon: colorDot(stage.color) })),
    [stages]
  )
  const priorityOptions = useMemo<FacetOption[]>(
    () =>
      CARD_PRIORITIES.map((priority) => ({
        value: priority,
        label: t(`pipelines.priority.${priority}`),
      })),
    [t]
  )
  const dealOptions = useMemo<FacetOption[]>(
    () =>
      DEAL_STATUSES.map((status) => ({
        value: status,
        label: t(`pipelines.deal.status.${status}`),
      })),
    [t]
  )

  const activeCount = countActiveFilters(filters)
  const moreCount =
    (filters.stages.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.closeFrom || filters.closeTo ? 1 : 0) +
    (filters.valueMin !== null || filters.valueMax !== null ? 1 : 0) +
    (filters.probabilityMin !== null || filters.probabilityMax !== null ? 1 : 0) +
    (filters.scoreMin !== null || filters.scoreMax !== null ? 1 : 0) +
    (filters.company ? 1 : 0) +
    Object.keys(filters.custom).length

  /* ---------- atalhos ---------- */

  const assignedToMe = filters.assignees.includes(ASSIGNEE_ME)
  const thisWeek = useMemo(() => {
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: localDayKey(monday), to: localDayKey(sunday) }
  }, [])
  const closingThisWeek = filters.closeFrom === thisWeek.from && filters.closeTo === thisWeek.to
  const hotThreshold = leadScore?.high ?? null
  const hotLeads = hotThreshold !== null && filters.scoreMin === hotThreshold

  const setCustom = (key: string, values: string[]) => {
    const custom = { ...filters.custom }
    if (values.length > 0) custom[key] = values
    else delete custom[key]
    setFilters({ custom }, { replace: true })
  }

  return (
    <FilterBar
      search={{
        value: filters.q,
        onChange: (q) => setFilters({ q }, { replace: true }),
        placeholder: t("pipelines.filters.searchPlaceholder"),
        "aria-label": t("pipelines.filters.searchPlaceholder"),
        loading: searching,
        className: "md:w-48",
      }}
      activeCount={activeCount}
      // No computador, limpar fica junto dos filtros ativos, e não empurra a barra para outra linha.
      onClear={isMobile && (activeCount > 0 || filters.q || hasAdvanced) ? clearAll : undefined}
      resultLabel={resultLabel}
      actions={actions}
      filters={
        <>
          <PresetChip
            icon={<User />}
            label={t("pipelines.filters.presetsQuick.assignedToMe")}
            active={assignedToMe}
            onToggle={() =>
              setFilters({
                assignees: assignedToMe
                  ? filters.assignees.filter((id) => id !== ASSIGNEE_ME)
                  : [...filters.assignees, ASSIGNEE_ME],
              })
            }
          />
          <FacetedFilter
            title={t("pipelines.filters.assignee")}
            options={assigneeOptions}
            value={filters.assignees}
            onChange={(assignees) => setFilters({ assignees })}
          />
          <FacetedFilter
            title={t("pipelines.filters.labels")}
            options={labelOptions}
            value={filters.labels}
            onChange={(labelIds) => setFilters({ labels: labelIds })}
          />
          <DateRangePicker
            label={t("pipelines.filters.dueDate")}
            placeholder={t("pipelines.filters.dueDate")}
            value={dayRangeValue(filters.dueFrom, filters.dueTo)}
            onChange={(range) =>
              setFilters({
                dueFrom: range ? localDayKey(range.from) : null,
                dueTo: range ? localDayKey(range.to) : null,
              })
            }
            className="md:w-auto"
          />
          {isCrm ? (
            <FacetedFilter
              title={t("pipelines.filters.dealStatus")}
              options={dealOptions}
              value={filters.deals}
              onChange={(deals) => setFilters({ deals })}
            />
          ) : null}

          <MoreFilters count={moreCount + (filters.overdue ? 1 : 0)}>
            <div className="flex flex-wrap gap-1.5">
              <PresetChip
                icon={<Calendar />}
                label={t("pipelines.filters.presetsQuick.overdue")}
                active={filters.overdue}
                onToggle={() => setFilters({ overdue: !filters.overdue })}
              />
              {isCrm ? (
                <PresetChip
                  icon={<Calendar />}
                  label={t("pipelines.filters.presetsQuick.closingThisWeek")}
                  active={closingThisWeek}
                  onToggle={() =>
                    setFilters(
                      closingThisWeek
                        ? { closeFrom: null, closeTo: null }
                        : { closeFrom: thisWeek.from, closeTo: thisWeek.to }
                    )
                  }
                />
              ) : null}
              {isCrm && hotThreshold !== null ? (
                <PresetChip
                  icon={<Flame />}
                  label={t("pipelines.filters.presetsQuick.hotLeads")}
                  active={hotLeads}
                  onToggle={() => setFilters({ scoreMin: hotLeads ? null : hotThreshold })}
                />
              ) : null}
            </div>

            <FacetedFilter
              title={t("pipelines.filters.stage")}
              options={stageOptions}
              value={filters.stages}
              onChange={(stageIds) => setFilters({ stages: stageIds })}
            />
            <FacetedFilter
              title={t("pipelines.filters.priority")}
              options={priorityOptions}
              value={filters.priorities}
              onChange={(priorities) => setFilters({ priorities })}
            />

            {isCrm ? (
              <>
                <NumberRange
                  currency
                  label={t("pipelines.filters.value")}
                  min={filters.valueMin}
                  max={filters.valueMax}
                  onChange={(valueMin, valueMax) =>
                    setFilters({ valueMin, valueMax }, { replace: true })
                  }
                />
                <NumberRange
                  label={t("pipelines.filters.probability")}
                  min={filters.probabilityMin}
                  max={filters.probabilityMax}
                  onChange={(probabilityMin, probabilityMax) =>
                    setFilters({ probabilityMin, probabilityMax }, { replace: true })
                  }
                />
                {leadScore ? (
                  <NumberRange
                    label={t("pipelines.filters.leadScore")}
                    min={filters.scoreMin}
                    max={filters.scoreMax}
                    onChange={(scoreMin, scoreMax) =>
                      setFilters({ scoreMin, scoreMax }, { replace: true })
                    }
                  />
                ) : null}
                <DateRangePicker
                  label={t("pipelines.filters.expectedClose")}
                  placeholder={t("pipelines.filters.expectedClose")}
                  value={dayRangeValue(filters.closeFrom, filters.closeTo)}
                  onChange={(range) =>
                    setFilters({
                      closeFrom: range ? localDayKey(range.from) : null,
                      closeTo: range ? localDayKey(range.to) : null,
                    })
                  }
                />
                <FilterField label={t("pipelines.filters.company")}>
                  <Input
                    value={filters.company}
                    onChange={(event) =>
                      setFilters({ company: event.target.value }, { replace: true })
                    }
                  />
                </FilterField>
              </>
            ) : null}

            {customFields.length > 0 ? (
              <div className="flex flex-col gap-3 border-t pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SlidersHorizontal className="size-3" aria-hidden />
                  {t("pipelines.filters.customFields")}
                </span>
                {customFields.map((field) => (
                  <CustomFieldFilter
                    key={field.id}
                    field={field}
                    values={filters.custom[field.key] ?? []}
                    peopleOptions={peopleOptions}
                    onChange={(values) => setCustom(field.key, values)}
                  />
                ))}
              </div>
            ) : null}
          </MoreFilters>
        </>
      }
    />
  )
})
