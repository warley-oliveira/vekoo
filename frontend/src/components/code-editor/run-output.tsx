import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { StatusBadge } from "@/components/shared"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

import type { CodeRunResult, ScriptEvent } from "./types"

// O que aconteceu na última execução: o retorno, ou o erro, e cada chamada que o script fez. Passar o mouse numa
// chamada grifa a linha do código. É genérico: a origem do resultado é de quem usa o editor.

function pretty(value: unknown): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function RunOutput({
  result,
  running,
  onLineHover,
}: {
  result?: CodeRunResult | null
  running?: boolean
  onLineHover?: (line: number | null) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  if (running) {
    return (
      <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {t("flows.codeEditor.running")}
      </p>
    )
  }
  if (!result) return null

  const events = result.events ?? []
  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center gap-2">
        {result.status === "failed" ? (
          <StatusBadge tone="danger">{t("flows.codeEditor.resultFailed")}</StatusBadge>
        ) : result.status === "pending" ? (
          <StatusBadge tone="warning">{t("flows.codeEditor.resultPending")}</StatusBadge>
        ) : (
          <StatusBadge tone="success">{t("flows.codeEditor.resultDone")}</StatusBadge>
        )}
        {result.durationMs != null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("flows.codeEditor.duration", { value: formatNumber(result.durationMs, language) })}
          </span>
        ) : null}
      </div>

      {result.status === "pending" ? <p className="text-xs text-muted-foreground">{t("flows.codeEditor.pendingHint")}</p> : null}

      {result.error ? (
        <pre className="overflow-x-auto rounded-md bg-status-danger-soft p-2 font-mono text-xs whitespace-pre-wrap text-status-danger">
          {result.error}
        </pre>
      ) : null}

      {result.response !== undefined && result.status === "done" ? (
        <div>
          <p className="mb-1 text-xs font-medium">{t("flows.codeEditor.response")}</p>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
            {pretty(result.response) || t("flows.codeEditor.noResponse")}
          </pre>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium">{t("flows.codeEditor.calls", { count: events.length })}</p>
          <ul className="flex flex-col gap-0.5">
            {events.map((event, index) => (
              <EventRow key={index} event={event} onLineHover={onLineHover} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function EventRow({ event, onLineHover }: { event: ScriptEvent; onLineHover?: (line: number | null) => void }) {
  const { t } = useTranslation()
  const text = pretty(event.name === "console_log" ? event.output : (event.input ?? event.output))
  return (
    <li
      onMouseEnter={() => onLineHover?.(event.caller_line ?? null)}
      onMouseLeave={() => onLineHover?.(null)}
      className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-muted"
    >
      <code className="shrink-0 font-mono text-[11px] text-foreground/80">{event.name}</code>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{text}</span>
      {event.caller_line ? (
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {t("flows.codeEditor.line", { line: event.caller_line })}
        </span>
      ) : null}
    </li>
  )
}
