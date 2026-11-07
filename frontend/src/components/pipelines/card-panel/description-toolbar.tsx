import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react"
import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { useTranslation } from "react-i18next"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Check,
  Code2,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
} from "lucide-react"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { HIGHLIGHT_COLORS, TEXT_COLORS, type ColorSwatch } from "./description-schema"

const URL_EXAMPLE = "https://"

/** "loja.com.br" vira um endereço de verdade; quem escreveu o esquema sabe o que quer. */
function withScheme(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `${URL_EXAMPLE}${url}`
}

function applyLink(editor: Editor, url: string) {
  if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run()
  else editor.chain().focus().extendMarkRange("link").setLink({ href: withScheme(url) }).run()
}

function currentLink(editor: Editor): string {
  return (editor.getAttributes("link").href as string | undefined) ?? ""
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        "shrink-0 text-muted-foreground pointer-coarse:size-9",
        active && "bg-muted text-foreground"
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Sem isto, o clique tira a seleção do editor antes do comando rodar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
}

/** O que muda o texto escrito: serve à barra de cima e à que flutua sobre a seleção. */
function TextTools({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const tool = (key: string) => t(`pipelines.description.tools.${key}`)

  return (
    <>
      <ToolbarButton label={tool("bold")} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label={tool("italic")} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label={tool("underline")} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline />
      </ToolbarButton>
      <ToolbarButton label={tool("strike")} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough />
      </ToolbarButton>
      <Divider />
      <ToolbarButton label={tool("heading1")} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 />
      </ToolbarButton>
      <ToolbarButton label={tool("heading2")} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton label={tool("heading3")} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </ToolbarButton>
    </>
  )
}

function AlignTools({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const tool = (key: string) => t(`pipelines.description.tools.${key}`)

  return (
    <>
      <ToolbarButton label={tool("alignLeft")} active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft />
      </ToolbarButton>
      <ToolbarButton label={tool("alignCenter")} active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter />
      </ToolbarButton>
      <ToolbarButton label={tool("alignRight")} active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight />
      </ToolbarButton>
    </>
  )
}

/** As amostras de cor, em linha, com o que tira a cor no fim. */
function Swatches({
  colors,
  current,
  namespace,
  clearLabel,
  onPick,
  onClear,
}: {
  colors: readonly ColorSwatch[]
  current: string | null | undefined
  namespace: "color" | "highlight"
  clearLabel: string
  onPick: (value: string) => void
  onClear: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-1">
      {colors.map((color) => {
        const name = t(`pipelines.description.colors.${color.id}`)
        const label = t(`pipelines.description.tools.${namespace}Of`, { color: name })
        const selected = current?.toLowerCase() === color.value
        return (
          <button
            key={color.id}
            type="button"
            aria-label={label}
            aria-pressed={selected}
            title={label}
            className="flex size-7 shrink-0 items-center justify-center rounded-md outline-none ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-9"
            style={namespace === "color" ? { color: color.value } : { backgroundColor: color.value }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color.value)}
          >
            {selected ? (
              <Check className="size-3.5" />
            ) : namespace === "color" ? (
              <Baseline className="size-3.5" />
            ) : null}
          </button>
        )
      })}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7 shrink-0 text-muted-foreground pointer-coarse:size-9"
        aria-label={clearLabel}
        title={clearLabel}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
      >
        <Eraser />
      </Button>
    </div>
  )
}

function ColorSwatches({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const { t } = useTranslation()
  return (
    <Swatches
      namespace="color"
      colors={TEXT_COLORS}
      current={editor.getAttributes("textStyle").color as string | undefined}
      clearLabel={t("pipelines.description.tools.clearColor")}
      onPick={(value) => {
        editor.chain().focus().setColor(value).run()
        onDone?.()
      }}
      onClear={() => {
        editor.chain().focus().unsetColor().run()
        onDone?.()
      }}
    />
  )
}

function HighlightSwatches({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const { t } = useTranslation()
  return (
    <Swatches
      namespace="highlight"
      colors={HIGHLIGHT_COLORS}
      current={editor.getAttributes("highlight").color as string | undefined}
      clearLabel={t("pipelines.description.tools.clearHighlight")}
      onPick={(color) => {
        editor.chain().focus().setHighlight({ color }).run()
        onDone?.()
      }}
      onClear={() => {
        editor.chain().focus().unsetHighlight().run()
        onDone?.()
      }}
    />
  )
}

/** Botão da barra que abre um painelzinho. A seleção do editor continua lá para o comando valer. */
function ToolPopover({
  label,
  active,
  open,
  onOpenChange,
  icon,
  className,
  children,
}: {
  label: string
  active?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  icon: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <ResponsivePopover
      open={open}
      onOpenChange={onOpenChange}
      title={label}
      className={cn("gap-0 p-2", className)}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "shrink-0 text-muted-foreground pointer-coarse:size-9",
            active && "bg-muted text-foreground"
          )}
          aria-label={label}
          aria-pressed={active}
          title={label}
          onMouseDown={(event) => event.preventDefault()}
        >
          {icon}
        </Button>
      }
    >
      {children}
    </ResponsivePopover>
  )
}

