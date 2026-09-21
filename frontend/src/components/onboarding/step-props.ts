import type { BrandCore, BrandDocument, BrandSection } from "@/lib/brand-core"

/** O que toda pergunta do onboarding recebe da rota. */
export type StepProps = {
  brandCore: BrandCore
  busy: boolean
  /** Salva a resposta e avança. Sem documento, só marca a pergunta respondida. */
  onAnswer: (
    document?: Partial<Pick<BrandDocument, BrandSection>>,
    extra?: { segment?: string; wantsWordmark?: boolean }
  ) => void
  onSkip: () => void
  onBack: (() => void) | undefined
}
