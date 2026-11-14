import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ChevronDown, Crosshair, Redo2, Undo2, X } from "lucide-react"

import { LayoutThumb } from "@/components/piece-editor/layout-thumb"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { BrandAsset } from "@/lib/brand-core"
import type { RenderLegibility } from "@/lib/engines"
import { formatNumber } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import {
  COLOR_TOKENS,
  SIZE_STEPS,
  type ImageBlock,
  type LayoutSlot,
  type LogoBlock,
  type PieceDocument,
  type Slide,
  type TextBlock,
} from "@/lib/piece-document"
import type { Operation } from "@/lib/piece-operations"
import type { RenderLayout, RenderTheme } from "@/lib/piece-render"
import { cn } from "@/lib/utils"

/** O limite de legenda do Instagram — o mesmo do `PieceDocument::CAPTION_MAX`. */
const CAPTION_MAX = 2_200

type EditorPanelProps = {
  document: PieceDocument
  slide: Slide
  layout: RenderLayout
  layouts: RenderLayout[]
  theme: RenderTheme
  photos: Map<string, BrandAsset>
  selectedSlot: string | null
  focalSlot: string | null
  canUndo: boolean
  canRedo: boolean
  onApply: (operations: Operation[], group?: string) => void
  onSelect: (slot: string | null) => void
  onUndo: () => void
  onRedo: () => void
  onPickImage: (slot: string) => void
  onToggleFocal: (slot: string) => void
  /** A leitura do texto sobre a foto no último desenho desta lâmina. */
  legibility?: RenderLegibility | null
}

/** Do mais leve ao mais forte; `default` é o degradê do layout. */
const SCRIM_CHOICES = ["none", "light", "default", "strong"] as const

/**
 * O painel: os campos da lâmina ativa, na ordem dos slots do layout. É o
 * único lugar onde propriedades se editam — sem barra flutuante. O que é
 * desenho (fonte, cor exata, espaçamento) não aparece: vem da marca.
 */
