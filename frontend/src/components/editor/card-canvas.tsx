import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { Frame, Layers, ZoomIn, ZoomOut } from "lucide-react"

import { EditableCard } from "@/components/editor/card-editable"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { emptyCard, FORMAT_RATIOS } from "@/lib/doc"
import { newId } from "@/lib/store"
import { usePersistentState } from "@/lib/view-prefs"
import { cn } from "@/lib/utils"

/** Passos de aproximação — 100% é o card inteiro na tela. */
const ZOOM_STEPS = [1, 1.25, 1.5, 2] as const

function stepZoom(current: number, direction: 1 | -1): string {
  const index = ZOOM_STEPS.indexOf(current as (typeof ZOOM_STEPS)[number])
  const safe = index < 0 ? 0 : index
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, safe + direction))]
  return String(next)
}

// O canvas: o card ativo no formato exato, sempre inteiro na tela, sem
// rolagem. O truque do encaixe é o contêiner com container-type:size — a
// largura do card vira min(100% da área, altura da área × proporção), e
// quando o painel de propriedades abre, o card se reencaixa sozinho.

export function CardCanvas() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const reducedMotion = useReducedMotion()

  const [zoomValue, setZoom] = usePersistentState<string>("vekoo.editor.zoom", "1")
  const [safeArea, setSafeArea] = usePersistentState<"on" | "off">(
    "vekoo.editor.safeArea",
    "off"
  )
  const zoom = Number(zoomValue) || 1

  const { cards, theme, format } = state.doc
  const active = activeCard(state)
  const index = active ? cards.indexOf(active) : 0
  const ratio = FORMAT_RATIOS[format]
  const selection = state.selection

  // Teclado: sem bloco selecionado, setas trocam de card; com bloco, setas
  // andam pela pilha (Alt+setas reordena), Enter edita, Esc solta,
  // Delete/Backspace remove. Campos de texto ficam fora disso.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true]")) {
        return
      }
      if (!active) return

      if (selection.blockId) {
        const blocks = active.blocks
        const blockIndex = blocks.findIndex((b) => b.id === selection.blockId)
        if (blockIndex < 0) return
        switch (e.key) {
          case "Escape":
            e.preventDefault()
            dispatch({ type: "block/select", id: null })
            return
          case "Enter":
            e.preventDefault()
            dispatch({ type: "block/edit", editing: true })
            return
          case "Delete":
          case "Backspace":
            e.preventDefault()
            dispatch({ type: "block/remove", id: selection.blockId })
            return
          case "ArrowUp":
          case "ArrowDown": {
            e.preventDefault()
            const direction = e.key === "ArrowUp" ? -1 : 1
            if (e.altKey) {
              dispatch({
                type: "block/move",
                id: selection.blockId,
                direction,
              })
            } else {
              const neighbor = blocks[blockIndex + direction]
              if (neighbor) dispatch({ type: "block/select", id: neighbor.id })
            }
            return
          }
        }
        return
      }

      if (e.altKey) return
      const step =
        e.key === "ArrowDown" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowUp" || e.key === "ArrowLeft"
            ? -1
            : 0
      if (step === 0) return
      e.preventDefault()
      const next = cards[index + step]
      if (next) dispatch({ type: "card/activate", id: next.id })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cards, index, active, selection, dispatch])

  if (!active) return <EmptyCanvas />

  return (
    <section
      className="flex min-w-0 flex-1 flex-col bg-muted/40"
      onClick={() => dispatch({ type: "block/select", id: null })}
    >
      <div
        className={cn(
          "min-h-0 w-full flex-1 p-4 [container-type:size] md:p-8",
          zoom > 1 && "overflow-auto"
        )}
      >
        <div className="flex h-full w-full items-center justify-center">
          <motion.div
            key={active.id}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              width: `min(100%, calc(100cqh * ${ratio}))`,
              transform: zoom > 1 ? `scale(${zoom})` : undefined,
            }}
            className="relative shrink-0 shadow-[0_18px_40px_-24px_oklch(0.185_0.005_285/0.45)]"
          >
            <EditableCard card={active} theme={theme} format={format} />
            {safeArea === "on" && <SafeAreaOverlay />}
          </motion.div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-1 pb-2.5">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("editor.canvas.zoomOut")}
          disabled={zoom <= ZOOM_STEPS[0]}
          onClick={() => setZoom(stepZoom(zoom, -1))}
        >
          <ZoomOut />
        </Button>
        <span className="w-11 text-center text-xs text-muted-foreground tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("editor.canvas.zoomIn")}
          disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          onClick={() => setZoom(stepZoom(zoom, 1))}
        >
          <ZoomIn />
        </Button>

        <Separator orientation="vertical" className="mx-1.5 !h-4" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("editor.canvas.safeArea")}
                aria-pressed={safeArea === "on"}
                className={cn(safeArea === "on" && "bg-accent text-accent-foreground")}
                onClick={() => setSafeArea(safeArea === "on" ? "off" : "on")}
              />
            }
          >
            <Frame />
          </TooltipTrigger>
          <TooltipContent side="top">
            {t("editor.canvas.safeAreaHint")}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1.5 !h-4" />

        <span className="text-xs text-muted-foreground tabular-nums">
          {t("editor.canvas.position", { current: index + 1, total: cards.length })}
        </span>
      </div>
    </section>
  )
}

/**
 * A margem que o feed do Instagram come nas bordas. Quem não vê isso publica
 * texto cortado — por isso o alternador vive ao lado do card, não escondido.
 */
function SafeAreaOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 border-[6cqw] border-primary/15"
    >
      <div className="h-full w-full border border-dashed border-primary/50" />
    </div>
  )
}

/** Carrossel sem nenhum card — um convite, nunca um vazio mudo. */
function EmptyCanvas() {
  const { t } = useTranslation()
  const { dispatch } = useEditor()

  return (
    <section className="flex min-w-0 flex-1 items-center justify-center bg-muted/40 p-8">
      <EmptyState
        icon={<Layers className="size-5" />}
        title={t("editor.canvas.emptyTitle")}
        description={t("editor.canvas.emptyDescription")}
        action={{
          label: t("editor.canvas.emptyAction"),
          onClick: () =>
            dispatch({
              type: "card/insert",
              index: 0,
              card: emptyCard(newId("card")),
            }),
        }}
      />
    </section>
  )
}
