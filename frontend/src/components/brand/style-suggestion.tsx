import { useState } from "react"
import { useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { Loader2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useBrandCore, useBrandCoreMutations } from "@/hooks/use-brand-core"
import { useActiveBrand } from "@/lib/brand-context"
import { stepHref } from "@/lib/brand-core"

const DISMISS_KEY = "vekoo.brand.styleSuggestion"

/**
 * O estilo que a busca de referências deduziu para a marca publicada antes do
 * campo "Estilo da marca". Confirmar grava o estilo no rascunho — a busca já
 * usa o deduzido, e ele entra na marca na próxima publicação; trocar abre a
 * etapa de identidade, onde o estilo se escolhe. Dá para deixar para depois
 * até a próxima sessão do navegador.
 */
export function StyleSuggestion() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { brandId } = useActiveBrand()
  const { brandCore } = useBrandCore(brandId)
  const { saveSection } = useBrandCoreMutations(brandId)
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(`${DISMISS_KEY}.${brandId}`) === "1"
    } catch {
      return false
    }
  })

  const suggestion = brandCore?.styleSuggestion
  if (!brandCore || !suggestion || dismissed) return null

  const primary = t(`taxonomy.archetypes.${suggestion.primary}.label`)
  const secondary = suggestion.secondary ? t(`taxonomy.archetypes.${suggestion.secondary}.label`) : null

  async function confirm() {
    if (!brandCore || !suggestion) return
    setSaving(true)
    try {
      await saveSection("identity", {
        ...brandCore.document.identity,
        archetypes: { primary: suggestion.primary, secondary: suggestion.secondary ?? "" },
      })
      toast.success(t("brand.styleSuggestion.confirmed"))
    } catch {
      toast.error(t("brand.styleSuggestion.failed"))
    } finally {
      setSaving(false)
    }
  }

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(`${DISMISS_KEY}.${brandId}`, "1")
    } catch {
      /* armazenamento indisponível: some só nesta tela */
    }
  }

  return (
    <aside className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3" aria-label={t("brand.styleSuggestion.title")}>
      <Sparkles className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {secondary
            ? t("brand.styleSuggestion.titleTwo", { primary, secondary })
            : t("brand.styleSuggestion.titleOne", { primary })}
        </p>
        <p className="text-sm text-muted-foreground">{t("brand.styleSuggestion.description")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => void confirm()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {t("brand.styleSuggestion.confirm")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate(stepHref(brandId, "identity"))} disabled={saving}>
          {t("brand.styleSuggestion.change")}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={dismiss} aria-label={t("brand.styleSuggestion.dismiss")} disabled={saving}>
          <X />
        </Button>
      </div>
    </aside>
  )
}
