import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { useReducedMotion } from "motion/react"
import { toast } from "sonner"

import { ChatComposer, COMPOSER_ID } from "@/components/onboarding/chat-composer"
import { AgentLine, Appear, StatusLine } from "@/components/onboarding/chat-parts"
import { ThreadTurn } from "@/components/onboarding/thread-turn"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { useOnboarding, useOnboardingLive } from "@/hooks/use-onboarding"
import { ApiError } from "@/lib/api"
import { brandPath } from "@/lib/brand-context"
import type { BrandCore } from "@/lib/brand-core"
import { topicLabelKey, type MessageInput, type OnboardingThread } from "@/lib/onboarding"

type OnboardingChatProps = {
  brandCore: BrandCore
  thread: OnboardingThread
  /** A conversa começou agora, nesta tela — não é retomada. */
  justStarted: boolean
}

/**
 * A conversa do brandcore. O agente pergunta, a pessoa responde do jeito dela
 * e cada resposta vira campo da marca por baixo — ela nunca vê campo, seção
 * nem schema, só a conversa e, no fim, a marca montada.
 *
 * Retomar é o caso comum, não a exceção: quem volta encontra a conversa
 * inteira e uma linha dizendo onde parou.
 */
export function OnboardingChat({ brandCore, thread, justStarted }: OnboardingChatProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const { send, retry, finish } = useOnboarding(brandCore.id)
  const { uploadAsset } = useBrandCoreMutations(brandCore.id)
  const [publishing, setPublishing] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useOnboardingLive(brandCore.id, thread.conversationId)

  const { state, turns } = thread
  const last = turns.at(-1)
  const busy = last?.status === "thinking"

  // Onde a conversa estava quando a tela abriu. A linha de retomada fica
  // presa ali, e não no fim: depois da próxima resposta ela é passado.
  const [resumeAt] = useState(() =>
    !justStarted && turns.length > 0 && state.topic !== "summary" && last?.status === "answered"
      ? turns.length - 1
      : null
  )
  const abandoned = !justStarted && turns.length === 0

  // A proposta escolhida em cada turno de propostas.
  const chosen = useMemo(() => {
    const map = new Map<string, number>()
    for (const turn of turns) {
      if (turn.kind === "choose" && turn.sourceTurnId && turn.choice) map.set(turn.sourceTurnId, turn.choice.index)
    }
    return map
  }, [turns])

  // Só o resumo mais recente ganha o cartão; os anteriores ficam como log.
  const summaryTurnId = useMemo(
    () => [...turns].reverse().find((turn) => turn.reply.some((item) => item.type === "summary"))?.id ?? null,
    [turns]
  )

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" })
  }, [turns.length, last?.status, adjusting, reduced])

  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.code === "network") toast.error(t("onboarding.errors.offline"))
      else if (error instanceof ApiError && error.code === "busy") toast.error(t("agent.errors.busy"))
      else if (error instanceof ApiError && error.serverMessage) toast.error(error.serverMessage)
      else toast.error(t("onboarding.errors.modelDown"))
    },
    [t]
  )

  const say = useCallback(
    async (input: MessageInput) => {
      try {
        await send(input)
        setAdjusting(false)
      } catch (error) {
        fail(error)
        throw error
      }
    },
    [fail, send]
  )

  const onLogo = useCallback(
    async (file: File) => {
      let assetId: string
      try {
        assetId = (await uploadAsset("logo", "light", file)).id
      } catch (error) {
        if (error instanceof ApiError && error.code === "network") toast.error(t("onboarding.errors.offline"))
        else toast.error(t("onboarding.errors.logoUpload"))
        return
      }
      await say({ kind: "logo", assetId }).catch(() => {})
    },
    [say, t, uploadAsset]
  )

  const onRetry = useCallback((turnId: string) => void retry(turnId).catch(fail), [fail, retry])

  const onChoose = useCallback(
    (turnId: string, index: number) => void say({ kind: "choose", turnId, index }).catch(() => {}),
    [say]
  )

  const onPublish = useCallback(async () => {
    setPublishing(true)
    try {
      await finish()
      navigate(brandPath(brandCore.id, "/create"))
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.code === "network" ? t("onboarding.errors.offline") : t("onboarding.errors.publish")
      )
    } finally {
      setPublishing(false)
    }
  }, [brandCore.id, finish, navigate, t])

  const onAdjust = useCallback(() => {
    setAdjusting(true)
    // "Ajustar" é um convite a escrever: o foco vai para o campo.
    window.requestAnimationFrame(() => document.getElementById(COMPOSER_ID)?.focus())
  }, [])

  const logoOpen = state.topic === "logo" || state.topic === "summary"

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b">
        <div className="mx-auto flex h-12 max-w-2xl items-center px-4">
          <p className="font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {t("onboarding.progress", { current: state.position, total: state.total })}
          </p>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          role="log"
          aria-label={t("onboarding.a11y.thread")}
          aria-live="polite"
          className="mx-auto max-w-2xl space-y-6 px-4 pt-6 pb-8"
        >
          <div className="space-y-2.5">
            {abandoned && <StatusLine>{t("onboarding.empty")}</StatusLine>}
            <AgentLine>{t("onboarding.opening.intro")}</AgentLine>
            <AgentLine>{t("onboarding.opening.first")}</AgentLine>
          </div>

          {turns.map((turn, index) => (
            <div key={turn.id} className="space-y-6">
              <ThreadTurn
                turn={turn}
                brandCore={brandCore}
                isLast={index === turns.length - 1}
                showsSummary={turn.id === summaryTurnId && state.topic === "summary"}
                chosen={chosen.get(turn.id) ?? null}
                locked={busy || publishing}
                publishing={publishing}
                onChoose={onChoose}
                onRetry={onRetry}
                onPublish={() => void onPublish()}
                onAdjust={onAdjust}
              />
              {index === resumeAt && (
                <Appear>
                  <AgentLine>{t("onboarding.resume", { topic: t(topicLabelKey(state.topic)) })}</AgentLine>
                </Appear>
              )}
            </div>
          ))}

          {adjusting && !busy && (
            <Appear>
              <AgentLine>{t("onboarding.agent.adjustAsk")}</AgentLine>
            </Appear>
          )}
          <div ref={bottom} />
        </div>
      </main>

      <footer className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-2xl px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <ChatComposer
            busy={busy || publishing}
            onSend={(text) => say({ kind: "answer", text })}
            onSuggest={state.suggestible ? () => void say({ kind: "suggest" }).catch(() => {}) : undefined}
            onLogo={logoOpen ? onLogo : undefined}
          />
        </div>
      </footer>
    </div>
  )
}
