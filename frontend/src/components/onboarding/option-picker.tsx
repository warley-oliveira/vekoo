import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { Check } from "lucide-react"

import { BrandPreview } from "@/components/onboarding/brand-preview"
import type { BrandAsset, BrandDocument } from "@/lib/brand-core"
import { ensureCatalogFont, findCatalogFont, fontStack } from "@/lib/font-catalog"
import {
  isFontsOption,
  isPaletteOption,
  isWordmarkOption,
  type FontsOption,
  type PaletteOption,
  type SuggestKind,
  type SuggestOption,
  type VoiceOption,
  type WordmarkOption,
} from "@/lib/onboarding"
import { cn } from "@/lib/utils"

type OptionPickerProps = {
  kind: SuggestKind
  items: SuggestOption[]
  document: BrandDocument
  /** Os arquivos da marca — o logotipo proposto já é um deles. */
  assets: BrandAsset[]
  /** A que a pessoa escolheu — as outras ficam apagadas, a escolha fica marcada. */
  chosen: number | null
  disabled?: boolean
  onChoose: (index: number) => void
}

/**
 * As propostas do "não sei — cria pra mim", dentro da conversa.
 *
 * Cada uma é a marca **aplicada** — o nome dela com aquela paleta, naquela
 * fonte —, não uma fileira de bolinhas: quem pediu para a plataforma propor
 * não consegue imaginar o resultado a partir de um hex. A escolha é um clique,
 * e vira fala dela na conversa.
 */
export function OptionPicker({ kind, items, document, assets, chosen, disabled, onChoose }: OptionPickerProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const settled = chosen !== null

  return (
    <ul className="grid gap-3 sm:grid-cols-3" aria-label={t(`onboarding.options.${kind}`)}>
      {items.map((option, index) => {
        const selected = chosen === index
        return (
          <motion.li
            key={index}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: settled && !selected ? 0.45 : 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut", delay: reduced || settled ? 0 : index * 0.06 }}
          >
            <button
              type="button"
              onClick={() => onChoose(index)}
              disabled={disabled || settled}
              aria-pressed={selected}
              className={cn(
                "relative flex h-full w-full flex-col gap-2 rounded-xl border bg-card p-1.5 text-left outline-none transition-[border-color,box-shadow]",
                "focus-visible:ring-3 focus-visible:ring-ring/50 enabled:hover:border-primary/60 enabled:active:scale-[0.99]",
                selected ? "border-primary ring-3 ring-ring/30" : "border-border"
              )}
            >
              {selected && (
                <span className="absolute top-3 right-3 z-10 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" aria-hidden />
                </span>
              )}
              {isWordmarkOption(option) ? (
                <WordmarkCard option={option} assets={assets} />
              ) : isPaletteOption(option) ? (
                <PaletteCard option={option} document={document} />
              ) : isFontsOption(option) ? (
                <FontsCard option={option} document={document} />
              ) : (
                <VoiceCard option={option as VoiceOption} />
              )}
            </button>
          </motion.li>
        )
      })}
    </ul>
  )
}

function Why({ title, why }: { title?: string; why: string | null }) {
  if (!title && !why) return null
  return (
    <div className="space-y-0.5 px-1.5 pb-1.5">
      {title && <p className="text-sm font-medium">{title}</p>}
      {why && <p className="text-xs text-muted-foreground text-pretty">{why}</p>}
    </div>
  )
}

/**
 * O logotipo nas duas versões: no claro e no escuro, como vai aparecer nas
 * peças. O fundo escuro é da marca (a tinta do texto claro é dela também).
 */
function WordmarkCard({ option, assets }: { option: WordmarkOption; assets: BrandAsset[] }) {
  const { t } = useTranslation()
  const light = assets.find((asset) => asset.logoId === option.logoId && asset.variant === "light")
  const dark = assets.find((asset) => asset.logoId === option.logoId && asset.variant === "dark")
  return (
    <>
      <span className="grid aspect-[3/2] place-items-center overflow-hidden rounded-lg bg-background p-3">
        {light && <img src={light.url} alt="" className="max-h-full max-w-full object-contain" />}
      </span>
      {dark && (
        <span className="grid h-12 place-items-center overflow-hidden rounded-lg bg-foreground px-3">
          <img src={dark.url} alt="" className="max-h-7 max-w-full object-contain" />
        </span>
      )}
      {option.style && <Why title={t(`brand.logo.styles.${option.style}`)} why={null} />}
    </>
  )
}

function PaletteCard({ option, document }: { option: PaletteOption; document: BrandDocument }) {
  return (
    <>
      <BrandPreview
        name={document.identity.name}
        concept={document.identity.concept}
        colors={option.colors}
        display={document.typography.display.family}
        utility={document.typography.utility.family}
      />
      <Why title={option.name} why={option.why} />
    </>
  )
}

function FontsCard({ option, document }: { option: FontsOption; document: BrandDocument }) {
  return (
    <>
      <BrandPreview
        name={document.identity.name}
        concept={document.identity.concept}
        colors={document.palette.colors}
        display={option.display.family}
        utility={option.utility.family}
      />
      <Why title={`${option.display.family} + ${option.utility.family}`} why={option.why} />
    </>
  )
}

function VoiceCard({ option }: { option: VoiceOption }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col justify-between gap-3 p-2.5">
      <p className="font-heading text-base leading-snug text-balance">“{option.essence}”</p>
      <div className="space-y-1.5">
        {option.why && <p className="text-xs text-muted-foreground text-pretty">{option.why}</p>}
        <p className="font-mono text-[11px] text-muted-foreground">
          {option.tones.map((tone) => t(`brand.voice.toneOptions.${tone}`)).join(" · ")}
        </p>
      </div>
    </div>
  )
}

/** A escolha como fala da pessoa: a proposta em miniatura, não um "escolhi a 2". */
export function ChoiceEcho({ option, assets }: { option: SuggestOption; assets: BrandAsset[] }) {
  if (isWordmarkOption(option)) {
    const light = assets.find((asset) => asset.logoId === option.logoId && asset.variant === "light")
    return light ? <img src={light.url} alt="" className="h-8 max-w-48 object-contain" /> : null
  }
  if (isPaletteOption(option)) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex" aria-hidden>
          {option.colors.slice(0, 5).map((color) => (
            // Cantos retos: é a obra dela.
            <span key={color.id} className="size-4" style={{ backgroundColor: color.hex }} />
          ))}
        </span>
        {option.name}
      </span>
    )
  }
  if (isFontsOption(option)) return <FontPair display={option.display.family} utility={option.utility.family} />
  return <span>“{(option as VoiceOption).essence}”</span>
}

/** "Fraunces + Inter", cada nome na própria fonte. */
export function FontPair({ display, utility }: { display: string; utility: string }) {
  useEffect(() => {
    if (display) ensureCatalogFont(display)
    if (utility) ensureCatalogFont(utility)
  }, [display, utility])

  return (
    <span>
      <span style={{ fontFamily: fontStack(display, findCatalogFont(display)?.category) }}>{display}</span>
      {" + "}
      <span style={{ fontFamily: fontStack(utility, findCatalogFont(utility)?.category) }}>{utility}</span>
    </span>
  )
}
