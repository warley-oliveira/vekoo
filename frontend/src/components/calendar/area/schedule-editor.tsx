import { useState } from "react"
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Copy, Plus, X } from "lucide-react"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useIsTouch } from "@/hooks/use-media-query"
import type { ScheduleDay, TimeWindow } from "@/lib/calendar/types"
import { capitalizeFirstLetter } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  WEEK_ORDER,
  copyDay,
  dayProblem,
  formatClock,
  fromMinutes,
  isValidTime,
  nextWindow,
  toMinutes,
  weekdayName,
} from "./week-schedule"

export type ScheduleEditorProps = {
  /** Os sete dias, de `normalizeWeek`. */
  value: ScheduleDay[]
  onChange: (days: ScheduleDay[]) => void
  /** O colaborador "atende"; a turma "tem aula", e nela a faixa pode não ter fim. */
  variant: "professional" | "classGroup"
  /** Só na turma: o fim de quem não tem fim. */
  defaultDuration?: number | null
  /** Depois de tentar salvar, aparece todo erro, mesmo o de um dia que ninguém tocou. */
  showAllErrors?: boolean
}

/** Sem isto a pessoa cairia num dia ligado e sem faixa, que a API recusa. */
const FIRST_WINDOW: Record<ScheduleEditorProps["variant"], TimeWindow> = {
  professional: { start: "09:00", end: "18:00" },
  classGroup: { start: "09:00", end: null },
}
/** Quanto dura a faixa nova de um colaborador. Na turma, é a duração padrão. */
const NEW_WINDOW_MINUTES = 240

/**
 * Os horários da semana, de colaborador e de turma: várias faixas por dia, dia ligado e desligado,
 * e copiar um dia para os outros. Desligar só esconde as faixas, para ligar de novo não apagar o
 * que foi digitado; quem as tira de vez é o envio, com `weekForApi`.
 */
