import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { toast } from "sonner"

import { BrandCard } from "@/components/brand/brand-card"
import { BrandStepper } from "@/components/brand/brand-stepper"
import { WizardContext, type WizardContextValue } from "@/components/brand/brand-wizard-context"
import { SaveIndicator, type SaveStatus } from "@/components/brand/save-indicator"
import type { CommitStep, StepProgress } from "@/components/brand/use-step-form"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { useBrandCoreLive } from "@/hooks/use-brand-core-live"
import {
  BRAND_STEPS,
  nextStep,
  previousStep,
  stepHref,
  stepIndex,
  type BrandCore,
  type BrandDocument,
  type BrandSection,
  type BrandStep,
} from "@/lib/brand-core"

// O shell do formulário: trilha de etapas, cabeçalho com progresso e
// salvamento, a etapa em si, o cartão da marca ao lado e a navegação.
// Cada etapa registra aqui a sua função de "commit" (validar + salvar) — é
// o que o botão Continuar chama.

type BrandWizardProps = {
  brandCore: BrandCore
  step: BrandStep
  children: ReactNode
}

export function BrandWizard({ brandCore, step, children }: BrandWizardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const { saveProgress } = useBrandCoreMutations(brandCore.id)

  const commitRef = useRef<CommitStep | null>(null)
  const retryRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [advancing, setAdvancing] = useState(false)
  const [preview, setPreview] = useState<Partial<BrandDocument>>({})
  const [cardOpen, setCardOpen] = useState(false)

  useBrandCoreLive((event) => {
    if (event.event === "published") {
      toast(
        t("brand.overview.livePublished", {
          name: event.accountName ?? t("brand.overview.liveSomeone"),
          version: event.currentVersion,
        })
      )
    }
  })

  // Entrar numa etapa a marca como visitada e como "onde parei".
  useEffect(() => {
    const { visitedSteps, lastStep } = brandCore.progress
    if (visitedSteps.includes(step) && lastStep === step) return
    void saveProgress({ visitedSteps: [step], lastStep: step }).catch(() => {})
    // Só na troca de etapa: o progresso do servidor muda a cada salvamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Ao trocar de etapa, o preview volta a ser o que está salvo.
  useEffect(() => setPreview({}), [step])

  const registerCommit = useCallback((commit: CommitStep | null) => {
    commitRef.current = commit
  }, [])
  const reportRetry = useCallback((retry: (() => void) | null) => {
    retryRef.current = retry
  }, [])
  const previewSection = useCallback(
    <S extends BrandSection>(section: S, data: BrandDocument[S]) =>
      setPreview((current) => ({ ...current, [section]: data })),
    []
  )

  const value = useMemo<WizardContextValue>(
    () => ({ brandCore, step, registerCommit, reportStatus: setStatus, reportRetry, previewSection }),
    [brandCore, step, registerCommit, reportRetry, previewSection]
  )

  const previous = previousStep(step)
  const next = nextStep(step)
  const index = stepIndex(step)

  async function advance(target: BrandStep | null) {
    setAdvancing(true)
    try {
      const progress: StepProgress = target
        ? { visitedSteps: [step, target], lastStep: target }
        : { visitedSteps: [step], lastStep: step }
      const ok = commitRef.current ? await commitRef.current(progress) : true
      if (!ok) return
      if (!commitRef.current) await saveProgress(progress).catch(() => {})
      navigate(target ? stepHref(brandCore.id, target) : `/brands/${brandCore.id}/settings`)
    } finally {
      setAdvancing(false)
    }
  }

  const previewDocument: BrandDocument = { ...brandCore.document, ...preview }

  return (
    <WizardContext.Provider value={value}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t("brand.nav.step", { current: index + 1, total: BRAND_STEPS.length })}
            </p>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {t(`brand.steps.${step}.title`)}
            </h1>
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {t(`brand.steps.${step}.description`)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator status={status} onRetry={() => retryRef.current?.()} />
            <Button variant="ghost" size="sm" onClick={() => navigate(`/brands/${brandCore.id}/settings`)}>
              <X /> {t("brand.nav.exit")}
            </Button>
          </div>
        </header>

        <div className="mt-4 flex items-center gap-3">
          <Progress
            value={brandCore.completeness.percent}
            aria-label={t("brand.progress", { percent: brandCore.completeness.percent })}
            className="flex-1"
          />
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {t("brand.progress", { percent: brandCore.completeness.percent })}
          </span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_19rem] xl:gap-8">
          <BrandStepper brandCore={brandCore} current={step} className="lg:sticky lg:top-6 lg:self-start" />

          <div className="min-w-0">
            {/* Cartão no celular/tablet: recolhível, para não empurrar o formulário. */}
            <Collapsible open={cardOpen} onOpenChange={setCardOpen} className="mb-5 xl:hidden">
              <CollapsibleTrigger
                render={
                  <Button variant="outline" size="sm" className="w-full justify-between" />
                }
              >
                {cardOpen ? t("brand.card.hide") : t("brand.card.show")}
                <ChevronDown className={cardOpen ? "rotate-180 transition-transform" : "transition-transform"} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <BrandCard document={previewDocument} assets={brandCore.assets} logos={brandCore.logos} className="mx-auto max-w-sm" />
              </CollapsibleContent>
            </Collapsible>

            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                key={step}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                aria-labelledby="brand-step-title"
              >
                {children}
              </motion.section>
            </AnimatePresence>

            <footer className="mt-8 flex items-center justify-between gap-3 border-t pt-5">
              <Button
                variant="outline"
                onClick={() => (previous ? void advance(previous) : navigate(`/brands/${brandCore.id}/settings`))}
                disabled={advancing}
              >
                <ArrowLeft /> {t("brand.nav.back")}
              </Button>
              <Button onClick={() => void advance(next)} disabled={advancing}>
                {advancing ? <Loader2 className="animate-spin" /> : null}
                {next ? t("brand.nav.next") : t("brand.nav.finish")}
                {!advancing && <ArrowRight />}
              </Button>
            </footer>
          </div>

          <aside className="hidden xl:block">
            <div className="sticky top-6 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("brand.card.title")}</p>
              <BrandCard document={previewDocument} assets={brandCore.assets} logos={brandCore.logos} />
              <p className="text-xs text-muted-foreground">{t("brand.card.hint")}</p>
            </div>
          </aside>
        </div>
      </div>
    </WizardContext.Provider>
  )
}
