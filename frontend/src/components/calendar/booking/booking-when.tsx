import { useEffect, useMemo, useRef, useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react"

import { DateTimeField, SwitchInputRow } from "@/components/calendar/booking/when-parts"
import { Callout } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAvailability, useCalendarEvents } from "@/hooks/calendar/use-calendar-events"
import { eventHeadline, isCanceled } from "@/lib/calendar/event-status"
import {
  addDaysToKey,
  dayKeyOfLocal,
  formatDayKey,
  formatTimeRangeInZone,
  instantFromField,
  localDateOfDayKey,
  startOfDayInstant,
} from "@/lib/calendar/timezone"
import type { AgendaCalendar, AgendaService, BookingEvent, Professional } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { BookingFormValues } from "./booking-form"

const PRESETS = [30, 60, 90, 120]
const MINUTE = 60_000

function minutesBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null
  return Math.round((end.getTime() - start.getTime()) / MINUTE)
}

function sameDay(a: Date, b: Date): boolean {
  return dayKeyOfLocal(a) === dayKeyOfLocal(b)
}

function isAllDayRange(start: Date | null, end: Date | null): boolean {
  return Boolean(
    start &&
      end &&
      sameDay(start, end) &&
      start.getHours() === 0 &&
      start.getMinutes() === 0 &&
      end.getHours() === 23 &&
      end.getMinutes() >= 50
  )
}

function timeOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function withTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number)
  const next = new Date(date)
  next.setHours(hours || 0, minutes || 0, 0, 0)
  return next
}

function formatMinutes(minutes: number, language: string): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts: string[] = []
  if (hours) {
    parts.push(
      new Intl.NumberFormat(language, { style: "unit", unit: "hour", unitDisplay: "narrow" }).format(hours)
    )
  }
  if (rest || !hours) {
    parts.push(
      new Intl.NumberFormat(language, { style: "unit", unit: "minute", unitDisplay: "short" }).format(rest)
    )
  }
  return parts.join(" ")
}

/**
 * Quando: dia e hora, duração em um toque, dia inteiro, e os horários livres do serviço. O campo
 * trabalha em hora de parede: mudar de calendário mantém "14:00", e o fuso só entra ao salvar.
 */
