import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react"

import { coverRect, resolveBox, resolveInset, scrimGradient, sizeFor, type Box } from "@/lib/piece-geometry"
import type { Block, FocalPoint, ImageBlock, LogoBlock, PieceDocument, Slide, TextBlock } from "@/lib/piece-document"
import type { GeometryLayer, RenderAsset, RenderLayout, RenderTheme, RoleTheme } from "@/lib/piece-render"

// O renderizador React de uma lâmina: um intérprete da geometria do layout
// (`layouts/*.yml`), espelho de `PieceRenderers::Libvips`. Função pura de
// props para markup — sem estado de editor, sem busca de dados, sem hora.
// É o mesmo componente no preview (escalado por fora) e no export (o
// Chromium fotografa a rota `/render`).
//
// O canvas é sempre o tamanho lógico do formato (1080 de largura); tudo aqui
// é px absoluto nesse canvas.

/**
 * O editor liga isto; o export não. Sem `interaction`, o componente é a
 * função pura de sempre — o que o Chromium fotografa é o que se vê aqui,
 * menos os contornos de seleção.
 */
export type SlideInteraction = {
  /** A escala do preview na tela — os contornos ficam com 1–2 px de verdade. */
  scale: number
  selectedSlot: string | null
  editingSlot: string | null
  /** A foto em modo de ponto focal (arrastar move a foto dentro do slot). */
  focalSlot: string | null
  /** O nome de cada slot, já no idioma da tela. */
  labels: Record<string, string>
  onSelect: (slot: string) => void
  onEdit: (slot: string) => void
  onText: (slot: string, text: string) => void
  onEndEdit: () => void
  onFocal: (slot: string, point: FocalPoint) => void
  /** Apertou num elemento: o editor decide se vira arrasto (passou de alguns px). */
  onDragStart?: (slot: string, event: PointerEvent<HTMLDivElement>) => void
  /** Depois de um arrasto, o clique que o encerra não deve selecionar nem editar. */
  consumeClick?: () => boolean
}

type PieceSlideProps = {
  document: PieceDocument
  slide: Slide
  index: number
  theme: RenderTheme
  assets: Record<string, RenderAsset>
  layout: RenderLayout
  interaction?: SlideInteraction
}

export function PieceSlide({ document, slide, index, theme, assets, layout, interaction }: PieceSlideProps) {
  const { width, height } = document.canvas
  const layers = layout.geometry[document.format] ?? layout.geometry.default
  const blocks = new Map(slide.blocks.map((block) => [block.slot, block]))
  const token = slide.background.type === "color" ? slide.background.colorToken : "primary"
  const image = blocks.get("image") as ImageBlock | undefined
  const imagePresent = Boolean(image && image.visible && image.assetId && assets[image.assetId])
  const context: Context = {
    width,
    height,
    blocks,
    token,
    theme,
    assets,
    layout,
    imagePresent,
    index,
    total: document.slides.length,
    interaction,
  }

  return (
    <div
      style={{ position: "relative", width, height, overflow: "hidden", backgroundColor: theme.colors[token] }}
      data-slide-root
      data-layout={slide.layoutId}
    >
      {layers.map((layer, position) => (
        <Layer key={position} layer={layer} context={context} />
      ))}
    </div>
  )
}

type Context = {
  width: number
  height: number
  blocks: Map<string, Block>
  token: keyof RenderTheme["colors"]
  theme: RenderTheme
  assets: Record<string, RenderAsset>
  layout: RenderLayout
  imagePresent: boolean
  index: number
  total: number
  interaction?: SlideInteraction
}

function Layer({ layer, context }: { layer: GeometryLayer; context: Context }) {
  const box = resolveBox(layer.box, context.width, context.height)
  switch (layer.kind) {
    case "fill":
      return <div style={{ ...place(box), backgroundColor: context.theme.colors[context.token], pointerEvents: "none" }} />
    case "image":
      return <ImageLayer layer={layer} box={box} context={context} />
    case "scrim":
      if (layer.when === "image" && !context.imagePresent) return null
      return <div style={{ ...place(box), backgroundImage: scrimGradient(layer.from ?? "bottom", layer.opacity ?? 0.6, layer.curve), pointerEvents: "none" }} />
    case "logo":
      return <LogoLayer layer={layer} context={context} />
    case "stack":
      return <StackLayer layer={layer} box={box} context={context} />
    case "quote_mark":
      return (
        <Glyph layer={layer} role={context.theme.roles.display} color={context.theme.accent}>
          {"“"}
        </Glyph>
      )
    case "swipe_hint":
      return (
        <Glyph layer={layer} role={context.theme.roles.label} color={context.theme.accentInk[context.token]}>
          {layer.text ?? ""}
        </Glyph>
      )
    case "slide_number":
      return (
        <Glyph layer={layer} role={context.theme.roles.label} color={context.theme.accentInk[context.token]}>
          {`${String(context.index + 1).padStart(2, "0")}/${String(context.total).padStart(2, "0")}`}
        </Glyph>
      )
  }
}

