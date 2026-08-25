import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toPng } from "html-to-image"
import { Check, Copy, Download, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { useAi } from "@/components/editor/ai-store"
import { CardArt } from "@/components/editor/card-art"
import { useEditor } from "@/components/editor/editor-store"
import { Section } from "@/components/editor/panel-controls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FORMAT_RATIOS } from "@/lib/doc"
import { useStore } from "@/lib/store"

// Exportar de verdade: cada card é redesenhado fora da tela no tamanho que o
// Instagram publica e vira PNG. O que sai é exatamente o que se editou —
// mesmo renderizador, só maior.
//
// ZIP e PDF ficam para quando houver servidor: empacotar no navegador
// pediria mais uma dependência para um ganho que o backend resolve melhor.

/** Instagram publica em 1080 de largura. */
const EXPORT_WIDTH = 1080

type Scope = "all" | "current"

export function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { state, carouselId } = useEditor()
  const { state: appState, dispatch: appDispatch } = useStore()
  const { captionFor, task, busy } = useAi()
  const stage = useRef<HTMLDivElement>(null)

  const [scope, setScope] = useState<Scope>("all")
  const [done, setDone] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const carousel = appState.carousels.find((c) => c.id === carouselId)
  const [caption, setCaption] = useState(carousel?.caption ?? "")

  const { cards, theme, format, title } = state.doc
  const activeIndex = cards.findIndex((c) => c.id === state.activeCardId)
  const from = Math.max(0, activeIndex)
  const selected = scope === "all" ? cards : cards.slice(from, from + 1)
  const exporting = done !== null

  function saveCaption(value: string) {
    setCaption(value)
    appDispatch({ type: "carousel/set-caption", id: carouselId, caption: value })
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(t("editor.export.copyFailed"))
    }
  }

  async function run() {
    const nodes = stage.current?.querySelectorAll<HTMLElement>("[data-export-card]")
    if (!nodes || nodes.length === 0) return
    setDone(0)
    try {
      for (const [i, node] of Array.from(nodes).entries()) {
        const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true })
        const link = document.createElement("a")
        link.href = dataUrl
        link.download = `${fileStem(title)}-${String(offsetOf(scope, activeIndex, i)).padStart(2, "0")}.png`
        link.click()
        setDone(i + 1)
      }
      toast.success(t("editor.export.doneToast", { count: nodes.length }))
      onOpenChange(false)
    } catch {
      toast.error(t("editor.export.failedToast"))
    } finally {
      setDone(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {t("editor.export.title")}
          </DialogTitle>
          <DialogDescription>{t("editor.export.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Section label={t("editor.export.scope")}>
            <ToggleGroup
              value={[scope]}
              onValueChange={(value) => {
                const next = value[0] as Scope | undefined
                if (next) setScope(next)
              }}
            >
              <ToggleGroupItem value="all" className="px-3">
                {t("editor.export.scopeAll", { count: cards.length })}
              </ToggleGroupItem>
              <ToggleGroupItem value="current" className="px-3">
                {t("editor.export.scopeCurrent")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Section>

          <Section label={t("editor.export.caption")}>
            <Textarea
              value={caption}
              onChange={(e) => saveCaption(e.target.value)}
              placeholder={t("editor.export.captionPlaceholder")}
              rows={4}
            />
            <div className="flex items-center gap-2 pt-1.5">
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("editor.export.captionCount", { count: caption.length })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                disabled={busy}
                onClick={() => void captionFor(saveCaption)}
              >
                {task?.kind === "caption" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {t("editor.ai.suggestCaption")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={caption.trim() === ""}
                onClick={() => void copyCaption()}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? t("editor.export.copied") : t("editor.export.copy")}
              </Button>
            </div>
          </Section>

          {exporting && (
            <div className="space-y-1.5">
              <Progress value={(done / selected.length) * 100} />
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("editor.export.progress", {
                  done,
                  total: selected.length,
                })}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("editor.export.note")}
            </p>
            <Button
              className="ml-auto shrink-0"
              disabled={exporting || selected.length === 0}
              onClick={() => void run()}
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {t("editor.export.action")}
            </Button>
          </div>
        </div>

        {/* Palco fora da tela: os mesmos cards, no tamanho de publicação. */}
        <div
          ref={stage}
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 -z-10"
          style={{ transform: "translateX(-200vw)" }}
        >
          {selected.map((card) => (
            <div
              key={card.id}
              data-export-card
              style={{
                width: EXPORT_WIDTH,
                height: Math.round(EXPORT_WIDTH / FORMAT_RATIOS[format]),
              }}
            >
              <CardArt card={card} theme={theme} format={format} />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Nome de arquivo a partir do título — sem acento, sem espaço, minúsculo. */
function fileStem(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "carrossel"
}

function offsetOf(scope: Scope, activeIndex: number, i: number): number {
  return scope === "all" ? i + 1 : Math.max(0, activeIndex) + 1
}
