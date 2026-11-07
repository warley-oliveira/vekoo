import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Check, CircleAlert, CircleStop, Clock, FlaskConical, Info, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react"
import { toast } from "sonner"

import { apiAssetUrl } from "@/lib/api"
import { Callout, SegmentedControl, StatusBadge, type StatusTone } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { usePlayground, type TestItem, type TestStatus, type TestStep } from "@/hooks/flows/use-playground"
import { useIsTouch } from "@/hooks/use-media-query"
import { blockFamily, blockIcon } from "@/lib/flows/catalog"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { useFlowContext } from "./flow-context"
import { useRunApi } from "./run-store"
import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"
import { useFocusBlock } from "./use-editor-shortcuts"

// O teste do editor: uma conversa de mentira, com o caminho aceso no quadro e o que cada bloco fez. Fica à direita,
// sem cobrir o quadro, porque ver o fluxo andando é a graça. O modelo e as funções são de verdade, e a tela avisa.

const STATUS_TONE: Record<TestStatus, StatusTone> = {
  idle: "neutral",
  starting: "info",
  running: "info",
  waiting: "accent",
  waitingTime: "warning",
  completed: "success",
  failed: "danger",
  stopped: "neutral",
}

export function TestPanel() {
  const open = useEditorUi((state) => state.testOpen)
  const preset = useMotionPreset()
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="test"
          initial={preset.reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={preset.reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={preset.reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
          transition={preset.spring}
          className={cn(
            "absolute z-30 flex flex-col overflow-hidden bg-popover",
            "inset-0 md:inset-auto md:top-3 md:right-3 md:bottom-3 md:w-[26rem] md:rounded-2xl md:border md:shadow-lg"
          )}
        >
          <TestBody />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

function TestBody() {
  const { t } = useTranslation()
  const { flow } = useFlowContext()
  const runApi = useRunApi()
  const setOpen = useEditorUi((state) => state.setTestOpen)
  const [tab, setTab] = useState<"chat" | "steps">("chat")

  const handlers = useMemo(
    () => ({
      onEnter: (id: string) => runApi.getState().enter(id),
      onComplete: (id: string, status: "success" | "suspended" | "error") =>
        runApi.getState().complete(id, status === "error" ? "failed" : status === "suspended" ? "waiting" : "done"),
      onFinish: () => runApi.getState().finish(),
      onReset: () => runApi.getState().reset(),
    }),
    [runApi]
  )
  const { status, items, steps, start, send, stop } = usePlayground(flow.id, handlers)

  // Abriu: grava o que está no quadro, porque o teste roda o rascunho salvo.
  const startRef = useRef(start)
  useEffect(() => {
    startRef.current = start
  })
  const begin = useCallback(async () => {
    const saved = await useEditorUi.getState().flush()
    if (!saved) {
      toast.error(t("flows.test.saveFailed"))
      return
    }
    void startRef.current()
  }, [t])

  // Uma vez por abertura. Em desenvolvimento o React monta duas vezes, e isso abriria duas execuções.
  const began = useRef(false)
  useEffect(() => {
    useEditorUi.setState({ replay: null })
    if (!began.current) {
      began.current = true
      void begin()
    }
    return () => {
      runApi.getState().reset()
    }
  }, [begin, runApi])

  const stopRef = useRef(stop)
  useEffect(() => {
    stopRef.current = stop
  })
  useEffect(() => () => void stopRef.current(), [])

  const busy = status === "starting" || status === "running"
  const finished = status === "completed" || status === "failed" || status === "stopped"

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b py-2 pr-2 pl-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <FlaskConical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-sm font-semibold tracking-tight">{t("flows.test.title")}</h2>
        </div>
        <StatusBadge tone={STATUS_TONE[status]}>{t(`flows.test.status.${status}`)}</StatusBadge>
        {busy || status === "waiting" || status === "waitingTime" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("flows.test.stop")}
            title={t("flows.test.stop")}
            onClick={() => void stop()}
          >
            <CircleStop />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("flows.test.restart")}
          title={t("flows.test.restart")}
          onClick={() => {
            void stop()
            void begin()
          }}
        >
          <RotateCcw />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("flows.test.close")}
          title={t("flows.test.close")}
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </header>

      <div className="shrink-0 space-y-2 border-b px-3 py-2">
        <SegmentedControl
          fullWidth
          aria-label={t("flows.test.tabs")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "chat", label: t("flows.test.tabChat") },
            { value: "steps", label: t("flows.test.tabSteps"), count: steps.length },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "chat" ? (
          <ConversationView items={items} busy={busy} onPick={(text) => void send(text)} />
        ) : (
          <StepsView steps={steps} />
        )}
      </div>

      {tab === "chat" ? (
        <Composer
          disabled={finished || status === "idle" || status === "starting"}
          finished={finished}
          onSend={send}
          onRestart={() => void begin()}
        />
      ) : null}
    </>
  )
}