/** Caixa resolvida → posição absoluta (largura/altura nulas ficam por conta do conteúdo). */
function place(box: Box): CSSProperties {
  return {
    position: "absolute",
    left: box.x ?? undefined,
    top: box.y ?? undefined,
    right: box.x === null ? (box.right ?? undefined) : undefined,
    bottom: box.y === null ? (box.bottom ?? undefined) : undefined,
    width: box.w ?? undefined,
    height: box.h ?? undefined,
  }
}

function ImageLayer({ layer, box, context }: { layer: GeometryLayer; box: Box; context: Context }) {
  const block = context.blocks.get(layer.slot ?? "") as ImageBlock | undefined
  if (!block || !block.visible) return null
  const asset = block.assetId ? context.assets[block.assetId] : undefined
  // Arrastada, a foto mora no `frame`; senão, na caixa do layout.
  if (block.frame?.h !== undefined) box = { x: block.frame.x, y: block.frame.y, w: block.frame.w, h: block.frame.h, right: null, bottom: null }
  const w = box.w ?? 0
  const h = box.h ?? 0

  if (!asset || !asset.width || !asset.height) {
    if (layer.optional) return null
    // Espaço reservado: a tinta do fundo a 10% — sem texto inventado.
    return (
      <Hotspot
        slot={block.slot}
        interaction={context.interaction}
        style={{ ...place(box), backgroundColor: alpha(context.theme.ink[context.token], 0.1) }}
      />
    )
  }

  const rect = coverRect(asset.width, asset.height, w, h, block.focalPoint)
  const interaction = context.interaction
  return (
    <Hotspot slot={block.slot} interaction={interaction} style={{ ...place(box), overflow: "hidden" }}>
      {interaction?.focalSlot === block.slot && (
        <FocalDrag
          interaction={interaction}
          slot={block.slot}
          focal={block.focalPoint}
          scaled={{ w: asset.width * rect.scale, h: asset.height * rect.scale }}
        />
      )}
      <img
        src={asset.url}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        style={{
          position: "absolute",
          left: -rect.x,
          top: -rect.y,
          width: asset.width * rect.scale,
          height: asset.height * rect.scale,
          maxWidth: "none",
        }}
      />
    </Hotspot>
  )
}

function LogoLayer({ layer, context }: { layer: GeometryLayer; context: Context }) {
  const block = context.blocks.get(layer.slot ?? "") as LogoBlock | undefined
  if (!block || !block.visible) return null
  const variant = block.variant === "light" ? "light" : "dark"
  const logo = context.theme.logo[variant] ?? context.theme.logo[variant === "light" ? "dark" : "light"]
  if (!logo) return null
  const spec = layer.box === "full" ? {} : layer.box
  const frame = block.frame
  return (
    <Hotspot
      slot={block.slot}
      interaction={context.interaction}
      style={
        frame
          ? { position: "absolute", left: frame.x, top: frame.y }
          : {
              position: "absolute",
              left: spec.left as number | undefined,
              right: spec.right as number | undefined,
              top: spec.top as number | undefined,
              bottom: spec.bottom as number | undefined,
            }
      }
    >
      <img
        src={logo.url}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        style={{ display: "block", height: frame?.h ?? layer.height, width: "auto", maxWidth: "none" }}
      />
    </Hotspot>
  )
}

