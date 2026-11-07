import { createContext, useContext } from "react"

import type { WizardStep } from "@/lib/campaigns-wizard/form"

// Quem está em que passo, para as telas de dentro (o "Editar" da revisão) sem passar por props.

export type WizardNav = {
  step: WizardStep
  goTo: (step: WizardStep) => void
  /** Tentou avançar sem ninguém no público: o passo mostra o recado. */
  audienceError: boolean
  onAudienceEmpty: () => void
}

export const WizardNavContext = createContext<WizardNav | null>(null)

export function useWizardNav(): WizardNav {
  const nav = useContext(WizardNavContext)
  if (!nav) throw new Error("useWizardNav precisa estar dentro do assistente")
  return nav
}
