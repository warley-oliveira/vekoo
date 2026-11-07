import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Check, Video, X } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { isCanceled, needsAttendance, occupancyTone } from "@/lib/calendar/event-status"
import type { AttendanceStatus, BookingEvent, CalendarEvent, ClassSessionEvent } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

/**
 * A situação em texto. O que ainda vai acontecer fica sem selo: num dia cheio, "pendente" em
 * todas as linhas futuras seria só ruído. O alerta aparece quando passou e ninguém marcou.
 */
export function EventSituationBadge({ event }: { event: CalendarEvent }) {
  const { t } = useTranslation()

  if (isCanceled(event)) {
    return <StatusBadge tone="neutral">{t("calendar.situation.canceled")}</StatusBadge>
  }
  if (event.type !== "booking") return null
  if (event.attendanceStatus === "show") {
    return <StatusBadge tone="success">{t("calendar.situation.show")}</StatusBadge>
  }
  if (event.attendanceStatus === "no_show") {
    return <StatusBadge tone="danger">{t("calendar.situation.no_show")}</StatusBadge>
  }
  if (needsAttendance(event)) {
    return <StatusBadge tone="warning">{t("calendar.event.needsAttendance")}</StatusBadge>
  }
  return null
}

/** O título com a cor do evento: é o elo entre o painel e o bloco que foi clicado. */
export function EventTitle({ color, children }: { color: string | null; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/** Link do Meet: abre em outra aba, sem abrir o detalhe de quem está em volta. */
export function MeetLink({ url, compact = false }: { url: string; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <Button
      variant="outline"
      size="xs"
      nativeButton={false}
      className="relative z-10 pointer-coarse:h-10"
      render={
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
        />
      }
    >
      <Video />
      {compact ? t("calendar.meet.short") : t("calendar.meet.join")}
    </Button>
  )
}

/** Marcar presença: repetir o que já está marcado desmarca. */
export function AttendanceToggle({
  event,
  onToggle,
  size = "icon",
  className,
}: {
  event: BookingEvent
  onToggle: (event: BookingEvent, status: AttendanceStatus) => void
  size?: "icon" | "labeled"
  className?: string
}) {
  const { t } = useTranslation()
  const options = [
    { status: "show" as const, Icon: Check, label: t("calendar.attendance.show") },
    { status: "no_show" as const, Icon: X, label: t("calendar.attendance.noShow") },
  ]

  return (
    <div role="group" aria-label={t("calendar.attendance.title")} className={cn("flex gap-1", className)}>
      {options.map(({ status, Icon, label }) => {
        const active = event.attendanceStatus === status
        return (
          <Button
            key={status}
            type="button"
            variant={active ? "secondary" : size === "icon" ? "ghost" : "outline"}
            size={size === "icon" ? "icon" : "default"}
            aria-pressed={active}
            aria-label={size === "icon" ? label : undefined}
            title={size === "icon" ? label : undefined}
            className={cn(
              "relative z-10 pointer-coarse:h-10",
              size === "icon" && "pointer-coarse:w-10",
              size === "labeled" && "flex-1",
              active && status === "show" && "bg-status-success-soft text-status-success hover:bg-status-success-soft",
              active && status === "no_show" && "bg-status-danger-soft text-status-danger hover:bg-status-danger-soft"
            )}
            onClick={(mouseEvent) => {
              mouseEvent.stopPropagation()
              onToggle(event, status)
            }}
          >
            <Icon />
            {size === "labeled" ? label : null}
          </Button>
        )
      })}
    </div>
  )
}

const OCCUPANCY_COLOR = {
  free: "bg-foreground/50",
  almost: "bg-status-warning",
  full: "bg-status-danger",
} as const

/** Vagas ocupadas da aula. Sem limite definido, não há o que mostrar. */
export function SessionOccupancy({
  count,
  max,
  className,
}: {
  count: number
  max: ClassSessionEvent["maxStudents"]
  className?: string
}) {
  const { t } = useTranslation()
  const tone = occupancyTone(count, max)
  if (!tone || !max) return null

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={t("calendar.session.occupancyLabel", { count, max })}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(count, max)}
        className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", OCCUPANCY_COLOR[tone])}
          style={{ width: `${Math.min(count / max, 1) * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {count}/{max}
      </span>
    </div>
  )
}
