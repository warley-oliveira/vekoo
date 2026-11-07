import { createContext, useContext, type ReactNode } from "react"

import type { WizardStep } from "@/lib/campaigns-wizard/form"

// Quem está em que passo, para as telas de dentro (o "Editar" da revisão) sem passar por props.

export type WizardNav = {
  step: WizardStep
  goTo: (step: WizardStep) => void
  /** Tentou avançar sem ninguém no público: o passo mostra o recado. */
  audienceError: boolean
  onAudienceEmpty: () => void
}

const WizardNavContext = createContext<WizardNav | null>(null)

export function WizardNavProvider({ value, children }: { value: WizardNav; children: ReactNode }) {
  return <WizardNavContext.Provider value={value}>{children}</WizardNavContext.Provider>
}

export function useWizardNav(): WizardNav {
  const nav = useContext(WizardNavContext)
  if (!nav) throw new Error("useWizardNav precisa estar dentro de WizardNavProvider")
  return nav
}

/** O título e a explicação de um passo. O título da tela continua na barra superior. */
export function StepHeading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h2 id={id} tabIndex={-1} className="font-heading text-xl font-medium outline-none md:text-2xl">
        {title}
      </h2>
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">{hint}</p>
    </header>
  )
}
