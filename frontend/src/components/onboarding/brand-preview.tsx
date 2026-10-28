import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { ensureCatalogFont, findOpenFont, fontStack } from "@/lib/font-catalog"
import { firstColor, type BrandColor } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

type BrandPreviewProps = {
  name: string
  concept?: string
  colors: BrandColor[]
  display?: string
  utility?: string
  className?: string
}

/**
 * A prévia real de uma proposta: a marca aplicada, não uma fileira de
 * amostras de cor.
 *
 * A pessoa não está escolhendo hex nem nome de fonte — está escolhendo como o
 * negócio dela vai parecer. Uma proposta que só mostra bolinhas coloridas
 * obriga a imaginar o resultado, que é exatamente o que quem clicou em "não
 * sei" não consegue fazer.
 */
export function BrandPreview({ name, concept, colors, display, utility, className }: BrandPreviewProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (display) ensureCatalogFont(display)
    if (utility) ensureCatalogFont(utility)
  }, [display, utility])

  const dark = firstColor(colors, "darkBackground")?.hex ?? "#1c1a24"
  const light = firstColor(colors, "lightBackground")?.hex ?? "#f6f3ee"
  const onDark = firstColor(colors, "textOnDark")?.hex ?? "#f6f3ee"
  const onLight = firstColor(colors, "textOnLight")?.hex ?? "#1c1a24"
  const accent = firstColor(colors, "accent")?.hex ?? "#7c3aed"
  const muted = firstColor(colors, "muted")?.hex ?? onLight

  const displayStack = fontStack(display ?? "", findOpenFont(display ?? "")?.category)
  const utilityStack = fontStack(utility ?? "", findOpenFont(utility ?? "")?.category)

  return (
    <div className={cn("grid grid-cols-2 overflow-hidden rounded-lg", className)}>
      {/* Cantos retos por dentro: é a obra, e o Instagram não arredonda. */}
      <div className="flex aspect-[4/5] min-h-0 min-w-0 flex-col justify-between overflow-hidden p-3" style={{ backgroundColor: dark, color: onDark }}>
        <span
          className="text-[10px] font-semibold tracking-[0.14em] uppercase"
          style={{ color: accent, fontFamily: utilityStack }}
        >
          {t("onboarding.preview.kicker")}
        </span>
        <span
          className="line-clamp-4 text-base leading-[1.05] font-bold text-balance hyphens-auto [overflow-wrap:anywhere]"
          style={{ fontFamily: displayStack }}
        >
          {name || t("onboarding.preview.name")}
        </span>
      </div>
      <div className="flex aspect-[4/5] min-h-0 min-w-0 flex-col justify-between overflow-hidden p-3" style={{ backgroundColor: light, color: onLight }}>
        <p className="line-clamp-4 text-[11px] leading-snug" style={{ fontFamily: utilityStack }}>
          {concept || t("onboarding.preview.concept")}
        </p>
        <div className="space-y-2">
          <span className="block text-xl leading-none font-bold whitespace-nowrap" style={{ fontFamily: displayStack, color: accent }}>
            R$ 18
          </span>
          <span className="block text-[10px]" style={{ fontFamily: utilityStack, color: muted }}>
            {t("onboarding.preview.footer")}
          </span>
        </div>
      </div>
    </div>
  )
}