function ConversationView({
  items,
  busy,
  onPick,
}: {
  items: TestItem[]
  busy: boolean
  onPick: (text: string) => void
}) {
  const { t } = useTranslation()
  const scroller = useRef<HTMLDivElement>(null)
  const preset = useMotionPreset()

  useEffect(() => {
    const element = scroller.current
    element?.scrollTo({ top: element.scrollHeight, behavior: preset.reduced ? "auto" : "smooth" })
  }, [items.length, busy, preset.reduced])

  return (
    <div ref={scroller} className="h-full overflow-y-auto bg-muted/30 p-3" role="log" aria-live="polite" aria-label={t("flows.test.tabChat")}>
      <Callout className="mb-3 bg-card">{t("flows.test.realCost")}</Callout>
      <div className="flex flex-col gap-2">
        {items.length === 0 && !busy ? (
          <p className="py-8 text-center text-sm text-pretty text-muted-foreground">{t("flows.test.empty")}</p>
        ) : null}
        {items.map((item) => (
          <TestBubble key={item.id} item={item} onPick={onPick} />
        ))}
        {busy ? (
          <p className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-xs text-muted-foreground shadow-xs">
            <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
            {t("flows.test.typing")}
          </p>
        ) : null}
      </div>
    </div>
  )
}

const NOTE_ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: Check }

