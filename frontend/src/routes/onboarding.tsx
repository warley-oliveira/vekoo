import { useCallback, useEffect, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { BrandWizardSkeleton } from "@/components/brand/brand-skeletons"
import { ErrorState } from "@/components/error-state"
import { StepColors } from "@/components/onboarding/step-colors"
import { StepDone } from "@/components/onboarding/step-done"
import { StepFonts } from "@/components/onboarding/step-fonts"
import { StepHandle } from "@/components/onboarding/step-handle"
import { StepIntro } from "@/components/onboarding/step-intro"
import { StepLogo } from "@/components/onboarding/step-logo"
import { StepName } from "@/components/onboarding/step-name"
import { StepOffers } from "@/components/onboarding/step-offers"
import type { StepProps } from "@/components/onboarding/step-props"
import { StepVoice } from "@/components/onboarding/step-voice"
import { StepWhat } from "@/components/onboarding/step-what"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useOnboarding } from "@/hooks/use-onboarding"
import { useActiveBrand } from "@/lib/brand-context"
import type { BrandDocument, BrandSection } from "@/lib/brand-core"
import {
  isOnboardingStep,
  nextStep,
  onboardingHref,
  previousStep,
  type OnboardingStep,
} from "@/lib/onboarding"

const STEP_COMPONENTS: Record<OnboardingStep, (props: StepProps) => React.JSX.Element> = {
  intro: StepIntro,
  name: StepName,
  what: StepWhat,
  handle: StepHandle,
  logo: StepLogo,
  colors: StepColors,
  fonts: StepFonts,
  voice: StepVoice,
  offers: StepOffers,
  done: StepDone,
}

/**
 * `/brands/:brandId/onboarding/:step` — a marca montada por perguntas.
 *
 * É a porta de entrada de toda marca nova. O wizard de oito seções continua
 * inteiro em `/setup/:step`, como **modo de edição**: ele fala em papéis de
 * cor e hierarquia de texto, vocabulário que serve para ajustar depois e
 * assusta na primeira vez.
 *
 * Cada resposta salva o rascunho na hora — sair e voltar retoma na pergunta
 * onde parou, inclusive de outro aparelho.
 */
export function OnboardingPage() {
  const { t } = useTranslation()
  const { step } = useParams()
  const navigate = useNavigate()
  const { brandId } = useActiveBrand()
  const { brandCore, isLoading, error, reload } = useBrandCore(brandId)
  const { answer } = useOnboarding(brandId)
  const [busy, setBusy] = useState(false)

  const current = isOnboardingStep(step) ? step : null

  // Só registra que a pergunta foi vista: é o que dá a taxa de abandono por
  // etapa sem depender de o cliente mandar evento na saída.
  useEffect(() => {
    if (!current || !brandCore) return
    void answer({ step: current, action: "viewed" }).catch(() => {})
    // Uma vez por pergunta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const go = useCallback(
    (target: OnboardingStep | null) => {
      if (target) navigate(onboardingHref(brandId, target))
    },
    [brandId, navigate]
  )

  const save = useCallback(
    async (
      action: "answered" | "skipped",
      document?: Partial<Pick<BrandDocument, BrandSection>>,
      extra?: { segment?: string; wantsWordmark?: boolean }
    ) => {
      if (!current) return
      setBusy(true)
      try {
        await answer({
          step: current,
          action,
          document,
          segment: extra?.segment,
          wantsWordmark: extra?.wantsWordmark,
        })
        go(nextStep(current))
      } catch {
        toast.error(t("onboarding.saveFailed"))
      } finally {
        setBusy(false)
      }
    },
    [answer, current, go, t]
  )

  if (error && !brandCore) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }

  if (isLoading || !brandCore) return <BrandWizardSkeleton />

  // Sem etapa (ou etapa inválida): retoma de onde parou.
  if (!current) {
    return <Navigate to={onboardingHref(brandId, brandCore.onboarding.step)} replace />
  }

  const Step = STEP_COMPONENTS[current]
  const previous = previousStep(current)

  return (
    <Step
      key={`${current}-${brandCore.id}`}
      brandCore={brandCore}
      busy={busy}
      onAnswer={(document, extra) => void save("answered", document, extra)}
      onSkip={() => void save("skipped")}
      onBack={previous ? () => go(previous) : undefined}
    />
  )
}
