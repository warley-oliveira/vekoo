import { useTranslation } from "react-i18next"
import { CalendarDays, ChevronDown, GraduationCap, Plus, Settings2, Users } from "lucide-react"
import { Link } from "@/lib/router"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AgendaCalendar } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

export type CalendarListProps = {
  calendars: AgendaCalendar[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onCreate: () => void
  className?: string
}

/** Os calendários da organização. A caixa decide o que aparece na grade; a engrenagem configura. */
export function CalendarList({
  calendars,
  isLoading,
  error,
  onRetry,
  selectedIds,
  onChange,
  onCreate,
  className,
}: CalendarListProps) {
  const { t } = useTranslation()

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id))
  }

  return (
    <Collapsible defaultOpen className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="group/collapse -ml-1 flex h-9 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left text-sm font-medium outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
            />
          }
        >
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/collapse:rotate-0 -rotate-90"
          />
          <span className="truncate">{t("calendar.sidebar.calendars")}</span>
        </CollapsibleTrigger>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("calendar.sidebar.createCalendar")}
                onClick={onCreate}
              />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent>{t("calendar.sidebar.createCalendar")}</TooltipContent>
        </Tooltip>
      </div>

      <CollapsibleContent>
        {error && !calendars ? (
          <div className="py-2 text-sm text-muted-foreground">
            <p>{t("calendar.sidebar.calendarsFailed")}</p>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 pointer-coarse:h-10"
              onClick={onRetry}
            >
              {t("calendar.common.retry")}
            </Button>
          </div>
        ) : isLoading && !calendars ? (
          <div aria-hidden className="space-y-2 py-1.5">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : (
          <ul className="flex flex-col pt-0.5">
            {(calendars ?? []).map((calendar) => (
              <CalendarRow
                key={calendar.id}
                calendar={calendar}
                checked={selectedIds.includes(calendar.id)}
                onToggle={(checked) => toggle(calendar.id, checked)}
              />
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function CalendarRow({
  calendar,
  checked,
  onToggle,
}: {
  calendar: AgendaCalendar
  checked: boolean
  onToggle: (checked: boolean) => void
}) {
  const { t } = useTranslation()
  const isClasses = calendar.calendarType === "class_group"
  const TypeIcon = isClasses ? GraduationCap : Users
  const inputId = `calendar-toggle-${calendar.id}`

  return (
    <li className="group/row -mx-1 flex items-center gap-1 rounded-md px-1 hover:bg-muted/60">
      <label
        htmlFor={inputId}
        className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-sm pointer-coarse:min-h-10"
      >
        <Checkbox
          id={inputId}
          checked={checked}
          onCheckedChange={(next) => onToggle(next === true)}
          style={
            calendar.color && checked
              ? { backgroundColor: calendar.color, borderColor: calendar.color }
              : undefined
          }
        />
        <span className={cn("truncate", !checked && "text-muted-foreground")}>{calendar.name}</span>
        <TypeIcon
          aria-label={t(isClasses ? "calendar.sidebar.typeClasses" : "calendar.sidebar.typeStaff")}
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      </label>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              aria-label={t("calendar.sidebar.calendarSettings", { name: calendar.name })}
              className="shrink-0 text-muted-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
              render={<Link to={`/calendar/${calendar.id}/settings`} />}
            />
          }
        >
          <Settings2 />
        </TooltipTrigger>
        <TooltipContent>{t("calendar.sidebar.settings")}</TooltipContent>
      </Tooltip>
    </li>
  )
}

/** Primeira visita de quem ainda não tem calendário. */
export function NoCalendars({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarDays aria-hidden className="size-5" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-heading text-xl leading-snug font-medium">
          {t("calendar.empty.noCalendars.title")}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("calendar.empty.noCalendars.description")}
        </p>
      </div>
      <Button onClick={onCreate} className="pointer-coarse:h-10">
        <Plus />
        {t("calendar.empty.noCalendars.action")}
      </Button>
    </div>
  )
}