export function BookingWhen({
  form,
  calendar,
  service,
  professional,
  event,
  resolvedProfessional,
}: {
  form: UseFormReturn<BookingFormValues>
  calendar: AgendaCalendar | null
  service: AgendaService | null
  professional: Professional | null
  event: BookingEvent | null
  resolvedProfessional: { current: string | null }
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const start = useWatch({ control: form.control, name: "start" })
  const end = useWatch({ control: form.control, name: "end" })
  const duration = minutesBetween(start, end)
  const allDay = isAllDayRange(start, end)

  const durationOptions = useMemo(() => {
    const values = new Set(PRESETS)
    if (service?.duration) values.add(service.duration)
    return [...values].sort((a, b) => a - b)
  }, [service?.duration])

  // "Outro" é escolha da pessoa. Se a duração não bate com nenhuma opção, ele já abre sozinho.
  const [customWanted, setCustomWanted] = useState(false)
  const isCustom =
    !allDay &&
    (customWanted ||
      duration === null ||
      !durationOptions.includes(duration) ||
      Boolean(start && end && !sameDay(start, end)))

  /* ---------- quando o início muda, o fim acompanha ---------- */

  const lastStart = useRef(start)
  useEffect(() => {
    const previous = lastStart.current
    lastStart.current = start
    if (!start || !previous || start.getTime() === previous.getTime()) return
    const current = form.getValues("end")
    if (!current) return

    if (isAllDayRange(previous, current)) {
      // Trocou o dia de um evento de dia inteiro: continua sendo o dia inteiro.
      form.setValue("end", withTime(start, "23:50"), { shouldDirty: true })
      return
    }
    const previousLength = current.getTime() - previous.getTime()
    if (!isCustom || current <= start) {
      const length = isCustom ? 30 * MINUTE : previousLength
      form.setValue("end", new Date(start.getTime() + length), {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      })
    }
  }, [form, isCustom, start])

  /* ---------- serviço escolhido: a duração vem dele ---------- */

  const lastService = useRef(service?.id ?? null)
  useEffect(() => {
    const id = service?.id ?? null
    if (id === lastService.current) return
    lastService.current = id
    const current = form.getValues("start")
    if (!service || !current) return
    setCustomWanted(false)
    form.setValue("end", new Date(current.getTime() + service.duration * MINUTE), {
      shouldDirty: true,
    })
  }, [form, service])

  function pickDuration(minutes: number) {
    if (!start) return
    setCustomWanted(false)
    form.setValue("end", new Date(start.getTime() + minutes * MINUTE), {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    })
  }

  const savedTimes = useRef<{ start: string; end: string } | null>(null)
  function toggleAllDay(next: boolean) {
    if (!start) return
    if (next) {
      if (end) savedTimes.current = { start: timeOf(start), end: timeOf(end) }
      lastStart.current = withTime(start, "00:00")
      form.setValue("start", lastStart.current, { shouldDirty: true })
      form.setValue("end", withTime(start, "23:50"), { shouldDirty: true })
      return
    }
    const times = savedTimes.current ?? { start: "09:00", end: "09:30" }
    const nextStart = withTime(start, times.start)
    const nextEnd = withTime(start, times.end)
    lastStart.current = nextStart
    form.setValue("start", nextStart, { shouldDirty: true })
    form.setValue(
      "end",
      nextEnd > nextStart ? nextEnd : new Date(nextStart.getTime() + 30 * MINUTE),
      { shouldDirty: true }
    )
  }

  /** Um horário livre: o início vai para ele, e a duração continua a mesma. */
  function pickSlot(dayKey: string, time: string) {
    const nextStart = withTime(localDateOfDayKey(dayKey), time)
    const length = service ? service.duration * MINUTE : (duration ?? 30) * MINUTE
    lastStart.current = nextStart
    form.setValue("start", nextStart, { shouldDirty: true, shouldValidate: true })
    form.setValue("end", new Date(nextStart.getTime() + length), {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {allDay ? null : (
        <DateTimeField control={form.control} name="start" label={t("calendar.booking.fields.start")} />
      )}

      {allDay ? (
        <DateTimeField
          control={form.control}
          name="start"
          label={t("calendar.booking.fields.day")}
          dateOnly
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span id="booking-duration" className="text-sm font-medium">
            {t("calendar.booking.fields.duration")}
          </span>
          <div role="group" aria-labelledby="booking-duration" className="flex flex-wrap gap-1.5">
            {durationOptions.map((minutes) => (
              <Button
                key={minutes}
                type="button"
                size="sm"
                variant={!isCustom && duration === minutes ? "secondary" : "outline"}
                aria-pressed={!isCustom && duration === minutes}
                className={cn(
                  "tabular-nums pointer-coarse:h-10",
                  !isCustom && duration === minutes && "ring-1 ring-primary"
                )}
                onClick={() => pickDuration(minutes)}
              >
                {formatMinutes(minutes, language)}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={isCustom ? "secondary" : "outline"}
              aria-pressed={isCustom}
              className={cn("pointer-coarse:h-10", isCustom && "ring-1 ring-primary")}
              onClick={() => setCustomWanted(true)}
            >
              {t("calendar.booking.fields.durationOther")}
            </Button>
          </div>
        </div>
      )}

      {isCustom ? (
        <DateTimeField
          control={form.control}
          name="end"
          label={t("calendar.booking.fields.end")}
          min={start ?? undefined}
        />
      ) : null}

      <SwitchInputRow
        label={t("calendar.booking.fields.allDay")}
        checked={allDay}
        onChange={toggleAllDay}
      />

      {calendar && service && start && !allDay ? (
        <AvailableSlots
          calendar={calendar}
          service={service}
          professional={professional}
          event={event}
          start={start}
          duration={duration ?? service.duration}
          onPick={pickSlot}
          resolvedProfessional={resolvedProfessional}
        />
      ) : null}

      {calendar && start && end && !allDay ? (
        <ConflictNotice
          calendar={calendar}
          professionalId={professional?.id ?? resolvedProfessional.current}
          professionalName={professional?.name ?? null}
          event={event}
          start={start}
          end={end}
        />
      ) : null}
    </div>
  )
}

/** Os horários livres daquele dia, um toque para escolher. A agenda não recusa encaixe. */
function AvailableSlots({
  calendar,
  service,
  professional,
  event,
  start,
  duration,
  onPick,
  resolvedProfessional,
}: {
  calendar: AgendaCalendar
  service: AgendaService
  professional: Professional | null
  event: BookingEvent | null
  start: Date
  duration: number
  onPick: (dayKey: string, time: string) => void
  resolvedProfessional: { current: string | null }
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const dayKey = dayKeyOfLocal(start)
  const zone = calendar.timeZone

  const { availability, error, isLoading, reload } = useAvailability(calendar.id, {
    serviceId: service.id,
    professionalId: professional?.id,
    start: startOfDayInstant(dayKey, zone),
    end: startOfDayInstant(addDaysToKey(dayKey, 1), zone),
  })

  useEffect(() => {
    resolvedProfessional.current = professional ? null : (availability?.professionalId ?? null)
  }, [availability?.professionalId, professional, resolvedProfessional])

  if (error && !availability) {
    return (
      <Callout
        tone="neutral"
        action={
          <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={() => void reload()}>
            <RefreshCw />
            {t("calendar.common.retry")}
          </Button>
        }
      >
        {t("calendar.booking.slots.failed")}
      </Callout>
    )
  }

  if (isLoading && !availability) {
    return (
      <div aria-hidden className="flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-14" />
        ))}
      </div>
    )
  }
  if (!availability) return null

  const days = Object.keys(availability.slots).sort()
  const slots = availability.slots[dayKey] ?? []
  const firstOtherDay = availability.fallback ? days[0] : undefined
  const time = timeOf(start)
  const whoName = professional?.name ?? availability.professionalName
  const editingSameTime =
    event !== null &&
    instantFromField(start, zone) === event.start &&
    (professional?.id ?? null) === event.professionalId

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-medium">{t("calendar.booking.slots.title")}</span>
        {!professional && availability.professionalName ? (
          <span className="text-xs text-muted-foreground">
            {t("calendar.booking.slots.turnOf", { name: availability.professionalName })}
          </span>
        ) : null}
      </div>

      {slots.length > 0 ? (
        <div
          role="group"
          aria-label={t("calendar.booking.slots.title")}
          className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto py-0.5"
        >
          {slots.map((slot) => (
            <Button
              key={slot}
              type="button"
              size="sm"
              variant={slot === time ? "default" : "outline"}
              aria-pressed={slot === time}
              className="tabular-nums pointer-coarse:h-10"
              onClick={() => onPick(dayKey, slot)}
            >
              {slot}
            </Button>
          ))}
        </div>
      ) : firstOtherDay ? (
        <Callout
          icon={<CalendarClock aria-hidden className="size-4" />}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={() => onPick(firstOtherDay, availability.slots[firstOtherDay][0])}
            >
              {t("calendar.booking.slots.goTo", {
                date: formatDayKey(firstOtherDay, language, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                }),
              })}
            </Button>
          }
        >
          {t("calendar.booking.slots.noneThisDay")}
        </Callout>
      ) : (
        <p className="text-sm text-muted-foreground">{t("calendar.booking.slots.noneAtAll")}</p>
      )}

      {availability.priorityProfessionalName ? (
        <p className="text-xs text-muted-foreground">
          {t("calendar.booking.slots.priority", { name: availability.priorityProfessionalName })}
        </p>
      ) : null}

      {slots.length > 0 && !slots.includes(time) && !editingSameTime ? (
        <p className="flex items-start gap-1.5 text-xs text-status-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t("calendar.booking.slots.outside", {
            name: whoName ?? t("calendar.booking.slots.someone"),
            duration: formatMinutes(duration, language),
          })}
        </p>
      ) : null}
    </div>
  )
}

