import { useState } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { Palette, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useBrandCore } from "@/hooks/use-brand-core"
import { useActiveBrand } from "@/lib/brand-context"
import { stepHref } from "@/lib/brand-core"

const DISMISS_KEY = "vekoo.brand.nudge"

/**
 * O lembrete de que a marca ainda não gera conteúdo. Some ao publicar; a
 * pessoa pode dispensar até a próxima sessão do navegador.
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

  if (!brandCore || brandCore.readyForGeneration || dismissed) return null

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