function StackLayer({ layer, box, context }: { layer: GeometryLayer; box: Box; context: Context }) {
  const [top, right, bottom, left] = resolveInset(layer.inset)
  const onImage = layer.ink === "image" || (layer.ink === "auto" && context.imagePresent)
  const items = (layer.items ?? []).flatMap((item) => {
    const block = context.blocks.get(item.slot) as TextBlock | undefined
    if (!block || !block.visible || block.content.trim() === "") return []
    return [{ item, block }]
  })
  if (items.length === 0) return null
  // Quem foi arrastado sai do fluxo da pilha e mora no `frame`, na mesma
  // camada — a mesma ordem de sobreposição do libvips.
  const flow = items.filter(({ block }) => !block.frame)
  const free = items.filter(({ block }) => block.frame)

  const justify = layer.anchor === "bottom" ? "flex-end" : layer.anchor === "center" ? "center" : "flex-start"
  // Sem topo (pilha que cresce de baixo para cima), a pilha ocupa do alto do
  // canvas até a borda de baixo — o `flex-end` a encosta embaixo.
  const style: CSSProperties = {
    ...place(box),
    top: box.y ?? 0,
    bottom: box.h === null ? (box.bottom ?? 0) : undefined,
    display: "flex",
    flexDirection: "column",
    justifyContent: justify,
    padding: `${top}px ${right}px ${bottom}px ${left}px`,
    // A caixa vai do topo do canvas até embaixo e cobriria a logo e a foto:
    // só os textos (`Hotspot`) recebem o ponteiro.
    pointerEvents: "none",
  }

  const text = ({ item, block }: (typeof items)[number], marginTop: number) => {
    const role = context.theme.roles[block.styleRole] ?? context.theme.roles.body
    const color =
      block.styleRole === "label"
        ? onImage
          ? context.theme.imageInk
          : context.theme.accentInk[context.token]
        : onImage
          ? context.theme.imageInk
          : context.theme.ink[context.token]
    const slot = context.layout.slots.find((s) => s.id === item.slot)
    return (
      <TextItem
        key={block.id}
        slot={item.slot}
        interaction={context.interaction}
        text={block.content}
        role={role}
        size={sizeFor(item.size, block.sizeStep)}
        color={color}
        align={block.align}
        maxLines={slot?.maxLines}
        marginTop={marginTop}
      />
    )
  }

  return (
    <>
      {flow.length > 0 && (
        <div style={style}>
          {flow.map((entry, position) => text(entry, position === 0 ? 0 : (entry.item.gap ?? layer.gap ?? 0)))}
        </div>
      )}
      {free.map((entry) => (
        <div
          key={entry.block.id}
          style={{ position: "absolute", left: entry.block.frame!.x, top: entry.block.frame!.y, width: entry.block.frame!.w, pointerEvents: "none" }}
        >
          {text(entry, 0)}
        </div>
      ))}
    </>
  )
}

type TextItemProps = {
  slot: string
  interaction?: SlideInteraction
  text: string
  role: RoleTheme
  size: number
  color: string
  align: "left" | "center"
  maxLines?: number
  marginTop: number
}

/**
 * Um texto da pilha. Passou de `maxLines`: corta na última linha e a esmaece —
 * a mesma regra do libvips. A medida é feita no próprio DOM, então vale
 * igual no preview e no export.
 */
function TextItem({ slot, interaction, text, role, size, color, align, maxLines, marginTop }: TextItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState(false)
  const editing = interaction?.editingSlot === slot

  // Editando, o texto do bloco é do navegador (contentEditable não
  // controlado): o React não reescreve por cima do cursor a cada tecla. Ao
  // entrar, o conteúdo e o cursor no fim; ao sair, o React volta a mandar.
  useLayoutEffect(() => {
    const element = ref.current
    if (!editing || !element) return
    element.textContent = text
    element.focus()
    const range = window.document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // Só na entrada: depois disso quem escreve é a pessoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])
  const lineHeight = size * role.lineHeight
  const maxHeight = maxLines ? maxLines * lineHeight : undefined

  // Conta linhas, como o libvips — não compara alturas: com altura de linha
  // apertada (1,04 no display) o desenho da letra passa da caixa e o
  // navegador chamaria isso de estouro.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !maxLines) return
    setCut(Math.round(element.scrollHeight / lineHeight) > maxLines)
  }, [text, size, maxLines, lineHeight, role.family, role.weight])

  const body = (
    <div
      ref={ref}
      contentEditable={editing ? "plaintext-only" : undefined}
      suppressContentEditableWarning
      onInput={editing ? (event) => interaction?.onText(slot, event.currentTarget.innerText) : undefined}
      onKeyDown={
        editing
          ? (event) => {
              if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
                event.preventDefault()
                interaction?.onEndEdit()
              }
              event.stopPropagation()
            }
          : undefined
      }
      onBlur={editing ? () => interaction?.onEndEdit() : undefined}
      style={{
        marginTop: interaction ? 0 : marginTop,
        flexShrink: 0,
        outline: "none",
        cursor: editing ? "text" : undefined,
        fontFamily: `"${role.family}", sans-serif`,
        fontWeight: role.weight,
        fontSize: size,
        lineHeight: `${lineHeight}px`,
        letterSpacing: `${role.tracking}em`,
        textTransform: role.transform === "uppercase" ? "uppercase" : "none",
        textAlign: align,
        color,
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        overflow: "hidden",
        maskImage: cut && !editing ? `linear-gradient(to bottom, #000 calc(100% - ${lineHeight}px), transparent 100%)` : undefined,
        maxHeight: editing ? undefined : maxHeight,
        fontKerning: "normal",
      }}
    >
      {editing ? null : text}
    </div>
  )

  if (!interaction) return body
  return (
    <Hotspot slot={slot} interaction={interaction} style={{ position: "relative", flexShrink: 0, marginTop }} editing={editing} editable>
      {body}
    </Hotspot>
  )
}