export function EditorPanel(props: EditorPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { document, slide, layout, onApply } = props
  const blocks = new Map(slide.blocks.map((block) => [block.slot, block]))
  // O degradê só se escolhe onde ele existe: layout com camada de escurecimento
  // e foto de verdade na lâmina.
  const hasScrim = (layout.geometry[document.format] ?? layout.geometry.default ?? []).some((layer) => layer.kind === "scrim")
  const hasPhoto = slide.blocks.some((block) => block.type === "image" && block.visible && block.assetId)
  const scrimLevel = slide.scrim ?? "default"
  const index = document.slides.indexOf(slide)
  const last = document.slides.length - 1
  // Capa só na primeira lâmina, chamada final só na última; o resto, em qualquer uma.
  const compatible = props.layouts.filter(
    (candidate) =>
      candidate.formats.includes(document.format) &&
      (!candidate.position || (candidate.position === "first" && index === 0) || (candidate.position === "last" && index === last))
  )
  const interior = document.format === "carousel" && !layout.position
  const others = document.slides.filter((other) => {
    const contract = props.layouts.find((candidate) => candidate.id === other.layoutId)
    return other.id !== slide.id && !contract?.position && other.layoutId !== slide.layoutId
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-vk-border px-4 py-2">
        <p className="font-mono text-xs text-vk-muted">
          {t("pieceEditor.panel.slideOf", { index: document.slides.indexOf(slide) + 1, total: document.slides.length })}
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="size-10" onClick={props.onUndo} disabled={!props.canUndo} aria-label={t("pieceEditor.panel.undo")}>
            <Undo2 aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-10" onClick={props.onRedo} disabled={!props.canRedo} aria-label={t("pieceEditor.panel.redo")}>
            <Redo2 aria-hidden />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <Section title={t("pieceEditor.panel.layout")}>
          <ul className="grid grid-cols-3 gap-2">
            {compatible.map((candidate) => {
              const current = candidate.id === slide.layoutId
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => !current && onApply([{ op: "set_layout", slideId: slide.id, layoutId: candidate.id }])}
                    aria-pressed={current}
                    title={candidate.name}
                    className={cn(
                      "block w-full overflow-hidden border p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-vk-fg/30",
                      current ? "border-vk-fg" : "border-vk-border hover:border-vk-border-strong"
                    )}
                  >
                    <LayoutThumb layout={candidate} format={document.format} width={88} />
                    <span className="sr-only">{candidate.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-vk-muted">{layout.name}</p>
            {interior && others.length > 0 && (
              <button
                type="button"
                onClick={() => onApply(others.map((other) => ({ op: "set_layout" as const, slideId: other.id, layoutId: slide.layoutId })))}
                className="h-8 rounded-sm font-mono text-[11px] text-vk-fg underline decoration-vk-border-strong underline-offset-4 outline-none hover:decoration-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30"
              >
                {t("pieceEditor.slides.applyToInterior")}
              </button>
            )}
          </div>
        </Section>

        {layout.backgroundOptions.includes("color") && slide.background.type === "color" && (
          <Section title={t("pieceEditor.panel.background")}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("pieceEditor.panel.background")}>
              {COLOR_TOKENS.map((token) => {
                const current = slide.background.type === "color" && slide.background.colorToken === token
                return (
                  <button
                    key={token}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    onClick={() => onApply([{ op: "set_background", slideId: slide.id, type: "color", colorToken: token }])}
                    className={cn(
                      "flex h-10 items-center gap-2 rounded-md border px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-vk-fg/30",
                      current ? "border-vk-fg" : "border-vk-border hover:border-vk-border-strong"
                    )}
                  >
                    <span className="size-4 rounded-[3px] ring-1 ring-vk-border ring-inset" style={{ backgroundColor: props.theme.colors[token] }} aria-hidden />
                    {t(`pieceEditor.tokens.${token}`)}
                  </button>
                )
              })}
            </div>
          </Section>
        )}

        {hasScrim && hasPhoto && (
          <Section title={t("pieceEditor.panel.scrim.title")}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("pieceEditor.panel.scrim.title")}>
              {SCRIM_CHOICES.map((level) => {
                const current = scrimLevel === level
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    onClick={() =>
                      !current && onApply([{ op: "set_scrim", slideId: slide.id, level: level === "default" ? null : level }])
                    }
                    className={cn(
                      "flex h-10 items-center rounded-md border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-vk-fg/30",
                      current ? "border-vk-fg" : "border-vk-border hover:border-vk-border-strong"
                    )}
                  >
                    {t(`pieceEditor.panel.scrim.levels.${level}`)}
                  </button>
                )
              })}
            </div>
            {props.legibility && !props.legibility.ok && (
              <p role="status" className="flex items-start gap-2 text-xs text-vk-fg">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
                <span>
                  {t("pieceEditor.panel.scrim.warning", { contrast: formatNumber(props.legibility.contrast, language) })}
                </span>
              </p>
            )}
          </Section>
        )}

        {layout.slots.map((slot) => {
          const block = blocks.get(slot.id)
          const selected = props.selectedSlot === slot.id
          if (slot.type === "text") {
            return (
              <TextField
                key={slot.id}
                slide={slide}
                slot={slot}
                block={block as TextBlock | undefined}
                layout={layout}
                selected={selected}
                onApply={onApply}
                onSelect={props.onSelect}
              />
            )
          }
          if (slot.type === "image") {
            const image = block as ImageBlock | undefined
            return (
              <ImageField
                key={slot.id}
                slide={slide}
                slot={slot}
                block={image}
                asset={image?.assetId ? props.photos.get(image.assetId) : undefined}
                focal={props.focalSlot === slot.id}
                selected={selected}
                onApply={onApply}
                onPick={() => props.onPickImage(slot.id)}
                onToggleFocal={() => props.onToggleFocal(slot.id)}
              />
            )
          }
          return <LogoField key={slot.id} slide={slide} block={block as LogoBlock | undefined} selected={selected} onApply={onApply} />
        })}

        <CaptionField document={document} onApply={onApply} />
      </div>
    </div>
  )
}

function Section({ title, children, aside, highlighted }: { title: string; children: ReactNode; aside?: ReactNode; highlighted?: boolean }) {
  return (
    <section className={cn("space-y-2 rounded-md transition-colors", highlighted && "bg-vk-faint -mx-2 px-2 py-2")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] tracking-[0.08em] text-vk-muted uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * O bloco foi arrastado para fora do lugar do layout: diz isso e oferece a
 * volta. Trocar de layout também devolve.
 */
function FrameReset({ slide, slot, framed, onApply }: { slide: Slide; slot: string; framed: boolean; onApply: (operations: Operation[]) => void }) {
  const { t } = useTranslation()
  if (!framed) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-vk-muted">
      {t("pieceEditor.free.moved")}
      <button
        type="button"
        onClick={() => onApply([{ op: "set_frame", slideId: slide.id, slot, frame: null }])}
        className="h-8 rounded-sm text-vk-fg underline decoration-vk-border-strong underline-offset-4 outline-none hover:decoration-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30"
      >
        {t("pieceEditor.free.reset")}
      </button>
    </p>
  )
}

/* ---------- texto ---------- */

type TextFieldProps = {
  slide: Slide
  slot: LayoutSlot
  block: TextBlock | undefined
  layout: RenderLayout
  selected: boolean
  onApply: (operations: Operation[], group?: string) => void
  onSelect: (slot: string | null) => void
}

function TextField({ slide, slot, block, layout, selected, onApply, onSelect }: TextFieldProps) {
  const { t } = useTranslation()
  const field = useRef<HTMLTextAreaElement>(null)
  const content = block?.content ?? ""
  const visible = block ? block.visible : false
  const over = slot.maxChars !== undefined && content.length > slot.maxChars
  const lines = content.split("\n").length
  const tooManyLines = slot.maxLines !== undefined && lines > slot.maxLines
  const step = block?.sizeStep ?? 0

  // Clicar no bloco no preview traz o foco para cá.
  useEffect(() => {
    if (selected && window.document.activeElement !== field.current && !window.document.activeElement?.closest("[contenteditable]")) {
      field.current?.focus({ preventScroll: false })
    }
  }, [selected])

  const toggle = !slot.required && (
    <Switch
      checked={visible}
      onCheckedChange={(checked) => onApply([{ op: "set_visible", slideId: slide.id, slot: slot.id, visible: checked }])}
      aria-label={t("pieceEditor.panel.show", { slot: t(`pieceEditor.slots.${slot.id}`) })}
    />
  )

  return (
    <Section title={t(`pieceEditor.slots.${slot.id}`)} aside={toggle} highlighted={selected}>
      {(slot.required || visible) && (
        <>
          <Textarea
            ref={field}
            value={content}
            onFocus={() => onSelect(slot.id)}
            onChange={(event) => onApply([{ op: "set_text", slideId: slide.id, slot: slot.id, content: event.target.value }], `text:${slide.id}:${slot.id}`)}
            rows={1}
            aria-label={t(`pieceEditor.slots.${slot.id}`)}
            className="max-h-48 min-h-10 resize-none bg-vk-input text-sm"
            aria-invalid={over || tooManyLines}
            placeholder={t("pieceEditor.panel.placeholder")}
          />
          <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
            <span className={cn(over || tooManyLines ? "text-destructive" : "text-vk-muted")}>
              {over || tooManyLines ? t("pieceEditor.panel.willCut") : slot.maxLines ? t("pieceEditor.panel.lines", { count: slot.maxLines }) : ""}
            </span>
            {slot.maxChars !== undefined && (
              <span className={cn("tabular-nums", over ? "text-destructive" : "text-vk-muted")}>
                {content.length}/{slot.maxChars}
              </span>
            )}
          </div>
          <FrameReset slide={slide} slot={slot.id} framed={Boolean(block?.frame)} onApply={onApply} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="group" aria-label={t("pieceEditor.panel.size")}>
              <span className="mr-1 font-mono text-[11px] text-vk-muted">{t("pieceEditor.panel.size")}</span>
              <Button
                variant="outline"
                size="icon"
                className="size-10"
                disabled={step <= SIZE_STEPS[0]}
                onClick={() => onApply([{ op: "set_size_step", slideId: slide.id, slot: slot.id, sizeStep: step - 1 }])}
                aria-label={t("pieceEditor.panel.smaller")}
              >
                −
              </Button>
              <span className="w-8 text-center font-mono text-xs tabular-nums" aria-live="polite">
                {step > 0 ? `+${step}` : step}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-10"
                disabled={step >= SIZE_STEPS[SIZE_STEPS.length - 1]}
                onClick={() => onApply([{ op: "set_size_step", slideId: slide.id, slot: slot.id, sizeStep: step + 1 }])}
                aria-label={t("pieceEditor.panel.bigger")}
              >
                +
              </Button>
            </div>
            {layout.alignOptions.length > 1 && block && (
              <ToggleGroup
                value={[block.align]}
                onValueChange={(value) => {
                  const align = value[0] as "left" | "center" | undefined
                  if (align) onApply([{ op: "set_align", slideId: slide.id, slot: slot.id, align }])
                }}
                variant="outline"
                spacing={0}
                aria-label={t("pieceEditor.panel.align")}
              >
                {layout.alignOptions.map((align) => (
                  <ToggleGroupItem key={align} value={align} className="h-10">
                    {t(`pieceEditor.panel.aligns.${align}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </div>
        </>
      )}
    </Section>
  )
}

/* ---------- imagem ---------- */

type ImageFieldProps = {
  slide: Slide
  slot: LayoutSlot
  block: ImageBlock | undefined
  asset: BrandAsset | undefined
  focal: boolean
  selected: boolean
  onApply: (operations: Operation[], group?: string) => void
  onPick: () => void
  onToggleFocal: () => void
}

function ImageField({ slide, slot, block, asset, focal, selected, onApply, onPick, onToggleFocal }: ImageFieldProps) {
  const { t } = useTranslation()
  const visible = block ? block.visible : false
  const shown = slot.required || visible

  return (
    <Section
      title={t(`pieceEditor.slots.${slot.id}`)}
      highlighted={selected}
      aside={
        !slot.required && (
          <Switch
            checked={visible}
            onCheckedChange={(checked) => onApply([{ op: "set_visible", slideId: slide.id, slot: slot.id, visible: checked }])}
            aria-label={t("pieceEditor.panel.show", { slot: t(`pieceEditor.slots.${slot.id}`) })}
          />
        )
      }
    >
      {shown && (
        <div className="flex items-start gap-3">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden border border-vk-border bg-vk-faint">
            {asset ? <img src={asset.url} alt={asset.name} className="size-full object-cover" /> : <span className="font-mono text-[10px] text-vk-muted">{t("pieceEditor.image.none")}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-10" onClick={onPick}>
              {t("pieceEditor.image.swap")}
            </Button>
            {asset && (
              <Button variant={focal ? "default" : "outline"} size="sm" className="h-10" onClick={onToggleFocal} aria-pressed={focal}>
                <Crosshair aria-hidden /> {t("pieceEditor.image.focal")}
              </Button>
            )}
            {asset && !slot.required && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10"
                onClick={() => onApply([{ op: "set_visible", slideId: slide.id, slot: slot.id, visible: false }])}
              >
                <X aria-hidden /> {t("pieceEditor.image.remove")}
              </Button>
            )}
          </div>
        </div>
      )}
      {focal && <p className="font-mono text-[11px] text-vk-muted">{t("pieceEditor.image.focalHint")}</p>}
      <FrameReset slide={slide} slot={slot.id} framed={Boolean(block?.frame)} onApply={onApply} />
    </Section>
  )
}

/* ---------- logo ---------- */

function LogoField({ slide, block, selected, onApply }: { slide: Slide; block: LogoBlock | undefined; selected: boolean; onApply: (operations: Operation[]) => void }) {
  const { t } = useTranslation()
  const visible = block?.visible ?? false
  return (
    <Section
      title={t("pieceEditor.slots.logo")}
      highlighted={selected}
      aside={
        <Switch
          checked={visible}
          onCheckedChange={(checked) => onApply([{ op: "set_logo", slideId: slide.id, visible: checked }])}
          aria-label={t("pieceEditor.panel.show", { slot: t("pieceEditor.slots.logo") })}
        />
      }
    >
      {visible && block && (
        <ToggleGroup
          value={[block.variant]}
          onValueChange={(value) => {
            const variant = value[0] as "light" | "dark" | undefined
            if (variant) onApply([{ op: "set_logo", slideId: slide.id, variant }])
          }}
          variant="outline"
          spacing={0}
          aria-label={t("pieceEditor.logo.variant")}
        >
          <ToggleGroupItem value="dark" className="h-10">{t("pieceEditor.logo.forDark")}</ToggleGroupItem>
          <ToggleGroupItem value="light" className="h-10">{t("pieceEditor.logo.forLight")}</ToggleGroupItem>
        </ToggleGroup>
      )}
      <FrameReset slide={slide} slot="logo" framed={Boolean(block?.frame)} onApply={onApply} />
    </Section>
  )
}

/* ---------- legenda ---------- */

function CaptionField({ document, onApply }: { document: PieceDocument; onApply: (operations: Operation[], group?: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const { text, hashtags } = document.caption
  const over = text.length > CAPTION_MAX

  function addTags(raw: string) {
    const words = raw.split(/[\s,]+/).filter(Boolean)
    if (words.length === 0) return
    onApply([{ op: "set_caption", hashtags: [...hashtags, ...words] }])
    setDraft("")
  }

  return (
    <Collapsible defaultOpen={false} className="border-t border-vk-border pt-4">
      <CollapsibleTrigger className="flex h-10 w-full items-center justify-between rounded-md font-mono text-[11px] tracking-[0.08em] text-vk-muted uppercase outline-none focus-visible:ring-2 focus-visible:ring-vk-fg/30">
        {t("pieceEditor.caption.title")}
        <ChevronDown className="size-4" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <Textarea
          value={text}
          onChange={(event) => onApply([{ op: "set_caption", text: event.target.value }], "caption")}
          className="min-h-28 bg-vk-input text-sm"
          aria-label={t("pieceEditor.caption.title")}
          aria-invalid={over}
        />
        <p className={cn("text-right font-mono text-[11px] tabular-nums", over ? "text-destructive" : "text-vk-muted")}>
          {text.length}/{CAPTION_MAX}
        </p>
        <div>
          <p className="mb-1.5 font-mono text-[11px] text-vk-muted">{t("pieceEditor.caption.hashtags")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => onApply([{ op: "set_caption", hashtags: hashtags.filter((other) => other !== tag) }])}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-vk-border-strong px-2.5 font-mono text-[11px] outline-none hover:border-vk-fg focus-visible:ring-2 focus-visible:ring-vk-fg/30"
                  aria-label={t("pieceEditor.caption.removeTag", { tag })}
                >
                  {tag} <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "," || event.key === " ") {
                event.preventDefault()
                addTags(draft)
              }
            }}
            onBlur={() => addTags(draft)}
            placeholder={t("pieceEditor.caption.addTag")}
            className="mt-2 h-10 w-full rounded-md border border-vk-border bg-vk-input px-3 font-mono text-xs outline-none placeholder:text-vk-muted focus:border-vk-fg"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
