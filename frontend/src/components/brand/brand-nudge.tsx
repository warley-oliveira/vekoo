import { useState } from "react"
import { useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { MessageCircle, Palette, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useOnboardingThread } from "@/hooks/use-onboarding"
import { useActiveBrand } from "@/lib/brand-context"
import { stepHref } from "@/lib/brand-core"
import { needsOnboarding, onboardingHref, QUESTION_COUNT } from "@/lib/onboarding"

const DISMISS_KEY = "vekoo.brand.nudge"

/**
 * O lembrete de que a marca ainda não gera conteúdo. Some ao publicar; a
 * pessoa pode dispensar até a próxima sessão do navegador.
 *
 * Marca pela metade do onboarding ganha o card de retomar no lugar — esse não
 * se dispensa: sem fechar a conversa, a marca não gera nada.
 */
export function BrandNudge() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { brandId } = useActiveBrand()
  const { brandCore } = useBrandCore(brandId)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      return false
    }
  })

  if (!brandCore || brandCore.readyForGeneration) return null
  if (needsOnboarding({ onboardingDone: brandCore.onboarding.done, status: brandCore.status })) {
    return <OnboardingResume brandId={brandId} />
  }
  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* armazenamento indisponível: some só nesta tela */
    }
  }

  return (
    <aside className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-accent/40 px-4 py-3" aria-label={t("brand.nudge.title")}>
      <Palette className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("brand.nudge.title")}</p>
        <p className="text-sm text-muted-foreground">{t("brand.nudge.description")}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={() => navigate(stepHref(brandId, brandCore.progress.lastStep ?? "identity"))}>
          {t("brand.nudge.cta")}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={dismiss} aria-label={t("brand.nudge.dismiss")}>
          <X />
        </Button>
      </div>
    </aside>
  )
}

/** "Sua marca está pela metade": a pergunta onde a conversa parou e o caminho de volta a ela. */
function OnboardingResume({ brandId }: { brandId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { thread } = useOnboardingThread(brandId)
  const started = Boolean(thread?.conversationId)

  return (
    <aside className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-accent/40 px-4 py-3" aria-label={t("onboarding.resumeCard.title")}>
      <MessageCircle className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("onboarding.resumeCard.title")}</p>
        {thread ? (
          <p className="text-sm text-muted-foreground">
            {started
              ? t("onboarding.resumeCard.position", { current: thread.state.position, total: thread.state.total })
              : t("onboarding.resumeCard.notStarted", { count: QUESTION_COUNT })}
          </p>
        ) : (
          <Skeleton className="mt-1 h-4 w-full max-w-72" />
        )}
      </div>
      <Button size="sm" onClick={() => navigate(onboardingHref(brandId))}>
        {t(started ? "onboarding.resumeCard.continue" : "onboarding.resumeCard.start")}
      </Button>
    </aside>
  )
}