/**
 * A área clicável de um slot no preview do editor: passar o mouse mostra o
 * contorno tracejado e o nome do slot; selecionado, contorno cheio. Sem
 * `interaction`, é só o contêiner.
 */
function Hotspot({
  slot,
  interaction,
  style,
  editing,
  editable,
  children,
}: {
  slot: string
  interaction?: SlideInteraction
  style: CSSProperties
  editing?: boolean
  /** Texto: o segundo clique entra em edição. Foto e logo só se selecionam. */
  editable?: boolean
  children?: ReactNode
}) {
  const [hover, setHover] = useState(false)
  if (!interaction) return <div style={style}>{children}</div>
  const selected = interaction.selectedSlot === slot
  const line = 1.5 / interaction.scale
  return (
    <div
      // `auto` explícito: as caixas por cima (pilha, véu, glifos) passam o
      // ponteiro adiante com `none`, e isso seria herdado aqui dentro.
      style={{ ...style, cursor: editing ? "text" : "pointer", pointerEvents: "auto" }}
      data-slot={slot}
      role="button"
      tabIndex={-1}
      aria-label={interaction.labels[slot] ?? slot}
      aria-pressed={selected}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(event) => {
        if (editing || interaction.focalSlot === slot || event.button !== 0) return
        interaction.onDragStart?.(slot, event)
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (interaction.consumeClick?.()) return
        if (editing) return
        if (selected && editable) interaction.onEdit(slot)
        else interaction.onSelect(slot)
      }}
    >
      {children}
      {(hover || selected) && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: -6 / interaction.scale,
            pointerEvents: "none",
            outline: `${line}px ${selected ? "solid" : "dashed"} #0A0A0A`,
            boxShadow: `0 0 0 ${line}px rgba(255,255,255,0.85)`,
          }}
        >
          {!selected && (
            <span
              style={{
                position: "absolute",
                top: -22 / interaction.scale,
                left: 0,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11 / interaction.scale,
                lineHeight: 1,
                padding: `${3 / interaction.scale}px ${5 / interaction.scale}px`,
                background: "#0A0A0A",
                color: "#F4F1EA",
                whiteSpace: "nowrap",
              }}
            >
              {interaction.labels[slot] ?? slot}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/**
 * Arrastar dentro da foto: a foto desliza no slot e o ponto focal anda junto
 * (0..1). A conta é em px do canvas, desfeita a escala do preview.
 */
function FocalDrag({
  interaction,
  slot,
  focal,
  scaled,
}: {
  interaction: SlideInteraction
  slot: string
  focal: FocalPoint
  scaled: { w: number; h: number }
}) {
  const start = useRef<{ x: number; y: number; focal: FocalPoint } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { x: event.clientX, y: event.clientY, focal }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current
    if (!origin) return
    const dx = (event.clientX - origin.x) / interaction.scale
    const dy = (event.clientY - origin.y) / interaction.scale
    // Arrastar para a direita mostra o que estava à esquerda: o foco anda ao contrário.
    interaction.onFocal(slot, {
      x: Math.min(Math.max(origin.focal.x - dx / scaled.w, 0), 1),
      y: Math.min(Math.max(origin.focal.y - dy / scaled.h, 0), 1),
    })
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onClick={(event) => event.stopPropagation()}
      style={{ position: "absolute", inset: 0, zIndex: 2, cursor: "move", touchAction: "none" }}
    />
  )
}

function Glyph({ layer, role, color, children }: { layer: GeometryLayer; role: RoleTheme; color: string; children: ReactNode }) {
  const spec = layer.box === "full" ? {} : layer.box
  return (
    <span
      style={{
        position: "absolute",
        left: spec.left as number | undefined,
        right: spec.right as number | undefined,
        top: spec.top as number | undefined,
        bottom: spec.bottom as number | undefined,
        fontFamily: `"${role.family}", sans-serif`,
        fontWeight: role.weight,
        fontSize: layer.size,
        lineHeight: "normal",
        letterSpacing: `${role.tracking}em`,
        textTransform: role.transform === "uppercase" ? "uppercase" : "none",
        color,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {children}
    </span>
  )
}

function alpha(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${amount})`
}