/** Link e imagem pedem um endereço: num popup da própria tela, e não no `prompt` do navegador. */
function UrlForm({
  label,
  hint,
  initial,
  onApply,
}: {
  label: string
  hint?: string
  initial: string
  onApply: (url: string) => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState(initial)

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onApply(url.trim())
      }}
    >
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          inputMode="url"
          value={url}
          aria-label={label}
          placeholder={URL_EXAMPLE}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" size="sm" className="shrink-0 pointer-coarse:h-10">
          {t("pipelines.description.apply")}
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </form>
  )
}

function TableTool({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  const label = (key: string) => t(`pipelines.description.table.${key}`)
  const inTable = editor.isActive("table")

  if (!inTable) {
    return (
      <ToolbarButton
        label={label("insert")}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </ToolbarButton>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 bg-muted text-foreground pointer-coarse:size-9"
            aria-label={label("menu")}
            title={label("menu")}
            onMouseDown={(event) => event.preventDefault()}
          />
        }
      >
        <TableIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => editor.chain().focus().addRowBefore().run()}>{label("addRowAbove")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>{label("addRowBelow")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()}>{label("addColumnLeft")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>{label("addColumnRight")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeaderRow().run()}>{label("toggleHeader")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>{label("deleteRow")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>{label("deleteColumn")}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash2 />
          {label("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A barra de cima, sempre à vista. No celular é uma linha só, que rola de lado. */
export function DescriptionToolbar({
  editor,
  imageOpen,
  onImageOpenChange,
}: {
  editor: Editor
  imageOpen: boolean
  onImageOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [colorOpen, setColorOpen] = useState(false)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const tool = (key: string) => t(`pipelines.description.tools.${key}`)

  return (
    <div
      role="toolbar"
      aria-label={t("pipelines.description.toolbar")}
      className="flex items-center gap-0.5 border-b px-1 py-1 [scrollbar-width:none] max-md:overflow-x-auto md:flex-wrap"
    >
      <TextTools editor={editor} />
      <Divider />
      <ToolPopover
        label={tool("color")}
        active={Boolean(editor.getAttributes("textStyle").color)}
        open={colorOpen}
        onOpenChange={setColorOpen}
        icon={<Baseline />}
        className="w-auto"
      >
        <ColorSwatches editor={editor} onDone={() => setColorOpen(false)} />
      </ToolPopover>
      <ToolPopover
        label={tool("highlight")}
        active={editor.isActive("highlight")}
        open={highlightOpen}
        onOpenChange={setHighlightOpen}
        icon={<Highlighter />}
        className="w-auto"
      >
        <HighlightSwatches editor={editor} onDone={() => setHighlightOpen(false)} />
      </ToolPopover>
      <Divider />
      <AlignTools editor={editor} />
      <Divider />
      <ToolbarButton label={tool("bulletList")} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolbarButton>
      <ToolbarButton label={tool("orderedList")} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton label={tool("taskList")} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks />
      </ToolbarButton>
      <Divider />
      <ToolbarButton label={tool("quote")} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote />
      </ToolbarButton>
      <ToolbarButton label={tool("code")} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 />
      </ToolbarButton>
      <TableTool editor={editor} />
      <ToolPopover
        label={tool("link")}
        active={editor.isActive("link")}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        icon={<LinkIcon />}
        className="w-80"
      >
        {linkOpen ? (
          <UrlForm
            label={tool("link")}
            hint={t("pipelines.description.linkHint")}
            initial={currentLink(editor)}
            onApply={(url) => {
              applyLink(editor, url)
              setLinkOpen(false)
            }}
          />
        ) : null}
      </ToolPopover>
      <ToolPopover
        label={tool("image")}
        open={imageOpen}
        onOpenChange={onImageOpenChange}
        icon={<ImageIcon />}
        className="w-80"
      >
        {imageOpen ? (
          <UrlForm
            label={tool("image")}
            initial=""
            onApply={(url) => {
              if (url) editor.chain().focus().setImage({ src: withScheme(url) }).run()
              onImageOpenChange(false)
            }}
          />
        ) : null}
      </ToolPopover>
    </div>
  )
}

type BubblePanel = "color" | "highlight" | "link" | null

/** Quem rola o editor. A barra precisa acompanhar, e por padrão ela só escuta a janela. */
function scrollParentOf(element: Element): HTMLElement | Window {
  let current = element.parentElement
  while (current) {
    const { overflowY } = window.getComputedStyle(current)
    if (overflowY === "auto" || overflowY === "scroll") return current
    current = current.parentElement
  }
  return window
}

/**
 * A barra que flutua sobre o texto selecionado. Cor, realce e link abrem aqui dentro, numa segunda
 * linha, e não num popup: o foco precisa ficar no editor, senão a barra some junto com a seleção.
 */
export function DescriptionBubble({
  editor,
  frameRef,
}: {
  editor: Editor
  /** A moldura do editor, de onde se descobre quem rola e até onde a barra pode ir. */
  frameRef: RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  const [panel, setPanel] = useState<BubblePanel>(null)
  const tool = (key: string) => t(`pipelines.description.tools.${key}`)
  const toggle = (next: BubblePanel) => setPanel((current) => (current === next ? null : next))

  // Pela moldura, e não por `editor.view`: o editor monta depois deste efeito, e perguntar antes dá erro.
  const [host, setHost] = useState<{ scrollTarget: HTMLElement | Window; panel: Element | null } | null>(null)
  useEffect(() => {
    const frame = frameRef.current
    if (frame) setHost({ scrollTarget: scrollParentOf(frame), panel: frame.closest('[role="dialog"]') })
  }, [frameRef])

  const options = useMemo(
    () => ({
      placement: "top" as const,
      offset: 8,
      flip: true,
      // Dentro do painel: passando da borda, ela ficaria sobre o fundo escurecido.
      shift: { padding: 8, boundary: host?.panel ?? undefined },
      scrollTarget: host?.scrollTarget ?? window,
      onHide: () => setPanel(null),
    }),
    [host]
  )

  if (!host) return null

  return (
    <BubbleMenu
      editor={editor}
      options={options}
      className="z-50 flex max-w-[calc(100vw-1rem)] flex-col gap-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <div
        role="toolbar"
        aria-label={t("pipelines.description.bubble")}
        className="flex items-center gap-0.5"
      >
        <TextTools editor={editor} />
        <Divider />
        <ToolbarButton
          label={tool("color")}
          active={panel === "color" || Boolean(editor.getAttributes("textStyle").color)}
          onClick={() => toggle("color")}
        >
          <Baseline />
        </ToolbarButton>
        <ToolbarButton
          label={tool("highlight")}
          active={panel === "highlight" || editor.isActive("highlight")}
          onClick={() => toggle("highlight")}
        >
          <Highlighter />
        </ToolbarButton>
        <Divider />
        <AlignTools editor={editor} />
        <Divider />
        <ToolbarButton
          label={tool("link")}
          active={panel === "link" || editor.isActive("link")}
          onClick={() => toggle("link")}
        >
          <LinkIcon />
        </ToolbarButton>
      </div>
      {panel === "color" ? <ColorSwatches editor={editor} /> : null}
      {panel === "highlight" ? <HighlightSwatches editor={editor} /> : null}
      {panel === "link" ? (
        <UrlForm
          label={tool("link")}
          hint={t("pipelines.description.linkHint")}
          initial={currentLink(editor)}
          onApply={(url) => {
            applyLink(editor, url)
            setPanel(null)
          }}
        />
      ) : null}
    </BubbleMenu>
  )
}
