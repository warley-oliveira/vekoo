import { useTranslation } from "react-i18next"

import { useBrandFont } from "@/components/brand/use-brand-font"
import { firstColor, type BrandAsset, type BrandDocument } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

// O "cartão da marca": a marca tomando forma com o que já foi preenchido.
// Lê o documento direto — cores, fontes, voz — e nunca inventa: o que falta
// aparece como espaço reservado, em tom de interface, para a pessoa ver o
// buraco e não uma marca de mentira.

type BrandCardProps = {
  document: BrandDocument
  assets: BrandAsset[]
  className?: string
}

export function BrandCard({ document, assets, className }: BrandCardProps) {
  const { t } = useTranslation()
  const { identity, palette, typography, voice, styles } = document
  const colors = palette.colors

  const dark = firstColor(colors, "darkBackground")?.hex
  const light = firstColor(colors, "lightBackground")?.hex
  const textOnDark = firstColor(colors, "textOnDark")?.hex
  const textOnLight = firstColor(colors, "textOnLight")?.hex
  const accent = firstColor(colors, "accent")?.hex
  const muted = firstColor(colors, "muted")?.hex

  const displayFont = useBrandFont(typography.display, assets)
  const utilityFont = useBrandFont(typography.utility, assets)

  const title = styles.roles.find((r) => r.key === "title")
  const kicker = styles.roles.find((r) => r.key === "kicker")

  const logoDark = assets.find((a) => a.kind === "logo" && a.variant === "dark")
  const logoLight = assets.find((a) => a.kind === "logo" && a.variant === "light")

  // Sem cor da marca, o cartão usa os neutros da interface — nunca uma cor
  // inventada que pareça escolha da pessoa.
  const darkBg = dark ?? "var(--foreground)"
  const darkInk = textOnDark ?? "var(--background)"
  const lightBg = light ?? "var(--card)"
  const lightInk = textOnLight ?? "var(--foreground)"
  const accentInk = accent ?? "var(--primary)"
  const mutedInk = muted ?? "var(--muted-foreground)"

  const validColors = colors.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex))

  return (
    <div
      className={cn("overflow-hidden rounded-xl border shadow-xs", className)}
      aria-label={t("brand.card.title")}
    >
      {/* Metade escura: capa */}
      <div
        className="flex aspect-[4/3] flex-col justify-between p-5"
        style={{ backgroundColor: darkBg, color: darkInk }}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            className="text-[11px] font-semibold tracking-[0.14em] uppercase"
            style={{
              color: accentInk,
              fontFamily: kicker?.font === "display" ? displayFont : utilityFont,
            }}
          >
            {identity.segment || t("brand.card.noSegment")}
          </p>
          {logoDark && (
            <img
              src={logoDark.url}
              alt=""
              className="max-h-8 max-w-24 object-contain"
            />
          )}
        </div>
        <div className="space-y-2">
          <h3
            className="text-balance leading-[1.05]"
            style={{
              fontFamily: displayFont,
              fontWeight: title?.weight ?? 700,
              fontSize: "clamp(1.4rem, 2.6vw, 2rem)",
              textTransform: title?.transform === "uppercase" ? "uppercase" : undefined,
            }}
          >
            {identity.name || t("brand.card.untitled")}
          </h3>
          <p
            className="text-sm leading-snug opacity-90"
            style={{ fontFamily: utilityFont }}
          >
            {identity.concept || t("brand.card.noConcept")}
          </p>
        </div>
      </div>

      {/* Metade clara: voz, paleta, fontes */}
      <div
        className="space-y-4 p-5"
        style={{ backgroundColor: lightBg, color: lightInk, fontFamily: utilityFont }}
      >
        <div>
          <p className="text-[11px] font-medium tracking-wide uppercase" style={{ color: mutedInk }}>
            {t("brand.card.voice")}
          </p>
          <p className="mt-1 text-sm leading-snug">
            {voice.essence ? `“${voice.essence}”` : t("brand.card.noVoice")}
          </p>
          {voice.tones.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("brand.voice.tones")}>
              {voice.tones.map((tone) => (
                <li
                  key={tone}
                  className="rounded-full border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: accentInk, color: accentInk }}
                >
                  {t(`brand.voice.toneOptions.${tone}`)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide uppercase" style={{ color: mutedInk }}>
              {t("brand.card.palette")}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {validColors.length === 0 ? (
                <li className="h-5 w-5 rounded-full border border-dashed" aria-hidden />
              ) : (
                validColors.map((color) => (
                  <li
                    key={color.id}
                    className="size-5 rounded-full border border-black/10"
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  />
                ))
              )}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide uppercase" style={{ color: mutedInk }}>
              {t("brand.card.fonts")}
            </p>
            <p className="mt-1 truncate text-base leading-tight" style={{ fontFamily: displayFont, fontWeight: 700 }}>
              {typography.display.family || t("brand.card.display")}
            </p>
            <p className="truncate text-sm" style={{ fontFamily: utilityFont }}>
              {typography.utility.family || t("brand.card.utility")}
            </p>
          </div>
        </div>

        {logoLight && (
          <img src={logoLight.url} alt="" className="max-h-8 max-w-28 object-contain" />
        )}
      </div>
    </div>
  )
}
