import { useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"

import type { DashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { parseDay } from "@/hooks/insights/use-dashboard-period"
import { toDateInputValue } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { CardEmpty, ChartCard } from "./chart-card"
import { weekdayName } from "./format"
import type { DashboardReport } from "./types"

// Horários de pico: dia da semana por hora. A origem tinha uma linha por data, o que em 90 dias vira
// 90 linhas e não responde "quando é mais cheio". Aqui, a média de cada dia da semana no período: um
// mês com cinco sextas não faz a sexta parecer mais cheia do que é.

/** Segunda primeiro: a semana de quem atende, com o fim de semana no fim. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const STEPS = 6
/** Quantas horas o mapa mostra, no mínimo, para um dia calmo não virar uma coluna só. */
const MIN_HOURS = 8

type HeatGrid = {
  rows: { weekday: number; occurrences: number; cells: number[] }[]
  hours: number[]
  max: number
  peak: { weekday: number; hour: number; value: number } | null
}

function buildGrid(report: DashboardReport, period: DashboardPeriod): HeatGrid {
  const occurrences = new Array<number>(7).fill(0)
  const start = parseDay(period.dateStart)
  const end = parseDay(period.dateEnd)
  if (start && end) {
    const today = new Date()
    const last = end < today ? end : today
    const firstWithData = report.heatMap[0] ? parseDay(report.heatMap[0].date) : null
    const first = firstWithData && firstWithData > start ? firstWithData : start
    for (const cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
      occurrences[cursor.getDay()] += 1
    }
    // O dia de hoje conta mesmo sem mensagem ainda: é um dia que o período tem.
    void toDateInputValue
  }

  const totals = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  let firstHour = 24
  let lastHour = -1
  for (const day of report.heatMap) {
    const date = parseDay(day.date)
    if (!date) continue
    for (const event of day.events) {
      if (event.hour < 0 || event.hour > 23) continue
      totals[date.getDay()][event.hour] += event.count
      if (event.count > 0) {
        firstHour = Math.min(firstHour, event.hour)
        lastHour = Math.max(lastHour, event.hour)
      }
    }
  }

  if (lastHour < 0) return { rows: [], hours: [], max: 0, peak: null }

  // Sem as madrugadas vazias: as colunas ficam mais largas, e o toque acerta a célula em 390 px.
  while (lastHour - firstHour + 1 < MIN_HOURS) {
    if (firstHour > 0) firstHour -= 1
    if (lastHour - firstHour + 1 < MIN_HOURS && lastHour < 23) lastHour += 1
  }
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index)

  let max = 0
  let peak: HeatGrid["peak"] = null
  const rows = WEEKDAY_ORDER.filter((weekday) => occurrences[weekday] > 0).map((weekday) => {
    const cells = hours.map((hour) => {
      const value = totals[weekday][hour] / occurrences[weekday]
      if (value > max) {
        max = value
        peak = { weekday, hour, value }
      }
      return value
    })
    return { weekday, occurrences: occurrences[weekday], cells }
  })

  return { rows, hours, max, peak }
}

function cellStep(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.max(1, Math.ceil((value / max) * STEPS))
}

export function HeatMapCard({
  report,
  period,
  className,
}: {
  report: DashboardReport
  period: DashboardPeriod
  className?: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const grid = useMemo(() => buildGrid(report, period), [period, report])
  const gridRef = useRef<HTMLDivElement>(null)

  const [active, setActive] = useState<{ row: number; column: number } | null>(null)
  // A célula que entra no Tab: roving, senão seriam 168 paradas de teclado.
  const [cursor, setCursor] = useState({ row: 0, column: 0 })

  const describe = (weekday: number, hour: number, value: number, occurrences: number) => {
    const day = weekdayName(weekday, language, "long")
    const hourLabel = t("dashboard.hour", { hour })
    const rounded = Math.round(value)
    return occurrences > 1
      ? t("dashboard.heat.cellAverage", {
          day,
          hour: hourLabel,
          count: rounded,
          value: formatNumber(rounded, language),
        })
      : t("dashboard.heat.cell", {
          day,
          hour: hourLabel,
          count: rounded,
          value: formatNumber(rounded, language),
        })
  }

  const empty = grid.rows.length === 0
  const peak = grid.peak as HeatGrid["peak"]

  const readout = (() => {
    if (active && grid.rows[active.row]) {
      const row = grid.rows[active.row]
      return describe(row.weekday, grid.hours[active.column], row.cells[active.column], row.occurrences)
    }
    if (!peak) return null
    return t("dashboard.heat.peak", {
      day: weekdayName(peak.weekday, language, "long"),
      hour: t("dashboard.hour", { hour: peak.hour }),
    })
  })()

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const row = Math.min(grid.rows.length - 1, Math.max(0, cursor.row + move[0]))
    const column = Math.min(grid.hours.length - 1, Math.max(0, cursor.column + move[1]))
    setCursor({ row, column })
    setActive({ row, column })
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${row}-${column}"]`)?.focus()
  }

  return (
    <ChartCard
      title={t("dashboard.heat.title")}
      description={t("dashboard.heat.description")}
      className={className}
      summary={readout ?? undefined}
      table={
        empty
          ? undefined
          : {
              columns: [
                { key: "day", label: t("dashboard.table.weekday") },
                ...grid.hours.map((hour) => ({
                  key: String(hour),
                  label: t("dashboard.hour", { hour }),
                  align: "right" as const,
                })),
              ],
              rows: grid.rows.map((row) => ({
                id: String(row.weekday),
                cells: {
                  day: weekdayName(row.weekday, language),
                  ...Object.fromEntries(
                    row.cells.map((value, index) => [
                      String(grid.hours[index]),
                      formatNumber(Math.round(value), language),
                    ])
                  ),
                },
              })),
            }
      }
    >
      {empty ? (
        <CardEmpty title={t("dashboard.heat.emptyTitle")} description={t("dashboard.heat.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-3">
          <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
            {readout}
          </p>
          <div
            ref={gridRef}
            role="grid"
            aria-label={t("dashboard.heat.title")}
            onKeyDown={moveFocus}
            onPointerLeave={() => setActive(null)}
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `max-content repeat(${grid.hours.length}, minmax(0, 1fr))` }}
          >
            <div role="row" className="contents">
              <span role="columnheader" aria-hidden />
              {grid.hours.map((hour) => (
                <span
                  key={hour}
                  role="columnheader"
                  aria-label={t("dashboard.hour", { hour })}
                  className="overflow-visible text-[11px] whitespace-nowrap text-muted-foreground"
                >
                  {hour % 3 === 0 ? t("dashboard.hour", { hour }) : null}
                </span>
              ))}
            </div>
            {grid.rows.map((row, rowIndex) => (
              <div key={row.weekday} role="row" className="contents">
                <span
                  role="rowheader"
                  className="flex items-center pr-2 text-[11px] text-muted-foreground capitalize"
                >
                  {weekdayName(row.weekday, language)}
                </span>
                {row.cells.map((value, column) => {
                  const step = cellStep(value, grid.max)
                  const isActive = active?.row === rowIndex && active.column === column
                  return (
                    <div
                      key={column}
                      role="gridcell"
                      data-cell={`${rowIndex}-${column}`}
                      tabIndex={cursor.row === rowIndex && cursor.column === column ? 0 : -1}
                      aria-label={describe(row.weekday, grid.hours[column], value, row.occurrences)}
                      onPointerEnter={() => setActive({ row: rowIndex, column })}
                      onPointerDown={() => {
                        setActive({ row: rowIndex, column })
                        setCursor({ row: rowIndex, column })
                      }}
                      onFocus={() => setActive({ row: rowIndex, column })}
                      onBlur={() => setActive(null)}
                      className={cn(
                        "h-6 min-w-0 rounded-[3px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring md:h-7",
                        isActive && "ring-2 ring-foreground/40"
                      )}
                      style={{
                        backgroundColor: step === 0 ? "var(--viz-track)" : `var(--viz-heat-${step})`,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div aria-hidden className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <span className="mr-1">{t("dashboard.heat.less")}</span>
            {Array.from({ length: STEPS }, (_, index) => (
              <span
                key={index}
                className="size-3 rounded-[2px]"
                style={{ backgroundColor: `var(--viz-heat-${index + 1})` }}
              />
            ))}
            <span className="ml-1">{t("dashboard.heat.more")}</span>
          </div>
        </div>
      )}
    </ChartCard>
  )
}
