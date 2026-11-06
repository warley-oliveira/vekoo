import { memo, useLayoutEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2 } from "lucide-react"

import { CopyButton, StatusBadge } from "@/components/shared"
import { useDayLabel } from "@/hooks/chat/use-day-label"
import { useCopilotStore } from "@/lib/chat-details/copilot-store"
import type {
  CopilotActivity,
  CopilotMessage,
  CopilotSegment,
} from "@/lib/chat-details/copilot-types"
import { formatTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { ActivityList } from "./copilot-activity"
import { CopilotMarkdown } from "./copilot-markdown"

/** Marca no fim do texto enquanto ele chega: vai junto com a última palavra, onde quer que ela caia. */
const STREAM_CARET = " ▍"

type Group =
  | { kind: "text"; content: string }
  | { kind: "activities"; activities: CopilotActivity[] }

/** Atividades seguidas ficam num bloco só, entre os trechos de texto. */
function groupSegments(segments: CopilotSegment[]): Group[] {
  const groups: Group[] = []
  for (const segment of segments) {
    if (segment.type === "text") {
      if (segment.content) groups.push({ kind: "text", content: segment.content })
      continue
    }
    const last = groups[groups.length - 1]
    if (last?.kind === "activities") last.activities.push(segment.activity)
    else groups.push({ kind: "activities", activities: [segment.activity] })
  }
  return groups
}

function SegmentsView({ segments, streaming = false }: { segments: CopilotSegment[]; streaming?: boolean }) {
  const groups = useMemo(() => groupSegments(segments), [segments])
  const lastText = groups.reduce((found, group, index) => (group.kind === "text" ? index : found), -1)

  return (
    <>
      {groups.map((group, index) =>
        group.kind === "activities" ? (
          <ActivityList key={index} activities={group.activities} />
        ) : (
          <CopilotMarkdown
            key={index}
            text={streaming && index === lastText ? group.content + STREAM_CARET : group.content}
          />
        )
      )}
    </>
  )
}

export const MessageView = memo(function MessageView({ message }: { message: CopilotMessage }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const time = formatTime(message.timestamp, language)

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-0.5 pl-8">
        <p className="max-w-full rounded-2xl rounded-br-sm bg-muted px-3 py-1.5 text-sm wrap-anywhere whitespace-pre-wrap">
          {message.content}
        </p>
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{time}</span>
      </div>
    )
  }

  const segments: CopilotSegment[] = message.contentSegments?.length
    ? message.contentSegments
    : [
        ...(message.toolActivities ?? []).map(
          (activity): CopilotSegment => ({ type: "activity", activity })
        ),
        { type: "text", content: message.content },
      ]
  const changes = message.changesApplied?.length ?? 0

  return (
    <div className="group/message flex flex-col gap-0.5">
      <SegmentsView segments={segments} />
      {changes > 0 ? (
        <StatusBadge
          tone="success"
          dot={false}
          icon={<CheckCircle2 className="size-3" />}
          className="mt-1 w-fit"
        >
          {t("chatDetails.copilot.changes", { count: changes })}
        </StatusBadge>
      ) : null}
      <div className="flex min-h-6 items-center gap-1">
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{time}</span>
        {message.content ? (
          <CopyButton
            value={message.content}
            size="icon-xs"
            className="text-muted-foreground opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100 pointer-coarse:size-10 pointer-coarse:opacity-100"
          />
        ) : null}
      </div>
    </div>
  )
})

function DayDivider({ day }: { day: number }) {
  const label = useDayLabel(day)

  return (
    <div className="flex items-center gap-2 py-1 text-[0.6875rem] text-muted-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  )
}

function startOfDay(at: number): number {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Uma lista de mensagens com o dia entre elas: a conversa guardada no navegador também passa aqui. */
export const MessageTimeline = memo(function MessageTimeline({
  messages,
}: {
  messages: CopilotMessage[]
}) {
  const items = useMemo(() => {
    let lastDay: number | null = null
    return messages.map((message) => {
      const day = startOfDay(message.timestamp)
      const showDay = day !== lastDay
      lastDay = day
      return { message, day, showDay }
    })
  }, [messages])

  return (
    <>
      {items.map(({ message, day, showDay }) => (
        <div key={message.id} className="flex flex-col gap-3">
          {showDay ? <DayDivider day={day} /> : null}
          <MessageView message={message} />
        </div>
      ))}
    </>
  )
})

/** "Pensando", sem spinner solto: o que falta chegar é texto. */
function Thinking() {
  const { t } = useTranslation()

  return (
    <p role="status" className="animate-pulse text-sm text-muted-foreground">
      {t("chatDetails.copilot.thinking")}
    </p>
  )
}

/**
 * A resposta em andamento. É o único pedaço que se desenha a cada trecho que chega: as mensagens
 * anteriores não mudam, e o `MessageView` delas fica como está.
 */
export const LiveTurn = memo(function LiveTurn({ onGrow }: { onGrow: () => void }) {
  const live = useCopilotStore((state) => state.live)

  useLayoutEffect(() => {
    onGrow()
  }, [live, onGrow])

  if (!live) return null

  const hasText = live.segments.some((segment) => segment.type === "text" && segment.content)
  const runningTool = live.segments.some(
    (segment) => segment.type === "activity" && segment.activity.status === "started"
  )

  return (
    <div className="flex flex-col gap-0.5" aria-live="polite" aria-busy="true">
      <SegmentsView segments={live.segments} streaming={hasText && !runningTool} />
      {!hasText || runningTool ? <Thinking /> : null}
    </div>
  )
})
