import { createContext, useContext, useEffect } from "react"

import type { SaveStatus } from "@/components/brand/save-indicator"
import type { CommitStep } from "@/components/brand/use-step-form"
import type { BrandCore, BrandDocument, BrandSection, BrandStep } from "@/lib/brand-core"

// O contrato entre o shell do formulário e cada etapa: a etapa registra a
// sua função de "commit" (validar + salvar), avisa o estado do salvamento e
// manda o que a pessoa digita para o cartão da marca acompanhar ao vivo.

export type WizardContextValue = {
  brandCore: BrandCore
  step: BrandStep
  registerCommit: (commit: CommitStep | null) => void
  reportStatus: (status: SaveStatus) => void
  reportRetry: (retry: (() => void) | null) => void
  previewSection: <S extends BrandSection>(section: S, data: BrandDocument[S]) => void
}

export const WizardContext = createContext<WizardContextValue | null>(null)

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error("useWizard precisa estar dentro do BrandWizard")
  return ctx
}

/** O que toda etapa com formulário faz ao montar: liga commit, status e retry ao shell. */
export function useRegisterStep(commit: CommitStep, status: SaveStatus, retry: () => void) {
  const { registerCommit, reportStatus, reportRetry } = useWizard()
  useEffect(() => {
    registerCommit(commit)
    return () => registerCommit(null)
  }, [commit, registerCommit])
  useEffect(() => reportStatus(status), [status, reportStatus])
  useEffect(() => {
    reportRetry(retry)
    return () => reportRetry(null)
  }, [retry, reportRetry])
}
