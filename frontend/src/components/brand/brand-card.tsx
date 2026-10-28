import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useBrandFont } from "@/components/brand/use-brand-font"
import { firstColor, logoAsset, type BrandAsset, type BrandColor, type BrandDocument, type BrandLogo } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

// O "cartão da marca": a marca tomando forma com o que já foi preenchido.
// Só leitura — as ações (baixar, trocar, regenerar a logo) moram no editor da
// Identidade. Lê o documento direto e nunca inventa: seção vazia não aparece.
//
// Duas metades com donos diferentes. O topo é a **obra**: a única parte da
// plataforma pintada com as cores e a fonte do cliente, que entram como
// variáveis CSS inline. O corpo é **chrome** da Vekoo — os dados da marca na
// tinta do site (`--vk-*`); a cor dela só aparece onde ela é o assunto, na
// faixa da paleta.

type BrandCardProps = {
  document: BrandDocument
  assets: BrandAsset[]
  /** As logos da marca: a principal entra no topo da prévia. */
  logos?: BrandLogo[]
  className?: string
}

const HEX = /^#[0-9a-fA-F]{6}$/
/** Quanto tempo o "✓ copiado" fica na linha da paleta. */
const COPIED_MS = 1500

export function BrandCard({ document, assets, logos, className }: BrandCardProps) {
  const { t } = useTranslation()
  const { identity, palette, typography, voice, styles } = document
  const colors = palette.colors.filter((c) => HEX.test(c.hex))

  const displayFont = useBrandFont(typography.display, assets)
  const utilityFont = useBrandFont(typography.utility, assets)

  const title = styles.roles.find((r) => r.key === "title")
  // A prévia é fundo escuro: a variante escura da principal, senão a clara.
  const primary = logos?.find((logo) => logo.primary)
  const previewLogo = primary
    ? logoAsset({ assets }, primary, "dark")
    : assets.find((a) => a.kind === "logo" && a.variant === "dark")

  const brandInk = {
    "--brand-surface": firstColor(colors, "darkBackground")?.hex,
    "--brand-ink": firstColor(colors, "textOnDark")?.hex,
  } as CSSProperties

  const fonts = [
    { role: "display", family: typography.display.family, font: displayFont, weight: title?.weight ?? 700 },
    { role: "utility", family: typography.utility.family, font: utilityFont, weight: 400 },
  ].filter((entry) => entry.family)

  const hasVoice = Boolean(voice.essence) || voice.tones.length > 0

  return (
    <article
      className={cn("@container overflow-hidden rounded-[4px] border border-vk-border bg-vk-surface", className)}
      aria-label={t("brand.card.title")}
    >
      {/* Topo: a prévia, nas cores do cliente. Sem cor ainda, a tinta do site
          — nunca uma cor inventada que pareça escolha da pessoa. */}
      <div
        className="flex min-h-64 flex-col justify-between gap-8 bg-[var(--brand-surface,var(--vk-fg))] p-6 text-[var(--brand-ink,var(--vk-bg))]"
        style={brandInk}
      >
        <div className="flex min-h-7 items-center">
          {previewLogo ? (
            <img src={previewLogo.url} alt="" className="max-h-7 max-w-40 object-contain object-left" />
          ) : (
            <p className="font-mono text-[11px] tracking-[0.08em] uppercase opacity-75">{t("brand.card.previewLabel")}</p>
          )}
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

      {(colors.length > 0 || hasVoice || fonts.length > 0) && (
        <div className="space-y-6 p-6">
          {colors.length > 0 && (
            <CardBlock label={t("brand.card.palette")}>
              <PaletteStrip colors={colors} />
            </CardBlock>
          )}

          {hasVoice && (
            <CardBlock label={t("brand.card.voice")}>
              {voice.essence && <p className="text-sm leading-relaxed text-pretty">“{voice.essence}”</p>}
              {voice.tones.length > 0 && (
                <ul className={cn("flex flex-wrap gap-1.5", voice.essence && "mt-3")} aria-label={t("brand.voice.tones")}>
                  {voice.tones.map((tone) => (
                    <li key={tone} className="rounded-full border border-vk-border-strong px-2.5 py-0.5 font-mono text-[11px]">
                      {t(`brand.voice.toneOptions.${tone}`)}
                    </li>
                  ))}
                </ul>
              )}
            </CardBlock>
          )}

          {fonts.length > 0 && (
            <CardBlock label={t("brand.card.fonts")}>
              <ul className="grid grid-cols-2 gap-3">
                {fonts.map((entry) => (
                  <li key={entry.role} className="min-w-0">
                    {/* A fonte mostrada nela mesma: "Aa" diz mais do que o nome. */}
                    <div className="grid aspect-square place-items-center rounded-[2px] border border-vk-border bg-vk-faint">
                      <span className="text-5xl leading-none" style={{ fontFamily: entry.font, fontWeight: entry.weight }} aria-hidden>
                        {t("brand.card.specimen")}
                      </span>
                    </div>
                    {/* O nome inteiro, quebrando linha se precisar — cortado ele
                        deixa de ser o nome da fonte. */}
                    <p className="mt-2 text-sm leading-snug break-words [overflow-wrap:anywhere]">{entry.family}</p>
                    <p className="font-mono text-[11px] tracking-[0.08em] text-vk-muted uppercase">
                      {t(`brand.card.fontRoles.${entry.role}`)}
                    </p>
                  </li>
                ))}
              </ul>
            </CardBlock>
          )}
        </div>
      )}
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

/**
 * A paleta como faixa: todas as cores lado a lado, separadas por 1px. A que
 * está sob o ponteiro (ou o foco) alarga e a linha de baixo diz o hex e o
 * papel; o clique copia o hex. Sem nada em foco, a linha ensina o gesto.
 */
function PaletteStrip({ colors }: { colors: BrandColor[] }) {
  const { t } = useTranslation()
  const [active, setActive] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy(color: BrandColor) {
    try {
      await navigator.clipboard.writeText(color.hex.toUpperCase())
      window.clearTimeout(timer.current)
      setCopied(color.id)
      timer.current = window.setTimeout(() => setCopied(null), COPIED_MS)
    } catch {
      toast.error(t("brand.card.copyFailed"))
    }
  }

  const describe = (color: BrandColor) => `${color.hex.toUpperCase()} · ${t(`brand.colors.roles.${color.role}`)}`
  const shown = colors.find((c) => c.id === active)
  const line = copied ? t("brand.card.copied") : shown ? describe(shown) : t("brand.card.paletteHint", { count: colors.length })

  return (
    <div>
      {/* O fundo da faixa é o filete de 1px entre as cores. */}
      <div className="flex h-8 gap-px overflow-hidden rounded-[2px] bg-vk-border" role="group" aria-label={t("brand.card.palette")}>
        {colors.map((color) => (
          <button
            key={color.id}
            type="button"
            onClick={() => void copy(color)}
            onPointerEnter={() => setActive(color.id)}
            onPointerLeave={() => setActive((current) => (current === color.id ? null : current))}
            onFocus={() => setActive(color.id)}
            onBlur={() => setActive((current) => (current === color.id ? null : current))}
            aria-label={t("brand.card.copyColor", { color: describe(color) })}
            className={cn(
              "h-full min-w-0 flex-1 cursor-copy bg-[var(--swatch)] outline-none",
              "transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none",
              // O foco em duas tintas: aparece sobre cor clara e sobre escura.
              "focus-visible:shadow-[inset_0_0_0_2px_var(--vk-fg),inset_0_0_0_4px_var(--vk-bg)]",
              active === color.id && "flex-[1.6]"
            )}
            style={{ "--swatch": color.hex } as CSSProperties}
          />
        ))}
      </div>
      <p className="mt-2 min-h-4 font-mono text-[11px] text-vk-muted" aria-live="polite">
        {line}
      </p>
    </div>
  )
}
