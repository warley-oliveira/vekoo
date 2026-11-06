import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ChartNoAxesColumnDecreasing, Eye, EyeOff, Pencil, RefreshCw, Trash2 } from "lucide-react"

import { FunnelFootnote, FunnelStages } from "@/components/dashboard/funnel-stages"
import { formatRate } from "@/components/dashboard/format"
import {
  ActionsMenu,
  FacetedFilter,
  FilterBar,
  FilterPopover,
  ResponsivePopover,
  SearchableSelect,
  SearchInput,
  SelectInput,
  useFilterLayout,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useChatPeople, useChatTags } from "@/hooks/insights/use-funnel-chat"
import { DAY_OPTIONS } from "@/hooks/insights/use-funnel-filters"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { stageRows } from "./board-state"
import type { BoardFilters, DateField, Funnel, FunnelBoard } from "./types"

/** Mais funis que isto pedem busca no seletor. */
const SEARCH_FROM = 10

type FunnelSwitcherProps = {
  funnels: Funnel[]
  funnelId: string
  onChange: (id: string) => void
  onEdit: () => void
  onDelete: () => void
  className?: string
}

/** Qual funil, e o que dá para fazer com ele. */
export function FunnelSwitcher({ funnels, funnelId, onChange, onEdit, onDelete, className }: FunnelSwitcherProps) {
  const { t } = useTranslation()
  const current = funnels.find((funnel) => funnel.id === funnelId)
  const options = useMemo<SelectOption[]>(
    () => funnels.map((funnel) => ({ value: funnel.id, label: funnel.name })),
    [funnels]
  )

  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {funnels.length > SEARCH_FROM ? (
        <SearchableSelect
          aria-label={t("funnels.select")}
          options={options}
          value={funnelId}
          onChange={(value) => {
            if (value) onChange(value)
          }}
          className="min-w-0 flex-1 md:w-64 md:flex-none"
        />
      ) : (
        <SelectInput
          aria-label={t("funnels.select")}
          options={options}
          value={funnelId}
          onChange={(value) => {
            if (value) onChange(value)
          }}
          className="min-w-0 flex-1 font-medium md:w-64 md:flex-none"
        />
      )}
      <ActionsMenu
        label={t("funnels.actionsOf", { name: current?.name ?? "" })}
        actions={[
          { label: t("funnels.edit.action"), icon: <Pencil />, onSelect: onEdit },
          {
            label: t("funnels.delete.action"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}

/** Dentro do painel de filtros do celular, cada um leva o próprio título. Em linha, o valor já diz. */
function LabeledFilter({ label, children }: { label: string; children: ReactNode }) {
  const layout = useFilterLayout()
  if (layout !== "stacked") return <>{children}</>
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  )
}

/** Em linha, o nome do filtro é o próprio placeholder. Empilhado, o título já diz, e o vazio é "todos". */
function ResponsibleFilter({
  options,
  value,
  onChange,
}: {
  options: SelectOption[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  const { t } = useTranslation()
  const stacked = useFilterLayout() === "stacked"

  return (
    <LabeledFilter label={t("funnels.filters.responsible")}>
      <div className="relative md:w-48">
        <SearchableSelect
          aria-label={t("funnels.filters.responsible")}
          placeholder={t(stacked ? "funnels.filters.everyone" : "funnels.filters.responsible")}
          options={options}
          value={value}
          clearable
          onChange={(next) => onChange(next)}
        />
      </div>
    </LabeledFilter>
  )
}

type BoardFiltersBarProps = {
  filters: BoardFilters
  activeCount: number
  board: FunnelBoard | undefined
  isValidating: boolean
  showNoStage: boolean
  onDays: (days: number) => void
  onDateField: (field: DateField) => void
  onAssignedUser: (value: string | null) => void
  onTagIds: (value: string[]) => void
  onQuery: (value: string) => void
  onClear: () => void
  onToggleNoStage: () => void
  onRefresh: () => void
}

export function BoardFiltersBar({
  filters,
  activeCount,
  board,
  isValidating,
  showNoStage,
  onDays,
  onDateField,
  onAssignedUser,
  onTagIds,
  onQuery,
  onClear,
  onToggleNoStage,
  onRefresh,
}: BoardFiltersBarProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { tags } = useChatTags()
  const { people } = useChatPeople()

  // Sem a permissão de chat, a API de pessoas é fechada: as opções saem de quem já está no quadro.
  const peopleOptions = useMemo<SelectOption[]>(() => {
    if (people) return people.map((person) => ({ value: person.id, label: person.name }))
    const seen = new Map<string, string>()
    for (const column of board?.columns ?? []) {
      for (const chat of column.chats) {
        if (chat.assignedAccountId && chat.assignedAccountName) {
          seen.set(chat.assignedAccountId, chat.assignedAccountName)
        }
      }
    }
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [board?.columns, people])

  const responsibleOptions = useMemo<SelectOption[]>(
    () => [
      { value: "me", label: t("funnels.filters.mine") },
      { value: "unassigned", label: t("funnels.filters.unassigned") },
      ...peopleOptions,
    ],
    [peopleOptions, t]
  )

  const tagOptions = useMemo(
    () => (tags ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
    [tags]
  )

  const search = {
    value: filters.q,
    onChange: onQuery,
    placeholder: t("funnels.filters.search"),
    loading: isValidating && Boolean(filters.q),
  }

  const fields = (
    <>
      <LabeledFilter label={t("funnels.filters.period")}>
        <SelectInput
          aria-label={t("funnels.filters.period")}
          className="md:w-32"
          value={String(filters.days)}
          onChange={(value) => {
            if (value) onDays(Number(value))
          }}
          options={DAY_OPTIONS.map((days) => ({
            value: String(days),
            label: t("funnels.filters.days", { count: days }),
          }))}
        />
      </LabeledFilter>
      <LabeledFilter label={t("funnels.filters.dateField")}>
        <SelectInput
          aria-label={t("funnels.filters.dateField")}
          className="md:w-44"
          value={filters.dateField}
          onChange={(value) => {
            if (value) onDateField(value as DateField)
          }}
          options={[
            { value: "last_message_at", label: t("funnels.filters.lastMessage") },
            { value: "created_at", label: t("funnels.filters.createdAt") },
          ]}
        />
      </LabeledFilter>
      <ResponsibleFilter options={responsibleOptions} value={filters.assignedUser} onChange={onAssignedUser} />
      <FacetedFilter
        title={t("funnels.filters.tags")}
        options={tagOptions}
        value={filters.tagIds}
        onChange={onTagIds}
      />
    </>
  )

  // Em 390 px cada linha acima do quadro é uma conversa a menos na tela: busca e filtros dividem uma só.
  if (isMobile) {
    return (
      <div className="flex items-center gap-2">
        <SearchInput {...search} shortcut={false} className="min-w-0 flex-1" />
        <FilterPopover iconOnly activeCount={activeCount} onClear={onClear}>
          {fields}
          <label className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{t("funnels.filters.showNoStage")}</span>
              <span className="text-xs text-muted-foreground">{t("funnels.filters.showNoStageHint")}</span>
            </span>
            <Switch checked={showNoStage} onCheckedChange={onToggleNoStage} />
          </label>
        </FilterPopover>
        <RefreshButton isValidating={isValidating} onRefresh={onRefresh} />
      </div>
    )
  }

  return (
    <FilterBar search={{ ...search, className: "md:w-56" }} activeCount={activeCount} onClear={onClear} filters={fields} />
  )
}

function RefreshButton({ isValidating, onRefresh }: { isValidating: boolean; onRefresh: () => void }) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("funnels.refresh")}
      title={t("funnels.refresh")}
      className="text-muted-foreground"
      onClick={onRefresh}
    >
      <RefreshCw className={cn(isValidating && "animate-spin motion-reduce:animate-none")} />
    </Button>
  )
}

type BoardSummaryProps = {
  board: FunnelBoard | undefined
  isValidating: boolean
  showNoStage: boolean
  onToggleNoStage: () => void
  onRefresh: () => void
}

/**
 * O resumo do quadro, na linha do funil. Fica fora da linha de filtros de propósito: "Limpar filtros"
 * aparecendo não pode quebrar a linha e empurrar o quadro. No celular, só a conversão: o resto está nos
 * filtros, e os contadores estão nas etapas.
 */
export function BoardSummary({ board, isValidating, showNoStage, onToggleNoStage, onRefresh }: BoardSummaryProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isMobile = useIsMobile()
  const total = board?.metrics.total ?? 0

  return (
    <div className="flex shrink-0 items-center gap-2">
      {isMobile ? null : (
        <>
          {board ? (
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {total > 0
                ? t("funnels.count", { count: total, value: formatNumber(total, language) })
                : t("funnels.countNone")}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showNoStage}
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={onToggleNoStage}
          >
            {showNoStage ? <Eye /> : <EyeOff />}
            {t("funnels.filters.noStage")}
          </Button>
          <RefreshButton isValidating={isValidating} onRefresh={onRefresh} />
        </>
      )}
      {board ? <ConversionButton board={board} /> : null}
    </div>
  )
}

/** Métricas e conversão: o gráfico de etapas do Dashboard, com os números deste recorte. */
export function ConversionButton({ board, className }: { board: FunnelBoard; className?: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const rows = stageRows(board)
  const last = rows[rows.length - 1]

  return (
    <ResponsivePopover
      title={t("funnels.metrics.title")}
      showTitle
      align="end"
      className="flex w-96 flex-col gap-3"
      sheetClassName="flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      trigger={
        <Button type="button" variant="outline" size="sm" className={cn("shrink-0 pointer-coarse:h-10", className)}>
          <ChartNoAxesColumnDecreasing />
          {t("funnels.metrics.action", { value: last ? formatRate(last.conversionRate, language) : "–" })}
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        {t("funnels.metrics.description", {
          count: board.metrics.total,
          total: formatNumber(board.metrics.total, language),
          noStage: formatNumber(board.metrics.noStage, language),
        })}
      </p>
      <FunnelStages stages={rows} />
      <FunnelFootnote stages={rows} />
    </ResponsivePopover>
  )
}
