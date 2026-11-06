import { useSyncExternalStore } from "react"
import { useTranslation } from "react-i18next"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatFullDateTime, isValidDate, toDate, type DateInput } from "@/lib/date-format"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"

// Um relógio só para a tela inteira: uma lista com 500 datas não vira 500 timers.
const TICK = 60_000
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined
let minute = Date.now()

function subscribe(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => {
    minute = Date.now()
    listeners.forEach((notify) => notify())
  }, TICK)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export type RelativeTimeProps = {
  /** Milissegundos da API; `Date` e ISO também valem. Vazio mostra o traço. */
  value: DateInput | null | undefined
  className?: string
}

/** "há 3 horas", que se atualiza sozinho, com a data completa no tooltip. */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const now = useSyncExternalStore(subscribe, () => minute)

  const date = value === null || value === undefined ? null : toDate(value)
  if (!date || !isValidDate(date)) {
    return <span className={className}>{t("kit.noValue")}</span>
  }

  const full = formatFullDateTime(date, language)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time dateTime={date.toISOString()} aria-label={full} className={className} />
        }
      >
        {formatRelative(date.getTime(), language, Math.max(now, Date.now()))}
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  )
}
