import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { Check } from "lucide-react"

import { BrandPreview } from "@/components/onboarding/brand-preview"
import { firstColor, type BrandAsset, type BrandDocument } from "@/lib/brand-core"
import { ensureCatalogFont, findOpenFont, fontStack } from "@/lib/font-catalog"
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
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type OptionPickerProps = {
  kind: SuggestKind
  items: SuggestOption[]
  /** Logo: direções de símbolo ainda a caminho (cada uma vira dois arranjos). */
  pending?: number
  /** Logo: direções de símbolo que não saíram. */
  failed?: number
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
export function OptionPicker({ kind, items, pending = 0, failed = 0, document, assets, chosen, disabled, onChoose }: OptionPickerProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const settled = chosen !== null
  const fixed = kind === "fonts" ? fixedFontRole(items) : null
  // O índice é o da lista inteira: é ele que vai na escolha.
  const indexed = items.map((option, index) => ({ option, index }))
  const concepts = indexed.filter(({ option }) => isWordmarkOption(option) && option.concept)

  function renderOption({ option, index }: { option: SuggestOption; index: number }, position: number) {
    const selected = chosen === index
    return (
      <motion.li
        key={index}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: settled && !selected ? 0.45 : 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut", delay: reduced || settled ? 0 : position * 0.06 }}
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
            <FontsCard option={option} document={document} fixed={fixed} />
          ) : (
            <VoiceCard option={option as VoiceOption} />
          )}
        </button>
      </motion.li>
    )
  }

  // A logo com símbolo chega depois do logotipo só com o nome: dois grupos,
  // e o lugar de quem ainda está sendo desenhado.
  if (kind === "wordmark" && (concepts.length > 0 || pending > 0 || failed > 0)) {
    const nameOnly = indexed.filter(({ option }) => !(isWordmarkOption(option) && option.concept))
    return (
      <div className="space-y-4">
        <section className="space-y-2" aria-busy={pending > 0}>
          <h4 className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
            {t("onboarding.options.logoConcepts.title")}
          </h4>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("onboarding.options.logoConcepts.title")}>
            {concepts.map(renderOption)}
            {Array.from({ length: pending * 2 }, (_, slot) => (
              <li key={`pending-${slot}`} className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-1.5">
                <Skeleton className="aspect-[3/2] w-full rounded-lg motion-reduce:animate-none" />
                <p className="px-1.5 pb-1.5 text-xs text-muted-foreground">{t("onboarding.options.logoConcepts.drawing")}</p>
              </li>
            ))}
          </ul>
          {failed > 0 && pending === 0 && (
            <p className="text-xs text-muted-foreground">{t("onboarding.options.logoConcepts.failed", { count: failed })}</p>
          )}
        </section>
        <section className="space-y-2">
          <h4 className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
            {t("onboarding.options.logoConcepts.nameOnly")}
          </h4>
          <ul className="grid gap-3 sm:grid-cols-3" aria-label={t("onboarding.options.logoConcepts.nameOnly")}>
            {nameOnly.map(renderOption)}
          </ul>
        </section>
      </div>
    )
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-3" aria-label={t(`onboarding.options.${kind}`)}>
      {indexed.map(renderOption)}
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
      {option.concept ? (
        <Why
          title={t("onboarding.options.logoConcepts.label", {
            direction: t(`onboarding.options.logoConcepts.directions.${option.concept.direction}`),
            arrangement: t(`onboarding.options.logoConcepts.arrangements.${option.concept.arrangement}`),
          })}
          why={option.concept.arrangement === "horizontal" ? (option.concept.idea ?? null) : null}
        />
      ) : (
        option.style && <Why title={t(`brand.logo.styles.${option.style}`)} why={null} />
      )}
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

type FontRole = "display" | "utility"

/**
 * O par como amostra de letra, não como mini-carrossel: o nome dela grande na
 * fonte de título, o que ela vende na fonte de texto, sobre o fundo escuro da
 * paleta dela. Embaixo, cada papel com o nome da família escrito nela mesma —
 * é isso que se compara entre as três. O papel que já era dela (`fixed`) fica
 * apagado: só o outro muda de uma proposta para a outra.
 */
function FontsCard({ option, document, fixed }: { option: FontsOption; document: BrandDocument; fixed: FontRole | null }) {
  const { t } = useTranslation()
  const { display, utility } = option

  useEffect(() => {
    ensureCatalogFont(display.family, display.weights)
    ensureCatalogFont(utility.family, utility.weights)
  }, [display.family, display.weights, utility.family, utility.weights])

  const colors = document.palette.colors
  const surface = {
    backgroundColor: firstColor(colors, "darkBackground")?.hex,
    color: firstColor(colors, "textOnDark")?.hex,
  }
  const displayStack = fontStack(display.family, display.category)
  const utilityStack = fontStack(utility.family, utility.category)

  return (
    <>
      {/* Cantos retos por dentro: é a obra. Sem paleta ainda, o escuro da interface. */}
      <div
        className="flex aspect-[4/3] min-h-0 flex-col justify-end gap-2 overflow-hidden bg-foreground p-4 text-background"
        style={surface}
      >
        <p
          className="line-clamp-3 text-[1.625rem] leading-[1.02] text-balance hyphens-auto [overflow-wrap:anywhere]"
          style={{ fontFamily: displayStack, fontWeight: Math.max(...display.weights) }}
        >
          {document.identity.name || t("onboarding.preview.name")}
        </p>
        <p className="line-clamp-2 text-xs leading-snug opacity-75" style={{ fontFamily: utilityStack }}>
          {document.identity.concept || t("onboarding.preview.concept")}
        </p>
      </div>
      <dl className="grid gap-1 px-1.5 pt-0.5">
        {(["display", "utility"] as const).map((role) => {
          const font = option[role]
          return (
            <div
              key={role}
              className={cn("flex items-baseline justify-between gap-3", fixed === role && "text-muted-foreground")}
            >
              <dt className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {t(`onboarding.options.roles.${role}`)}
              </dt>
              <dd
                className="min-w-0 truncate text-sm"
                style={{ fontFamily: role === "display" ? displayStack : utilityStack }}
                title={font.family}
              >
                {font.family}
              </dd>
            </div>
          )
        })}
      </dl>
      <Why why={option.why} />
    </>
  )
}

/** O papel que é o mesmo nas três propostas — a fonte que ela já tinha. */
function fixedFontRole(items: SuggestOption[]): FontRole | null {
  const pairs = items.filter(isFontsOption)
  if (pairs.length < 2) return null
  return (
    (["display", "utility"] as const).find((role) =>
      pairs.every((pair) => pair[role].family === pairs[0][role].family)
    ) ?? null
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
      <span style={{ fontFamily: fontStack(display, findOpenFont(display)?.category) }}>{display}</span>
      {" + "}
      <span style={{ fontFamily: fontStack(utility, findOpenFont(utility)?.category) }}>{utility}</span>
    </span>
  )
}
