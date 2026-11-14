import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

import { HoloBar } from "@/components/holo-bar"
import { topicLabelKey, topicPosition, type ThreadTopic } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

// As peças de uma conversa do brandcore. A fala do agente não tem balão: é
// texto corrido, como quem escreve num terminal — a interface fica quieta e
// quem chama atenção é o que a pessoa conta. A fala dela tem balão, à direita,
// porque é o que muda de turno para turno.

/** Entrada suave das falas novas. Some com `prefers-reduced-motion`. */
export function Appear({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AgentLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-prose text-[15px] leading-[1.6] text-pretty text-vk-fg", className)}>{children}</p>
}

/**
 * O "← voltar" do onboarding, o mesmo na intro e na conversa. No desktop sai
 * da coluna e encosta na margem, como o voltar de um navegador; no celular a
 * coluna já é a tela inteira e ele fica no fluxo. Quem o põe na tela dá um
 * pai `relative` com 48px de altura.
 */
/** O "← início" do topo: sai do onboarding para o painel da marca. A conversa fica salva. */
export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("onboarding.leave.a11y")}
      className="-ml-2 inline-flex h-10 shrink-0 items-center rounded-vk-sm px-2 font-mono text-sm font-medium text-vk-fg outline-none transition-opacity enabled:hover:opacity-70 focus-visible:ring-2 focus-visible:ring-vk-fg/30 disabled:cursor-default disabled:opacity-45 md:absolute md:top-1 md:left-4 md:ml-0"
    >
      {t("onboarding.leave.action")}
    </button>
  )
}

/**
 * Voltar uma pergunta — ação da conversa, não da página: mora junto do campo,
 * longe do "← início", para as duas não se confundirem.
 */
export function PreviousQuestionButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t("onboarding.back.a11y")}
      className="-ml-2 inline-flex h-10 items-center rounded-vk-sm px-2 font-mono text-xs text-vk-muted outline-none transition-colors enabled:hover:text-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30 disabled:cursor-default disabled:opacity-45"
    >
      {t("onboarding.back.action")}
    </button>
  )
}

/** "01 / marca" — o rótulo em mono acima de cada pergunta, como no site. */
export function QuestionLabel({ topic }: { topic: ThreadTopic }) {
  const { t } = useTranslation()
  return (
    <p className="font-mono text-xs text-vk-muted tabular-nums">
      {t("onboarding.questionLabel", {
        number: String(topicPosition(topic)).padStart(2, "0"),
        topic: t(topicLabelKey(topic)),
      })}
    </p>
  )
}

/** "paleta gravada ✓" — o log do que entrou no brandcore. */
export function StatusLine({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>
}

export function UserBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] rounded-vk-sm border border-vk-border bg-vk-faint px-4 py-2.5 text-[15px] leading-[1.6] whitespace-pre-wrap text-pretty",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** O `n/8` como barra, sob o cabeçalho da conversa. */
export function ProgressBar({ value }: { value: number }) {
  return <HoloBar value={value} className="h-0.5 w-full bg-vk-faint" />
}

/** O agente lendo a resposta. Três pontos em mono, sem spinner. */
export function Thinking() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <div role="status" aria-label={t("onboarding.a11y.thinking")} className="flex h-6 items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={reduced ? { opacity: 0.6 } : { opacity: [0.25, 1, 0.25] }}
          transition={reduced ? undefined : { duration: 1.2, repeat: Infinity, delay: dot * 0.18 }}
        />
      ))}
    </div>
  )
}
