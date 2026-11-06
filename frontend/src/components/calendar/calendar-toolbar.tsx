import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Globe,
  LayoutGrid,
  List,
  PanelLeft,
} from "lucide-react"

import { FacetedFilter, FilterPopover, SegmentedControl, type FacetOption } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CalendarScreenFilters } from "@/hooks/calendar/use-calendar-screen"
import { CALENDAR_VIEWS, PHONE_VIEWS, type CalendarView } from "@/lib/calendar/calendar-view"
import { SITUATIONS, type Situation } from "@/lib/calendar/event-status"
import {
  formatInZone,
  zoneDiffersFromBrowser,
  zoneDisplayName,
} from "@/lib/calendar/timezone"
import type { CalendarFilterOptions } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { getTagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"

const VIEW_ICON = {
  agenda: List,
  day: CalendarDays,
  week: CalendarRange,
  month: LayoutGrid,
} as const

export function ViewSwitch({
  value,
  onChange,
  isPhone,
}: {
  value: CalendarView
  onChange: (view: CalendarView) => void
  isPhone: boolean
}) {
  const { t } = useTranslation()
  const views = isPhone ? PHONE_VIEWS : CALENDAR_VIEWS
  return (
    <SegmentedControl
      aria-label={t("calendar.toolbar.view")}
      value={value}
      onChange={onChange}
      fullWidth={isPhone}
      options={views.map((view) => {
        const Icon = VIEW_ICON[view]
        return {
          value: view,
          icon: <Icon />,
          label: t(`calendar.views.${view}`),
        }
      })}
    />
  )
}

/**
 * Hoje, anterior, próximo e o título do período. É a barra mais usada da tela: no toque, os três
 * têm alvo de 40 px, e o título abre o resto no celular.
 */
export function CalendarNavigator({
  title,
  isToday,
  onToday,
  onPrevious,
  onNext,
  stepLabel,
}: {
  title: string
  isToday: boolean
  onToday: () => void
  onPrevious: () => void
  onNext: () => void
  stepLabel: { previous: string; next: string }
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isToday}
        className="pointer-coarse:h-10"
        onClick={onToday}
      >
        {t("calendar.days.today")}
      </Button>
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={stepLabel.previous}
          onClick={onPrevious}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={stepLabel.next}
          onClick={onNext}
        >
          <ChevronRight />
        </Button>
      </div>
      {/* Anunciado sozinho: trocar de dia sem olhar para a tela ainda diz onde se está. */}
      <h2
        aria-live="polite"
        className="min-w-0 truncate font-heading text-base leading-snug font-medium md:text-lg"
      >
        {title}
      </h2>
    </div>
  )
}

/** A tela diz o fuso só quando ele não é o do relógio de quem está olhando. */
export function TimeZoneNote({
  zones,
  className,
}: {
  zones: string[]
  className?: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const differs = zones.some((zone) => zoneDiffersFromBrowser(zone))
  if (!differs) return null

  const mixed = zones.length > 1
  const now = Date.now()
  const label = mixed
    ? t("calendar.zone.mixed")
    : t("calendar.zone.single", { zone: zoneDisplayName(zones[0], language) })

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 rounded text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              className
            )}
          />
        }
      >
        <Globe aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        {zones
          .map((zone) =>
            t("calendar.zone.tooltip", {
              zone,
              time: formatInZone(now, zone, language, { hour: "2-digit", minute: "2-digit" }),
            })
          )
          .join(" · ")}
      </TooltipContent>
    </Tooltip>
  )
}