export function ScheduleEditor({
  value,
  onChange,
  variant,
  defaultDuration,
  showAllErrors = false,
}: ScheduleEditorProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const isTouch = useIsTouch()
  // O erro espera a pessoa sair do dia: ela muda o início e o fim em sequência, e não pode levar
  // uma bronca entre um campo e outro.
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set())
  // Quem pede mais uma faixa quer digitar nela. Com dedo, abrir o seletor sozinho atrapalha.
  const [newWindowKey, setNewWindowKey] = useState<string | null>(null)

  const endOptional = variant === "classGroup"
  const rules = { endOptional, defaultDuration }

  const updateDay = (dayOfWeek: number, update: (day: ScheduleDay) => ScheduleDay) =>
    onChange(value.map((day) => (day.dayOfWeek === dayOfWeek ? update(day) : day)))

  const updateWindow = (dayOfWeek: number, index: number, patch: Partial<TimeWindow>) =>
    updateDay(dayOfWeek, (day) => ({
      ...day,
      windows: day.windows.map((window, position) =>
        position === index ? { ...window, ...patch } : window
      ),
    }))

  const addWindow = (day: ScheduleDay) => {
    updateDay(day.dayOfWeek, (current) => ({
      ...current,
      windows: [
        ...current.windows,
        nextWindow(current.windows, {
          duration: endOptional ? defaultDuration || 60 : NEW_WINDOW_MINUTES,
          openEnded: endOptional,
        }),
      ],
    }))
    if (!isTouch) setNewWindowKey(`${day.dayOfWeek}-${day.windows.length}`)
  }

  const removeWindow = (dayOfWeek: number, index: number) =>
    updateDay(dayOfWeek, (day) => ({
      ...day,
      windows: day.windows.filter((_, position) => position !== index),
    }))

  const toggleDay = (dayOfWeek: number, enabled: boolean) =>
    updateDay(dayOfWeek, (day) => ({
      ...day,
      enabled,
      windows: enabled && day.windows.length === 0 ? [{ ...FIRST_WINDOW[variant] }] : day.windows,
    }))

  return (
    <ul className="flex flex-col divide-y">
      {WEEK_ORDER.map((dayOfWeek) => {
        const day = value.find((item) => item.dayOfWeek === dayOfWeek)
        if (!day) return null

        const dayName = capitalizeFirstLetter(weekdayName(dayOfWeek, language))
        const problem = dayProblem(day, rules)
        const showProblem = Boolean(problem) && (showAllErrors || touched.has(dayOfWeek))

        return (
          // No celular, dia e ações numa linha e os horários embaixo; a partir de `sm`, um dia por linha.
          <li
            key={dayOfWeek}
            role="group"
            aria-label={dayName}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]"
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              setTouched((current) => new Set(current).add(dayOfWeek))
            }}
          >
            <label className="flex min-h-8 min-w-0 cursor-pointer items-center gap-3 pointer-coarse:min-h-10">
              <Switch
                checked={day.enabled}
                onCheckedChange={(checked) => toggleDay(dayOfWeek, checked)}
              />
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  !day.enabled && "text-muted-foreground"
                )}
              >
                {dayName}
              </span>
            </label>

            {day.enabled ? (
              <div className="order-last col-span-2 flex flex-col gap-2 sm:order-none sm:col-span-1">
                <AnimatePresence initial={false} mode="popLayout">
                  {day.windows.map((window, index) => {
                    const invalid = showProblem && Boolean(problem?.windows.includes(index))
                    const autoEnd =
                      endOptional && !window.end && isValidTime(window.start) && defaultDuration
                        ? fromMinutes(toMinutes(window.start) + defaultDuration)
                        : null

                    return (
                      <motion.div
                        key={index}
                        {...preset.listItem}
                        className="flex flex-col gap-1"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            step={60}
                            value={window.start}
                            autoFocus={newWindowKey === `${dayOfWeek}-${index}`}
                            aria-label={t("calendar.schedule.startOf", { day: dayName })}
                            aria-invalid={invalid}
                            className="w-0 min-w-0 flex-1 tabular-nums"
                            onChange={(event) =>
                              updateWindow(dayOfWeek, index, { start: event.target.value })
                            }
                          />
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t("calendar.schedule.until")}
                          </span>
                          <Input
                            type="time"
                            step={60}
                            value={window.end ?? ""}
                            aria-label={t("calendar.schedule.endOf", { day: dayName })}
                            aria-invalid={invalid}
                            className="w-0 min-w-0 flex-1 tabular-nums"
                            onChange={(event) =>
                              updateWindow(dayOfWeek, index, { end: event.target.value || null })
                            }
                          />
                          {/* O último horário não sai: dia sem horário se resolve desligando o dia. */}
                          {day.windows.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("calendar.schedule.removeWindow", {
                                day: dayName,
                                time: formatClock(window.start, language),
                              })}
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeWindow(dayOfWeek, index)}
                            >
                              <X />
                            </Button>
                          ) : (
                            <span aria-hidden className="size-7 shrink-0" />
                          )}
                        </div>
                        {autoEnd ? (
                          <p className="text-xs text-muted-foreground">
                            {t("calendar.schedule.endsByDuration", {
                              time: formatClock(autoEnd, language),
                            })}
                          </p>
                        ) : null}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>

                {showProblem && problem ? (
                  <p role="alert" className="text-xs leading-snug text-destructive">
                    {t(`calendar.schedule.errors.${problem.code}`)}
                  </p>
                ) : null}
              </div>
            ) : (
              <span className="flex min-h-8 items-center text-xs text-muted-foreground pointer-coarse:min-h-10 sm:col-span-2">
                {t(`calendar.schedule.off.${variant}`)}
              </span>
            )}

            {day.enabled ? (
              <div className="flex shrink-0 items-start gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("calendar.schedule.addWindowOf", { day: dayName })}
                  className="h-8 text-muted-foreground pointer-coarse:h-10"
                  onClick={() => addWindow(day)}
                >
                  <Plus />
                  {t("calendar.schedule.addWindow")}
                </Button>
                <CopyDayButton
                  dayName={dayName}
                  dayOfWeek={dayOfWeek}
                  onCopy={(targets) => onChange(copyDay(value, dayOfWeek, targets))}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function CopyDayButton({
  dayName,
  dayOfWeek,
  onCopy,
}: {
  dayName: string
  dayOfWeek: number
  onCopy: (targets: number[]) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<number[]>([])

  const others = WEEK_ORDER.filter((day) => day !== dayOfWeek)
  const workdays = others.filter((day) => day >= 1 && day <= 5)
  const allChosen = targets.length === others.length

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setTargets([])
      }}
      title={t("calendar.schedule.copy.title", { day: dayName })}
      showTitle
      align="end"
      className="w-64 gap-3 p-3"
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("calendar.schedule.copy.action", { day: dayName })}
          className="h-8 text-muted-foreground pointer-coarse:h-10"
        >
          <Copy />
          {t("calendar.schedule.copy.short")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          {others.map((day) => (
            <label
              key={day}
              className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-1 text-sm hover:bg-muted/50 pointer-coarse:min-h-10"
            >
              <Checkbox
                className="border-muted-foreground/40"
                checked={targets.includes(day)}
                onCheckedChange={(checked) =>
                  setTargets((current) =>
                    checked ? [...current, day] : current.filter((item) => item !== day)
                  )
                }
              />
              {capitalizeFirstLetter(weekdayName(day, language))}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={() => setTargets(allChosen ? [] : [...others])}
          >
            {allChosen ? t("calendar.schedule.copy.none") : t("calendar.schedule.copy.all")}
          </Button>
          {workdays.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground pointer-coarse:h-10"
              onClick={() => setTargets([...workdays])}
            >
              {t("calendar.schedule.copy.workdays")}
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          disabled={targets.length === 0}
          className="pointer-coarse:h-10"
          onClick={() => {
            onCopy(targets)
            setOpen(false)
          }}
        >
          {t("calendar.schedule.copy.apply", { count: targets.length })}
        </Button>
      </div>
    </ResponsivePopover>
  )
}

type ScheduleFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> = {
  control: Control<TValues, any, any>
  name: TName
} & Pick<ScheduleEditorProps, "variant" | "defaultDuration">

/**
 * `ScheduleEditor` em formulário. O erro de cada dia é calculado ali mesmo; o do formulário só
 * segura o envio e leva o foco para cá. A mensagem que aparece é a do servidor, que vem em `days`
 * ou `schedule` e não diz qual é o dia.
 */
export function ScheduleField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  control,
  name,
  variant,
  defaultDuration,
}: ScheduleFieldProps<TValues, TName>) {
  const { t } = useTranslation()
  const { field, fieldState, formState } = useController({ control, name })
  const serverError = fieldState.error?.type === "server" ? fieldState.error.message : undefined

  return (
    <div ref={field.ref} tabIndex={-1} className="flex flex-col gap-2 rounded-lg outline-none">
      <ScheduleEditor
        value={field.value as ScheduleDay[]}
        onChange={field.onChange}
        variant={variant}
        defaultDuration={defaultDuration}
        showAllErrors={formState.submitCount > 0}
      />
      {serverError ? (
        <p role="alert" className="text-xs leading-snug text-destructive">
          {t("calendar.schedule.errors.server", { message: serverError })}
        </p>
      ) : null}
    </div>
  )
}
