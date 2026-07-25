import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

import { EditableCard } from "@/components/editor/card-editable"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { FORMAT_RATIOS } from "@/lib/doc"

// O canvas: o card ativo no formato exato, sempre inteiro na tela, sem
// rolagem. O truque do encaixe é o contêiner com container-type:size — a
// largura do card vira min(100% da área, altura da área × proporção), e
// quando o painel de propriedades abre, o card se reencaixa sozinho.

export function CardCanvas() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const reducedMotion = useReducedMotion()

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

  if (!active) return null

  return (
    <section
      className="flex min-w-0 flex-1 flex-col bg-muted/40"
      onClick={() => dispatch({ type: "block/select", id: null })}
    >
      <div className="min-h-0 w-full flex-1 p-4 [container-type:size] md:p-8">
        <div className="flex h-full w-full items-center justify-center">
          <motion.div
            key={active.id}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ width: `min(100%, calc(100cqh * ${ratio}))` }}
            className="shadow-[0_18px_40px_-24px_oklch(0.185_0.005_285/0.45)]"
          >
            <EditableCard card={active} theme={theme} format={format} />
          </motion.div>
        </div>
      </div>
      <p className="shrink-0 pb-3 text-center text-xs text-muted-foreground tabular-nums">
        {t("editor.canvas.position", {
          current: index + 1,
          total: cards.length,
        })}
      </p>
    </section>
  )
}
