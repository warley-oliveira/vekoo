import { useTranslation } from "react-i18next"
import { MessageSquareText, PencilLine, Sparkles } from "lucide-react"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { QUESTION_COUNT } from "@/lib/onboarding"

/**
 * A tela de instruções, antes da primeira pergunta.
 *
 * Existe para trocar uma expectativa: o que vem a seguir não é um cadastro
 * burocrático, é o que a ferramenta vai ler toda vez que escrever alguma
 * coisa pela pessoa. Quem responde com detalhe recebe peça melhor — e quem
 * não sabe responder tem um botão que responde por ela. As três promessas
 * abaixo são exatamente isso, na ordem em que importam.
 */
export function StepIntro({ onAnswer, busy }: StepProps) {
  const { t } = useTranslation()

  const points = [
    { icon: PencilLine, key: "detail" },
    { icon: Sparkles, key: "help" },
    { icon: MessageSquareText, key: "later" },
  ] as const

  return (
    <OnboardingShell
      step="intro"
      title={t("onboarding.intro.title")}
      description={t("onboarding.intro.description", { count: QUESTION_COUNT })}
      onContinue={() => onAnswer()}
      continueLabel={t("onboarding.intro.cta")}
      busy={busy}
    >
      <ul className="space-y-4">
        {points.map(({ icon: Icon, key }) => (
          <li key={key} className="flex gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t(`onboarding.intro.points.${key}.title`)}</p>
              <p className="text-sm text-muted-foreground text-pretty">
                {t(`onboarding.intro.points.${key}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-muted-foreground">{t("onboarding.intro.time")}</p>
    </OnboardingShell>
  )
}