/** Situação em botões à vista, com a conta do período: quem falta marcar salta aos olhos. */
export function SituationChips({
  counts,
  total,
  value,
  onChange,
  className,
}: {
  counts: Record<Situation, number>
  total: number
  value: Situation[]
  onChange: (value: Situation[]) => void
  className?: string
}) {
  const { t } = useTranslation()
  const chip = (
    key: string,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-9",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )

  return (
    <div
      role="group"
      aria-label={t("calendar.filters.situation")}
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]",
        className
      )}
    >
      {chip("all", t("calendar.situation.all"), total, value.length === 0, () => onChange([]))}
      {SITUATIONS.map((situation) =>
        chip(
          situation,
          t(`calendar.situation.${situation}`),
          counts[situation],
          value.includes(situation),
          () =>
            onChange(
              value.includes(situation)
                ? value.filter((item) => item !== situation)
                : [...value, situation]
            )
        )
      )}
    </div>
  )
}

export function CalendarFiltersButton({
  options,
  filters,
  selectedCalendarIds,
  activeCount,
  onChange,
  onClear,
  situationCounts,
  showSituation = false,
  iconOnly = false,
}: {
  options: CalendarFilterOptions | undefined
  filters: CalendarScreenFilters
  selectedCalendarIds: string[]
  activeCount: number
  onChange: (name: "professionals" | "services" | "tags" | "situations", values: string[]) => void
  onClear: () => void
  situationCounts?: Record<Situation, number>
  /** No celular a situação entra aqui, porque os botões à vista não cabem. */
  showSituation?: boolean
  iconOnly?: boolean
}) {
  const { t } = useTranslation()

  const professionalOptions = useMemo<FacetOption[]>(
    () =>
      (options?.professionals ?? [])
        .filter((item) => selectedCalendarIds.includes(item.calendarId))
        .map((item) => ({ value: item.id, label: item.name })),
    [options?.professionals, selectedCalendarIds]
  )
  const serviceOptions = useMemo<FacetOption[]>(
    () =>
      (options?.services ?? [])
        .filter((item) => selectedCalendarIds.includes(item.calendarId))
        .map((item) => ({ value: item.id, label: item.name })),
    [options?.services, selectedCalendarIds]
  )
  const tagOptions = useMemo<FacetOption[]>(
    () =>
      (options?.tags ?? []).map((tag) => ({
        value: tag.id,
        label: tag.name,
        icon: (
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={tag.color ? { backgroundColor: getTagStyle(tag.color).backgroundColor } : undefined}
          />
        ),
      })),
    [options?.tags]
  )

  return (
    <FilterPopover
      activeCount={activeCount}
      onClear={onClear}
      iconOnly={iconOnly}
      label={t("calendar.filters.title")}
      align="end"
    >
      {showSituation ? (
        <FacetedFilter
          title={t("calendar.filters.situation")}
          options={SITUATIONS.map((situation) => ({
            value: situation,
            label: t(`calendar.situation.${situation}`),
            count: situationCounts?.[situation],
          }))}
          value={filters.situations}
          onChange={(values) => onChange("situations", values)}
        />
      ) : null}
      <FacetedFilter
        title={t("calendar.filters.professional")}
        options={professionalOptions}
        value={filters.professionalIds}
        onChange={(values) => onChange("professionals", values)}
      />
      <FacetedFilter
        title={t("calendar.filters.service")}
        options={serviceOptions}
        value={filters.serviceIds}
        onChange={(values) => onChange("services", values)}
      />
      <FacetedFilter
        title={t("calendar.filters.tag")}
        options={tagOptions}
        value={filters.tagIds}
        onChange={(values) => onChange("tags", values)}
      />
      <p className="px-3 py-2 text-xs text-pretty text-muted-foreground">
        {t("calendar.filters.classesHint")}
      </p>
    </FilterPopover>
  )
}

/** No celular e no tablet, o mês, os calendários e o resumo ficam atrás deste botão. */
export function SidebarToggle({ onClick, activeCount }: { onClick: () => void; activeCount: number }) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative shrink-0 pointer-coarse:size-10"
      aria-label={t("calendar.toolbar.openSidebar")}
      onClick={onClick}
    >
      <PanelLeft />
      {activeCount > 0 ? (
        <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[0.625rem] tabular-nums">
          {activeCount}
        </Badge>
      ) : null}
    </Button>
  )
}
