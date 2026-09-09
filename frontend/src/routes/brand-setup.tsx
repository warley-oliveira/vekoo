import { Navigate, useParams } from "react-router"

import { BrandWizard } from "@/components/brand/brand-wizard"
import { BrandWizardSkeleton } from "@/components/brand/brand-skeletons"
import { StepAssets } from "@/components/brand/step-assets"
import { StepColors } from "@/components/brand/step-colors"
import { StepNotes } from "@/components/brand/step-notes"
import { StepIdentity } from "@/components/brand/step-identity"
import { StepStyles } from "@/components/brand/step-styles"
import { StepTypography } from "@/components/brand/step-typography"
import { StepVoice } from "@/components/brand/step-voice"
import { ErrorState } from "@/components/error-state"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useActiveBrand } from "@/lib/brand-context"
import { isBrandStep, stepHref, type BrandStep } from "@/lib/brand-core"

const STEP_COMPONENTS: Record<BrandStep, () => React.JSX.Element> = {
  identity: StepIdentity,
  colors: StepColors,
  typography: StepTypography,
  styles: StepStyles,
  assets: StepAssets,
  voice: StepVoice,
  notes: StepNotes,
}

/** `/brands/setup/:step` — o formulário do Brandcore, uma etapa por tela. */
export function BrandSetupPage() {
  const { step } = useParams()
  const { brandId } = useActiveBrand()
  const { brandCore, isLoading, error, reload } = useBrandCore(brandId)

  if (error && !brandCore) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (isLoading || !brandCore) return <BrandWizardSkeleton />

  // Sem etapa (ou etapa inválida): retoma de onde parou.
  if (!isBrandStep(step)) {
    return <Navigate to={stepHref(brandId, brandCore.progress.lastStep ?? "identity")} replace />
  }

  const Step = STEP_COMPONENTS[step]

  return (
    <BrandWizard brandCore={brandCore} step={step}>
      <Step key={`${step}-${brandCore.id}`} />
    </BrandWizard>
  )
}