/** Outro compromisso do mesmo colaborador naquele horário. Avisa, sem impedir: encaixe é permitido. */
function ConflictNotice({
  calendar,
  professionalId,
  professionalName,
  event,
  start,
  end,
}: {
  calendar: AgendaCalendar
  professionalId: string | null
  professionalName: string | null
  event: BookingEvent | null
  start: Date
  end: Date
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const zone = calendar.timeZone
  const dayKey = dayKeyOfLocal(start)

  const range = useMemo(
    () =>
      professionalId
        ? {
            start: startOfDayInstant(dayKey, zone),
            end: startOfDayInstant(addDaysToKey(dayKey, 2), zone),
          }
        : null,
    [dayKey, professionalId, zone]
  )
  const filters = useMemo(
    () => ({
      calendarIds: [calendar.id],
      professionalIds: professionalId ? [professionalId] : [],
    }),
    [calendar.id, professionalId]
  )
  const { events } = useCalendarEvents(range, filters)

  const from = instantFromField(start, zone)
  const to = instantFromField(end, zone)
  const clash = (events ?? []).find(
    (item) =>
      item.type === "booking" &&
      item.id !== event?.id &&
      !isCanceled(item) &&
      item.professionalId === professionalId &&
      item.start < to &&
      Math.max(item.end, item.start + 1) > from
  )
  if (!clash) return null

  return (
    <Callout tone="warning" role="status" icon={<AlertTriangle aria-hidden className="size-4" />}>
      {t("calendar.booking.conflict", {
        name: professionalName ?? (clash as BookingEvent).professionalName ?? "",
        title: eventHeadline(clash).title,
        time: formatTimeRangeInZone(clash.start, clash.end, zone, language),
      })}
    </Callout>
  )
}
