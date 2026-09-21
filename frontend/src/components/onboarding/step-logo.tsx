import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { OnboardingShell } from "@/components/onboarding/onboarding-shell"
import type { StepProps } from "@/components/onboarding/step-props"
import { Button } from "@/components/ui/button"
import { useBrandCoreMutations } from "@/hooks/use-brand-core"
import { formatBytes } from "@/lib/brand-core"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * A logo — e a saída para quem não tem uma, que é a maioria de quem começa.
 *
 * "Não tenho" não pula a pergunta: a Vekoo desenha um **logotipo
 * tipográfico** com o nome do negócio na fonte que ela vai escolher adiante.
 * É o mesmo libvips que desenha as peças, determinístico e regerável — não é
 * imagem gerada por IA, que sairia diferente a cada clique e não combinaria
 * com nada.
 *
 * O PNG enviado passa pela checagem de transparência real do servidor: um
 * logo com fundo branco chapado estraga toda peça de fundo escuro, e é melhor
 * a pessoa saber disso agora do que na primeira exportação.
 */
export function StepLogo({ brandCore, onAnswer, onSkip, onBack, busy }: StepProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { uploadAsset, deleteAsset } = useBrandCoreMutations(brandCore.id)
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const wants = brandCore.onboarding.wantsWordmark

  const logos = brandCore.assets.filter((asset) => asset.kind === "logo")
  const uploaded = logos.filter((asset) => !asset.generated)
  const generated = logos.filter((asset) => asset.generated)
  const opaque = uploaded.find((asset) => asset.transparent === false)

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      await uploadAsset("logo", "light", file)
      toast.success(t("onboarding.logo.uploaded"))
    } catch {
      toast.error(t("onboarding.logo.uploadFailed"))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ""
    }
  }


  return (
    <OnboardingShell
      step="logo"
      title={t("onboarding.logo.title")}
      description={t("onboarding.logo.description")}
      onContinue={() => onAnswer()}
      onSkip={onSkip}
      onBack={onBack}
      busy={busy}
    >
      <div className="space-y-5">
        <input
          ref={input}
          type="file"
          accept="image/png,image/svg+xml"
          className="sr-only"
          onChange={(event) => void upload(event.target.files?.[0])}
        />

        {logos.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center outline-none transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5 text-muted-foreground" />}
              <span className="text-sm font-medium">{t("onboarding.logo.uploadTitle")}</span>
              <span className="text-xs text-muted-foreground">{t("onboarding.logo.uploadHint")}</span>
            </button>

            <button
              type="button"
              onClick={() => onAnswer(undefined, { wantsWordmark: true })}
              aria-pressed={wants}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-6 text-center outline-none transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                wants && "border-primary ring-3 ring-ring/30"
              )}
            >
              <Sparkles className="size-5 text-primary" />
              <span className="text-sm font-medium">{t("onboarding.logo.drawTitle")}</span>
              <span className="text-xs text-muted-foreground">{t("onboarding.logo.drawHint")}</span>
            </button>
          </div>
        ) : (
          <ul className="space-y-2" aria-label={t("onboarding.logo.listAria")}>
            {logos.map((asset) => (
              <li key={asset.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className="grid size-14 shrink-0 place-items-center rounded-md border p-1.5"
                  style={{ backgroundColor: asset.variant === "dark" ? "#1c1a24" : "#faf8f5" }}
                >
                  <img src={asset.url} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {asset.generated ? t("onboarding.logo.generatedName") : asset.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`onboarding.logo.variant.${asset.variant ?? "light"}`)} · {formatBytes(asset.byteSize, language)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void deleteAsset(asset.id)}
                  aria-label={t("onboarding.logo.remove")}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {opaque && (
          <aside className="flex gap-2.5 rounded-lg border border-destructive/40 p-3 text-sm" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="font-medium">{t("onboarding.logo.opaqueTitle")}</p>
              <p className="text-muted-foreground">{t("onboarding.logo.opaqueBody")}</p>
            </div>
          </aside>
        )}

        {(generated.length > 0 || wants) && (
          <p className="text-xs text-muted-foreground">
            {generated.length > 0 ? t("onboarding.logo.generatedHint") : t("onboarding.logo.later")}
          </p>
        )}

        {logos.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={uploading}>
            <ImagePlus /> {t("onboarding.logo.replace")}
          </Button>
        )}
      </div>
    </OnboardingShell>
  )
}
