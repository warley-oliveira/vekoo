import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { Loader2 } from "lucide-react"

import { BackButton } from "@/components/onboarding/chat-parts"
import { Button } from "@/components/ui/button"

type OnboardingIntroProps = {
  starting: boolean
  onStart: () => void
  /** Sair do onboarding — a conversa fica salva para retomar. */
  onBack: () => void
}

const CARDS = ["detail", "help", "later"] as const

/**
 * Antes da conversa, a troca de expectativa: o que vem não é um cadastro, é
 * uma conversa sobre o negócio — e o que ela contar é o que o motor vai ler
 * toda vez que escrever. Os três cartões são as três coisas que mudam como
 * ela responde, na ordem em que importam.
 */
export function OnboardingIntro({ starting, onStart, onBack }: OnboardingIntroProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="relative shrink-0">
        <div className="mx-auto flex h-12 max-w-xl items-center px-4">
          <BackButton onClick={onBack} disabled={starting} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10 md:py-16">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-8"
        >
          <header className="space-y-4">
            <h1 className="font-heading text-3xl leading-[1.1] font-semibold tracking-tight text-balance md:text-4xl">
              <span className="block">{t("onboarding.intro.titleLead")}</span>
              <span className="block opacity-50">{t("onboarding.intro.titleRest")}</span>
            </h1>
            <p className="max-w-prose text-[15px] text-muted-foreground text-pretty">{t("onboarding.intro.sub")}</p>
          </header>

          <ul className="space-y-3">
            {CARDS.map((key, index) => (
              <motion.li
                key={key}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut", delay: reduced ? 0 : 0.08 + index * 0.06 }}
                className="rounded-xl border bg-card p-4"
              >
                <p className="text-sm font-medium">{t(`onboarding.intro.cards.${key}.title`)}</p>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">{t(`onboarding.intro.cards.${key}.body`)}</p>
              </motion.li>
            ))}
          </ul>

          <div className="space-y-4">
            <Button size="lg" className="h-11 w-full sm:w-auto" onClick={onStart} disabled={starting} autoFocus>
              {starting && <Loader2 className="animate-spin" aria-hidden />}
              {t("onboarding.intro.cta")}
            </Button>
            <p className="font-mono text-xs text-muted-foreground">{t("onboarding.intro.footer")}</p>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
