import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { Check, Loader2, Settings2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { BrandCard } from "@/components/brand/brand-card"
import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { Button } from "@/components/ui/button"
import { useOnboarding } from "@/hooks/use-onboarding"
import { ApiError } from "@/lib/api"
import { brandPath } from "@/lib/brand-context"
import { stepHref } from "@/lib/brand-core"

/**
 * O fechamento: a marca montada, publicada na versão 1, e o caminho direto
 * para a primeira peça.
 *
 * O cartão aparece **antes** de publicar de propósito. Quem pulou a voz vê
 * aqui a frase que foi proposta no lugar dela — nada entra na marca sem a
 * pessoa ter visto.
 */
export function StepDone({ brandCore, onBack }: StepProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const { finish, wordmark } = useOnboarding(brandCore.id)
  const [publishing, setPublishing] = useState(false)
  const [drawing, setDrawing] = useState(false)

  const published = brandCore.status === "published"
  const needsWordmark =
    brandCore.onboarding.wantsWordmark && !brandCore.assets.some((asset) => asset.kind === "logo")

  // O logotipo é desenhado **aqui**, e não na pergunta da logo: ele usa a
  // tipografia, que só foi escolhida duas perguntas depois. É a primeira vez
  // que a pessoa o vê — e ele já entra no cartão abaixo.
  useEffect(() => {
    if (!needsWordmark || drawing) return
    setDrawing(true)
    wordmark()
      .catch(() => toast.error(t("onboarding.logo.drawFailed")))
      .finally(() => setDrawing(false))
    // Uma vez, quando a tela abre precisando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsWordmark])

  async function publish() {
    setPublishing(true)
    try {
      await finish()
      toast.success(t("onboarding.done.publishedToast"))
      navigate(brandPath(brandCore.id, "/create"))
    } catch (error) {
      if (error instanceof ApiError && error.code === "brandIncomplete") {
        toast.error(t("onboarding.done.incomplete"))
      } else {
        toast.error(t("onboarding.done.publishFailed"))
      }
    } finally {
      setPublishing(false)
    }
  }

  return (
    <OnboardingShell
      step="done"
      title={t("onboarding.done.title", { name: brandCore.document.identity.name })}
      description={t("onboarding.done.description")}
      onContinue={() => void publish()}
      continueLabel={published ? t("onboarding.done.ctaCreate") : t("onboarding.done.cta")}
      busy={publishing || drawing}
      onBack={onBack}
      wide
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <BrandCard document={brandCore.document} assets={brandCore.assets} />
        </motion.div>

        <div className="space-y-5">
          <ul className="space-y-2" aria-label={t("onboarding.done.summaryAria")}>
            {["colors", "fonts", "voice", "logo"].map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="text-muted-foreground">{t(`onboarding.done.summary.${key}`)}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">{t("onboarding.done.nextTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {t("onboarding.done.nextBody")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {published && (
              <Button variant="outline" size="sm" onClick={() => navigate(brandPath(brandCore.id, "/create"))}>
                <Sparkles /> {t("onboarding.done.ctaCreate")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(stepHref(brandCore.id, "identity"))}
            >
              <Settings2 /> {t("onboarding.done.edit")}
            </Button>
          </div>

          {drawing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("onboarding.done.drawing")}
            </p>
          )}

          {publishing && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t("onboarding.done.publishing")}
            </p>
          )}
        </div>
      </div>
    </OnboardingShell>
  )
}