const TestBubble = memo(function TestBubble({ item, onPick }: { item: TestItem; onPick: (text: string) => void }) {
  const { t } = useTranslation()

  if (item.kind === "user") {
    return (
      <p className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
        {item.text}
      </p>
    )
  }

  if (item.kind === "bot") {
    return (
      <div className="max-w-[85%] self-start">
        {item.sender ? <p className="mb-0.5 px-1 text-[11px] text-muted-foreground">{item.sender}</p> : null}
        <p className="rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-sm whitespace-pre-wrap shadow-xs">{item.text}</p>
      </div>
    )
  }

  if (item.kind === "media") {
    const isImage = item.url && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(item.url)
    return (
      <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-card p-2 text-sm shadow-xs">
        {isImage && item.url ? (
          <img src={apiAssetUrl(item.url)} alt={item.caption ?? ""} className="mb-1 max-h-48 rounded-lg object-cover" />
        ) : (
          <p className="px-1 text-xs text-muted-foreground">{t("flows.test.attachment")}</p>
        )}
        {item.caption ? <p className="px-1 whitespace-pre-wrap">{item.caption}</p> : null}
      </div>
    )
  }

  if (item.kind === "options") {
    return (
      <div className="flex max-w-[85%] flex-col gap-1.5 self-start">
        {item.text ? <p className="rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-sm whitespace-pre-wrap shadow-xs">{item.text}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          {item.options.map((option) => (
            <Button key={option.id} type="button" variant="outline" size="sm" className="rounded-full bg-card" onClick={() => onPick(option.title)}>
              {option.title}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const Icon = NOTE_ICONS[item.tone]
  const params =
    item.code === "pipelineSkipped"
      ? { name: t(`flows.blocks.${String(item.params?.type)}.label`, { defaultValue: String(item.params?.type) }) }
      : item.params
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 self-center rounded-lg border bg-card px-2.5 py-1.5 text-xs text-pretty",
        item.tone === "warning" && "text-status-warning",
        item.tone === "danger" && "text-status-danger",
        item.tone === "success" && "text-status-success",
        item.tone === "info" && "text-muted-foreground"
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{t(`flows.test.notes.${item.code}`, params)}</span>
    </p>
  )
})

function Composer({
  disabled,
  finished,
  onSend,
  onRestart,
}: {
  disabled: boolean
  finished: boolean
  onSend: (text: string) => Promise<boolean>
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const [text, setText] = useState("")

  const submit = () => {
    const message = text.trim()
    if (!message || disabled) return
    setText("")
    void onSend(message).then((sent) => {
      if (!sent) setText(message)
    })
  }

  if (finished) {
    return (
      <div className="shrink-0 border-t p-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+var(--app-bottom-nav-total,0px)))] md:pb-3">
        <Button type="button" variant="outline" className="w-full" onClick={onRestart}>
          <RotateCcw />
          {t("flows.test.restart")}
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex shrink-0 items-end gap-2 border-t p-2.5 pb-[max(0.625rem,calc(env(safe-area-inset-bottom)+var(--app-bottom-nav-total,0px)))] md:pb-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        rows={1}
        value={text}
        disabled={disabled}
        aria-label={t("flows.test.placeholder")}
        placeholder={t("flows.test.placeholder")}
        enterKeyHint="send"
        className="max-h-32 min-h-9 resize-none"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !isTouch) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <Button type="submit" size="icon" disabled={disabled || !text.trim()} aria-label={t("flows.test.send")}>
        <ArrowUp />
      </Button>
    </form>
  )
}

function StepsView({ steps }: { steps: TestStep[] }) {
  const { t } = useTranslation()
  if (steps.length === 0) {
    return <p className="p-6 text-center text-sm text-pretty text-muted-foreground">{t("flows.test.stepsEmpty")}</p>
  }
  return (
    <ol className="h-full overflow-y-auto p-2">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </ol>
  )
}

function StepRow({ step }: { step: TestStep }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const api = useEditorApi()
  const focusBlock = useFocusBlock()
  const Icon = blockIcon(step.nodeType)
  const node = api.getState().nodes.find((item) => item.id === step.nodeId)
  const custom = typeof node?.data.label === "string" ? node.data.label.trim() : ""
  const title = custom || t(`flows.blocks.${step.nodeType}.label`, { defaultValue: step.nodeType })

  return (
    <li>
      <button
        type="button"
        onClick={() => focusBlock(step.nodeId)}
        className="flow-block flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        data-family={blockFamily(step.nodeType)}
      >
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-(--block-tint-soft) text-(--block-tint)">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
            {step.durationMs != null ? (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {step.durationMs < 1000
                  ? t("flows.test.ms", { value: formatNumber(step.durationMs, language) })
                  : t("flows.test.seconds", { value: formatNumber(step.durationMs / 1000, language) })}
              </span>
            ) : null}
            {step.status === "success" ? <Check className="size-3.5 shrink-0 text-status-success" aria-hidden /> : null}
            {step.status === "suspended" ? <Clock className="size-3.5 shrink-0 text-status-warning" aria-hidden /> : null}
            {step.status === "error" ? <CircleAlert className="size-3.5 shrink-0 text-status-danger" aria-hidden /> : null}
          </span>
          <span className="block text-xs text-pretty text-muted-foreground">
            {step.status === "error" ? (step.error ?? t("flows.test.stepFailed")) : null}
            {step.status === "suspended" ? t("flows.test.stepWaiting") : null}
            {step.status === "decision" && step.decision
              ? step.decision.stay
                ? t("flows.test.stepStayed", { reason: step.decision.reason ?? "" })
                : t("flows.test.stepLeft", { name: step.decision.label ?? "", reason: step.decision.reason ?? "" })
              : null}
          </span>
        </span>
      </button>
    </li>
  )
}
