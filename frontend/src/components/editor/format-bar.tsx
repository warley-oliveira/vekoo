import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Bold, Check, Italic, Link2, RemoveFormatting, Underline } from "lucide-react"

import { useEditor } from "@/components/editor/editor-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import type { InkColor } from "@/lib/doc"
import {
  activeMarks,
  applyInk,
  applyLink,
  clearMarks,
  selectionRect,
  toggleInlineMark,
} from "@/lib/rich-text"
import { cn } from "@/lib/utils"

// A barra de formatação: aparece sobre a seleção dentro de qualquer campo de
// texto do card e some quando a seleção some. Os botões nunca roubam o foco
// (mousedown prevenido) — sem isso a seleção morre no clique, e com ela o
// trecho que se queria marcar.

const BAR_HEIGHT = 40
const INK_OPTIONS: readonly InkColor[] = ["ink", "accent", "muted"]

type BarState = { rect: DOMRect; marks: ReturnType<typeof activeMarks> }

/** A seleção está mesmo dentro de um campo de texto do card? */
function selectionInsideRichText(): boolean {
  const node = window.getSelection()?.anchorNode
  if (!node) return false
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return Boolean(element?.closest("[data-rich-text]"))
}

export function FormatBar() {
  const { t } = useTranslation()
  const { state } = useEditor()
  const [bar, setBar] = useState<BarState | null>(null)
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState("")

  const sync = useCallback(() => {
    if (!selectionInsideRichText()) {
      setBar(null)
      return
    }
    const rect = selectionRect()
    setBar(rect ? { rect, marks: activeMarks() } : null)
  }, [])

  useEffect(() => {
    document.addEventListener("selectionchange", sync)
    window.addEventListener("scroll", sync, true)
    window.addEventListener("resize", sync)
    return () => {
      document.removeEventListener("selectionchange", sync)
      window.removeEventListener("scroll", sync, true)
      window.removeEventListener("resize", sync)
    }
  }, [sync])

  // Sai de cena junto com a edição do bloco.
  useEffect(() => {
    if (!state.selection.editing) {
      setBar(null)
      setLinking(false)
    }
  }, [state.selection.editing])

  useEffect(() => {
    if (!bar) setLinking(false)
  }, [bar])

  if (!bar) return null

  const theme = state.doc.theme
  const left = Math.min(
    Math.max(120, bar.rect.left + bar.rect.width / 2),
    window.innerWidth - 120
  )
  const top = Math.max(8, bar.rect.top - BAR_HEIGHT - 8)

  /** Aplica e reconsulta o estado, sem devolver o foco para a barra. */
  const run = (action: () => void) => (e: ReactMouseEvent) => {
    e.preventDefault()
    action()
    sync()
  }

  function commitLink() {
    const value = href.trim()
    if (value) applyLink(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    setLinking(false)
    setHref("")
    sync()
  }

  return createPortal(
    <div
      role="toolbar"
      aria-label={t("editor.format.label")}
      onMouseDown={(e) => e.preventDefault()}
      style={{ left, top, transform: "translateX(-50%)" }}
      className="fixed z-50 flex h-10 items-center gap-0.5 rounded-lg bg-popover px-1 shadow-md ring-1 ring-foreground/10"
    >
      {linking ? (
        <>
          <Input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                commitLink()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                setLinking(false)
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder={t("editor.format.linkPlaceholder")}
            aria-label={t("editor.format.link")}
            className="h-8 w-56"
          />
          <Button
            size="icon-sm"
            aria-label={t("editor.format.linkConfirm")}
            onMouseDown={run(commitLink)}
          >
            <Check />
          </Button>
        </>
      ) : (
        <>
          <MarkButton
            label={t("editor.format.bold")}
            active={bar.marks.bold}
            onMouseDown={run(() => toggleInlineMark("bold"))}
          >
            <Bold />
          </MarkButton>
          <MarkButton
            label={t("editor.format.italic")}
            active={bar.marks.italic}
            onMouseDown={run(() => toggleInlineMark("italic"))}
          >
            <Italic />
          </MarkButton>
          <MarkButton
            label={t("editor.format.underline")}
            active={bar.marks.underline}
            onMouseDown={run(() => toggleInlineMark("underline"))}
          >
            <Underline />
          </MarkButton>

          <Separator orientation="vertical" className="mx-1 !h-5" />

          {INK_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={t(`editor.properties.colors.${option}`)}
              onMouseDown={run(() => {
                applyInk(option)
              })}
              className="flex size-8 items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className="size-3.5 rounded-full ring-1 ring-foreground/15"
                style={{
                  backgroundColor: option === "accent" ? theme.accent : theme.ink,
                  opacity: option === "muted" ? 0.45 : 1,
                }}
              />
            </button>
          ))}

          <Separator orientation="vertical" className="mx-1 !h-5" />

          <MarkButton
            label={t("editor.format.link")}
            active={false}
            onMouseDown={(e) => {
              e.preventDefault()
              setLinking(true)
            }}
          >
            <Link2 />
          </MarkButton>
          <MarkButton
            label={t("editor.format.clear")}
            active={false}
            onMouseDown={run(clearMarks)}
          >
            <RemoveFormatting />
          </MarkButton>
        </>
      )}
    </div>,
    document.body
  )
}

function MarkButton({
  label,
  active,
  onMouseDown,
  children,
}: {
  label: string
  active: boolean
  onMouseDown: (e: ReactMouseEvent) => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={onMouseDown}
      className={cn(active && "bg-accent text-accent-foreground")}
    >
      {children}
    </Button>
  )
}
