import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { useBrandFont } from "@/components/brand/use-brand-font"
import { firstColor, logoAsset, type BrandAsset, type BrandDocument, type BrandLogo } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

// O "cartão da marca": a marca tomando forma com o que já foi preenchido.
// Lê o documento direto — cores, fontes, voz — e nunca inventa: o que falta
// aparece como espaço reservado, em tom de interface, para a pessoa ver o
// buraco e não uma marca de mentira.
//
// Duas metades com donos diferentes. O topo é a **obra**: a única parte da
// plataforma pintada com as cores e a fonte do cliente. O corpo é **chrome**
// da Vekoo — os dados da marca descritos na tinta do site, sem a cor dela
// vazar para pill, borda ou rótulo.

type BrandCardProps = {
  document: BrandDocument
  assets: BrandAsset[]
  /** As logos da marca: a principal entra no topo da prévia. */
  logos?: BrandLogo[]
  /** O bloco da logo com as ações (só na tela da marca), entre a prévia e a voz. */
  logoSlot?: ReactNode
  className?: string
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function BrandCard({ document, assets, logos, logoSlot, className }: BrandCardProps) {
  const { t } = useTranslation()
  const { identity, palette, typography, voice, styles } = document
  const colors = palette.colors

  const dark = firstColor(colors, "darkBackground")?.hex
  const textOnDark = firstColor(colors, "textOnDark")?.hex
  const accent = firstColor(colors, "accent")?.hex

  const displayFont = useBrandFont(typography.display, assets)
  const utilityFont = useBrandFont(typography.utility, assets)

  const title = styles.roles.find((r) => r.key === "title")
  // A prévia é fundo escuro: a variante escura da principal, senão a clara.
  const primary = logos?.find((logo) => logo.primary)
  const previewLogo = primary
    ? logoAsset({ assets }, primary, "dark")
    : assets.find((a) => a.kind === "logo" && a.variant === "dark")

  const validColors = colors.filter((c) => HEX.test(c.hex))

  return (
    <article
      className={cn("@container overflow-hidden rounded-vk border border-vk-border bg-vk-surface", className)}
      aria-label={t("brand.card.title")}
    >
      {/* Topo: a prévia, nas cores do cliente. Sem cor ainda, a tinta do site
          — nunca uma cor inventada que pareça escolha da pessoa. */}
      <div
        className="flex min-h-64 flex-col justify-between gap-8 p-6"
        style={{ backgroundColor: dark ?? "var(--vk-fg)", color: textOnDark ?? "var(--vk-bg)" }}
      >
        <div className="flex min-h-7 items-center justify-between gap-3">
          {/* Com logo, ela ocupa o canto — o rótulo só existe para não deixar
              o topo vazio. */}
          {previewLogo ? (
            <img src={previewLogo.url} alt="" className="max-h-7 max-w-40 object-contain object-left" />
          ) : (
            <p className="font-mono text-[11px] tracking-[0.08em] uppercase opacity-75">{t("brand.card.previewLabel")}</p>
          )}
          {accent && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />}
        </div>
        <div className="space-y-2">
          <h3
            className="text-[38px] leading-[1.05] text-balance break-words"
            style={{
              fontFamily: displayFont,
              fontWeight: title?.weight ?? 700,
              textTransform: title?.transform === "uppercase" ? "uppercase" : undefined,
            }}
          >
            {identity.name || t("brand.card.untitled")}
          </h3>
          <p className="text-sm leading-snug text-pretty opacity-85" style={{ fontFamily: utilityFont }}>
            {identity.concept || t("brand.card.noConcept")}
          </p>
        </div>
      </div>

      {/* Corpo: os dados do brandcore, no chrome da Vekoo. */}
      <div className="space-y-6 p-6">
        {logoSlot}
        <CardBlock label={t("brand.card.voice")}>
          <p className="text-sm leading-relaxed text-pretty">
            {voice.essence ? `“${voice.essence}”` : <Placeholder>{t("brand.card.noVoice")}</Placeholder>}
          </p>
          {voice.tones.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t("brand.voice.tones")}>
              {voice.tones.map((tone) => (
                <li key={tone} className="rounded-full border border-vk-border-strong px-2.5 py-0.5 font-mono text-[11px]">
                  {t(`brand.voice.toneOptions.${tone}`)}
                </li>
              ))}
            </ul>
          )}
        </CardBlock>

        {/* Paleta e fontes lado a lado só quando o cartão é largo — ele mora em
            colunas de larguras diferentes (marca, início, wizard). */}
        <div className="grid gap-6 @sm:grid-cols-2">
          <CardBlock label={t("brand.card.palette")}>
            {validColors.length === 0 ? (
              <Placeholder>{t("brand.card.noPalette")}</Placeholder>
            ) : (
              <ul className="space-y-2">
                {validColors.map((color) => (
                  <li key={color.id} className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="size-4 shrink-0 rounded-[3px] ring-1 ring-vk-border ring-inset"
                      style={{ backgroundColor: color.hex }}
                      aria-hidden
                    />
                    <span className="font-mono text-xs uppercase">{color.hex}</span>
                    {color.name && <span className="truncate text-xs text-vk-muted">{color.name}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardBlock>

          <CardBlock label={t("brand.card.fonts")}>
            <ul className="space-y-3">
              <FontLine family={typography.display.family} font={displayFont} weight={700} role={t("brand.card.fontRoles.display")} />
              <FontLine family={typography.utility.family} font={utilityFont} weight={400} role={t("brand.card.fontRoles.utility")} />
            </ul>
          </CardBlock>
        </div>
      </div>
    </article>
  )
}

function CardBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 font-mono text-[11px] tracking-[0.08em] text-vk-muted uppercase">{label}</h4>
      {children}
    </section>
  )
}

/** A fonte escrita nela mesma — é o jeito mais curto de mostrar como ela é. */
function FontLine({ family, font, weight, role }: { family: string; font: string; weight: number; role: string }) {
  const { t } = useTranslation()
  return (
    <li className="min-w-0">
      {family ? (
        <p className="truncate text-lg leading-tight" style={{ fontFamily: font, fontWeight: weight }}>
          {family}
        </p>
      ) : (
        <Placeholder>{t("brand.card.noFont")}</Placeholder>
      )}
      <p className="font-mono text-[11px] text-vk-muted">{role}</p>
    </li>
  )
}

function Placeholder({ children }: { children: ReactNode }) {
  return <span className="text-sm text-vk-muted">{children}</span>
}
