import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  QUESTION_COUNT,
  isSkippable,
  questionPosition,
  type OnboardingStep,
} from "@/lib/onboarding"
import { cn } from "@/lib/utils"

type OnboardingShellProps = {
  step: OnboardingStep
  title: string
  description?: string
  children: ReactNode
  /** Ação principal. Desabilitada enquanto a resposta não serve. */
  onContinue: () => void
  continueLabel?: string
  canContinue?: boolean
  busy?: boolean
  onBack?: () => void
  onSkip?: () => void
  /** Ocupa a largura toda (o fechamento mostra o cartão da marca). */
  wide?: boolean
}

/**
 * A moldura de uma pergunta do onboarding: progresso, título, a pergunta e a
 * saída.
 *
 * Uma pergunta por tela de propósito. O wizard de oito seções continua
 * existindo para quem quer ajustar depois — mas ele fala em papéis de cor e
 * hierarquia de texto, e quem acabou de abrir uma padaria não deveria
 * precisar aprender esse vocabulário para ter uma marca.
 */
export function OnboardingShell({
  step,
  title,
  description,
  children,
  onContinue,
  continueLabel,
  canContinue = true,
  busy,
  onBack,
  onSkip,
  wide,
}: OnboardingShellProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const position = questionPosition(step)
  const percent = position ? Math.round((position / QUESTION_COUNT) * 100) : 0

  return (
    <div className={cn("mx-auto px-4 py-8 md:px-6 md:py-12", wide ? "max-w-4xl" : "max-w-xl")}>
      {position !== null && (
        <div className="mb-8 flex items-center gap-3">
          <Progress
            value={percent}
            aria-label={t("onboarding.progress", { current: position, total: QUESTION_COUNT })}
            className="flex-1"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t("onboarding.progress", { current: position, total: QUESTION_COUNT })}
          </span>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduced ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: -12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <header className="space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p>
            )}
          </header>

          <div className="mt-7">{children}</div>
        </motion.div>
      </AnimatePresence>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
              <ArrowLeft /> {t("onboarding.back")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onSkip && isSkippable(step) && (
            <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>
              {t("onboarding.skip")}
            </Button>
          )}
          <Button onClick={onContinue} disabled={!canContinue || busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {continueLabel ?? t("onboarding.continue")}
            {!busy && <ArrowRight />}
          </Button>
        </div>
      </footer>
    </div>
  )
}
