import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router"

import { endOfDay, startOfDay, toDateInputValue } from "@/lib/date-format"

// O período do Dashboard mora na URL: a tela é compartilhável, e o atalho é relativo. Quem abre
// `?period=7d` amanhã vê os últimos 7 dias de amanhã; intervalo é fixo, em `?start=&end=`.

export const PERIOD_PRESETS = ["today", "7d", "15d", "30d", "month", "90d"] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

const DEFAULT_PRESET: PeriodPreset = "7d"
/** O que `GET /dashboard` aceita. Passar disso é `422 rangeTooLong`. */
export const MAX_RANGE_DAYS = 731

const DAY_MS = 24 * 60 * 60 * 1000

export type PeriodSlice = { dateStart: string; dateEnd: string; days: number }

export type DashboardPeriod = PeriodSlice & {
  /** `null` num intervalo escolhido à mão. */
  preset: PeriodPreset | null
  from: Date
  to: Date
  /** O mesmo tanto de dias, logo antes. `null` em "hoje": um dia pela metade contra um dia inteiro engana. */
  previous: PeriodSlice | null
  /** O rollup de hoje pode estar até uma hora atrasado, e a tela diz isso. */
  includesToday: boolean
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) + 1
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function presetRange(preset: PeriodPreset, now = new Date()): { from: Date; to: Date } {
  const to = endOfDay(now)
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to }
    case "7d":
      return { from: startOfDay(addDays(now, -6)), to }
    case "15d":
      return { from: startOfDay(addDays(now, -14)), to }
    case "30d":
      return { from: startOfDay(addDays(now, -29)), to }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to }
    case "90d":
      return { from: startOfDay(addDays(now, -89)), to }
  }
}

/** Dia da organização em texto, lido como data local: `new Date("2026-10-08")` seria UTC, e voltaria um dia. */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function buildPeriod(preset: PeriodPreset | null, from: Date, to: Date): DashboardPeriod {
  const days = daysBetween(from, to)
  const previousTo = addDays(from, -1)
  const previousFrom = addDays(previousTo, -(days - 1))

  return {
    preset,
    from,
    to,
    days,
    dateStart: toDateInputValue(from),
    dateEnd: toDateInputValue(to),
    previous:
      preset === "today"
        ? null
        : {
            dateStart: toDateInputValue(previousFrom),
            dateEnd: toDateInputValue(previousTo),
            days,
          },
    includesToday: startOfDay(to).getTime() >= startOfDay(new Date()).getTime(),
  }
}

function isPreset(value: string | null): value is PeriodPreset {
  return PERIOD_PRESETS.includes(value as PeriodPreset)
}

function samePeriod(range: { from: Date; to: Date }, preset: PeriodPreset): boolean {
  const known = presetRange(preset)
  return (
    toDateInputValue(range.from) === toDateInputValue(known.from) &&
    toDateInputValue(range.to) === toDateInputValue(known.to)
  )
}

export function useDashboardPeriod() {
  const [searchParams, setSearchParams] = useSearchParams()
  const presetParam = searchParams.get("period")
  const startParam = searchParams.get("start")
  const endParam = searchParams.get("end")

  const period = useMemo<DashboardPeriod>(() => {
    const start = startParam ? parseDay(startParam) : null
    const end = endParam ? parseDay(endParam) : null
    if (start && end && start <= end) {
      return buildPeriod(null, startOfDay(start), endOfDay(end))
    }
    const preset = isPreset(presetParam) ? presetParam : DEFAULT_PRESET
    const range = presetRange(preset)
    return buildPeriod(preset, range.from, range.to)
  }, [endParam, presetParam, startParam])

  const setPreset = useCallback(
    (preset: PeriodPreset) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete("start")
          next.delete("end")
          if (preset === DEFAULT_PRESET) next.delete("period")
          else next.set("period", preset)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  /** Um intervalo igual a um atalho vira o atalho, para o botão acender e o link seguir relativo. */
  const setRange = useCallback(
    (range: { from: Date; to: Date }) => {
      const matching = PERIOD_PRESETS.find((preset) => samePeriod(range, preset))
      if (matching) {
        setPreset(matching)
        return
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete("period")
          next.set("start", toDateInputValue(range.from))
          next.set("end", toDateInputValue(range.to))
          return next
        },
        { replace: true }
      )
    },
    [setPreset, setSearchParams]
  )

  return { period, setPreset, setRange }
}

/**
 * O período dos números que estão na tela. Na troca, o quadro anterior fica até o novo chegar, e a frase
 * "nos últimos 15 dias" não pode aparecer ao lado do total de 7.
 */
export function useShownPeriod(period: DashboardPeriod, isLoading: boolean): DashboardPeriod {
  const [shown, setShown] = useState(period)
  if (!isLoading && shown !== period) setShown(period)
  return isLoading ? shown : period
}

export function rangeDays(range: { from: Date; to: Date }): number {
  return daysBetween(range.from, range.to)
}
