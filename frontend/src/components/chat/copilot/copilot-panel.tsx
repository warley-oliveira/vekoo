import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Archive,
  CalendarDays,
  FileText,
  RotateCcw,
  Sparkles,
  Tag,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Callout, ListSkeleton, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { useCan } from "@/hooks/use-can"
import { useAuth } from "@/lib/auth"
import { chatDisplayName } from "@/lib/chat/chat-store"
import {
  connectCopilot,
  dismissCopilotError,
  retryCopilot,
  sendCopilotMessage,
  startNewCopilotConversation,
  useCopilotArchives,
  useCopilotStore,
} from "@/lib/chat-details/copilot-store"
import type { CopilotError } from "@/lib/chat-details/copilot-types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { CopilotArchives } from "./copilot-archives"
import { CopilotInput } from "./copilot-input"
import { LiveTurn, MessageTimeline } from "./copilot-messages"

const NAME_FIELDS = ["displayName", "userName", "externalId", "audienceType", "audienceUserName"] as const

const RETRIABLE = new Set<CopilotError["code"]>(["failed", "timeout", "empty"])

const NEAR_BOTTOM_PX = 80

type Suggestion = { icon: LucideIcon; text: string }

function Welcome({ chatId }: { chatId: string | null }) {
  const { t } = useTranslation()
  const canCalendar = useCan("calendar")
  const chat = useChatFields(chatId ?? "", NAME_FIELDS)
  const connected = useCopilotStore((state) => state.connected)

  const name = chat
    ? chatDisplayName(chat, {
        visitor: t("chat.contact.visitor"),
        contact: t("chat.contact.fallback"),
      })
    : null

  const suggestions: Suggestion[] = [
    ...(name
      ? [{ icon: FileText, text: t("chatDetails.copilot.suggest.summarize", { name }) }]
      : []),
    { icon: TrendingUp, text: t("chatDetails.copilot.suggest.hotLeads") },
    ...(canCalendar
      ? [{ icon: CalendarDays, text: t("chatDetails.copilot.suggest.todayBookings") }]
      : []),
    { icon: Tag, text: t("chatDetails.copilot.suggest.tags") },
  ]

  return (
    <div className="flex flex-1 flex-col justify-center gap-4 py-6">
      <div className="space-y-1.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Sparkles aria-hidden className="size-4" />
        </span>
        <h3 className="font-heading text-base font-semibold tracking-tight">
          {t("chatDetails.copilot.welcomeTitle")}
        </h3>
        <p className="text-sm text-pretty text-muted-foreground">
          {t("chatDetails.copilot.welcomeHint")}
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {suggestions.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Button
              type="button"
              variant="outline"
              disabled={!connected}
              className="h-auto min-h-8 w-full justify-start py-1.5 text-left font-normal whitespace-normal pointer-coarse:min-h-10"
              onClick={() => sendCopilotMessage(text)}
            >
              <Icon className="text-muted-foreground" />
              {text}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ErrorNotice = memo(function ErrorNotice() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const error = useCopilotStore((state) => state.error)
  const canRetry = useCopilotStore((state) => Boolean(state.failedText))

  if (!error) return null

  // A frase do servidor já vem no idioma da pessoa; as nossas saem da tradução.
  const message = error.message || t(`chatDetails.copilot.errors.${error.code}`)
  const retriable = RETRIABLE.has(error.code) && canRetry

  const retry = async () => {
    // A mensagem pode já ter enviado algo a um contato: repetir enviaria de novo.
    if (error.mayHaveActed) {
      const confirmed = await confirm({
        title: t("chatDetails.copilot.retryTitle"),
        description: t("chatDetails.copilot.retryHint"),
        confirmLabel: t("chatDetails.copilot.retryConfirm"),
      })
      if (!confirmed) return
    }
    retryCopilot()
  }

  return (
    <div className="shrink-0 px-3 pb-2">
      <Callout
        role="alert"
        tone="warning"
        icon={<TriangleAlert />}
        action={
          retriable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-coarse:h-10"
              onClick={() => void retry()}
            >
              {t("chatDetails.retry")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-10"
              onClick={dismissCopilotError}
            >
              {t("chatDetails.dismiss")}
            </Button>
          )
        }
      >
        {message}
      </Callout>
    </div>
  )
})

/** O histórico guardado. Só ele assina `messages`: o texto em andamento mora em `LiveTurn`. */
const Conversation = memo(function Conversation({ chatId }: { chatId: string | null }) {
  const messages = useCopilotStore((state) => state.messages)
  const loaded = useCopilotStore((state) => state.loaded)
  const hasLive = useCopilotStore((state) => Boolean(state.live))
  const scroller = useRef<HTMLDivElement>(null)
  // Só acompanha o fim quem já está no fim: ler uma resposta anterior não pode ser interrompido.
  const atBottom = useRef(true)

  const stick = useCallback(() => {
    const element = scroller.current
    if (element && atBottom.current) element.scrollTop = element.scrollHeight
  }, [])

  useEffect(stick, [messages, stick])

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const element = event.currentTarget
        atBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX
      }}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-3 pb-3"
    >
      {!loaded ? (
        <ListSkeleton rows={4} />
      ) : messages.length === 0 && !hasLive ? (
        <Welcome chatId={chatId} />
      ) : (
        <>
          <MessageTimeline messages={messages} />
          <LiveTurn onGrow={stick} />
        </>
      )}
    </div>
  )
})

/**
 * Conversar com o copiloto sobre o atendimento, sem sair da conversa aberta: ele busca, resume e age em
 * nome de quem pergunta, dentro do que essa pessoa pode ver. Quanto cada mensagem custa fica à vista,
 * e nada é repetido sem a pessoa pedir.
 */
export default function CopilotPanel({ chatId }: { chatId: string | null }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const accountId = useAuth().session?.account.id
  const [showArchives, setShowArchives] = useState(false)
  const hasMessages = useCopilotStore((state) => state.messages.length > 0)
  const busy = useCopilotStore((state) => Boolean(state.live))
  const connected = useCopilotStore((state) => state.connected)
  const archiveCount = useCopilotArchives((state) =>
    accountId ? (state.byAccount[accountId]?.length ?? 0) : 0
  )

  useEffect(() => {
    connectCopilot(accountId)
  }, [accountId])

  const startOver = () => {
    if (!accountId) return
    if (startNewCopilotConversation(accountId)) {
      toast.success(t("chatDetails.copilot.startedOver"))
    } else {
      toast.error(t("chatDetails.copilot.startOverFailed"))
    }
  }

  if (showArchives && accountId) {
    return <CopilotArchives accountId={accountId} onBack={() => setShowArchives(false)} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end gap-0.5 border-b px-2 py-1">
        <span className="mr-auto pl-2 text-xs text-muted-foreground" role="status">
          {connected ? null : t("chatDetails.copilot.connecting")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasMessages || busy || !connected}
          title={t("chatDetails.copilot.startOverHint")}
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={startOver}
        >
          <RotateCcw />
          {t("chatDetails.copilot.startOver")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("chatDetails.copilot.archive.open", { count: archiveCount })}
          title={t("chatDetails.copilot.archive.title")}
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={() => setShowArchives(true)}
        >
          <Archive />
          {archiveCount > 0 ? (
            <span className="tabular-nums">{formatNumber(archiveCount, language)}</span>
          ) : null}
        </Button>
      </div>

      <Conversation chatId={chatId} />
      <ErrorNotice />
      <CopilotInput />
    </div>
  )
}
