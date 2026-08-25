import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { BlockPanel } from "@/components/editor/block-panel"
import { CardPanel } from "@/components/editor/card-panel"
import { activeCard, useEditor } from "@/components/editor/editor-store"

// O painel da direita tem duas caras: com bloco selecionado mostra o bloco;
// sem seleção, mostra o card. Nunca fica vazio — sempre há algo para ajustar.
// Continua sempre montado: a largura é fixa e o card do canvas se reencaixa
// sozinho, porque o encaixe é uma container query.

export function PropertiesPanel() {
  const { t } = useTranslation()
  const { state, dispatch } = useEditor()
  const reducedMotion = useReducedMotion()

  const card = activeCard(state)
  const cardIndex = card ? state.doc.cards.indexOf(card) : -1
  const blockIndex = card
    ? card.blocks.findIndex((b) => b.id === state.selection.blockId)
    : -1
  const block = blockIndex >= 0 ? card?.blocks[blockIndex] : undefined

  if (!card) return null

  const enter = reducedMotion ? {} : { opacity: 0, x: 8 }

  return (
    <aside
      aria-label={t("editor.properties.label")}
      className="hidden w-60 shrink-0 overflow-hidden border-l bg-background lg:block"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={block ? `block-${block.id}` : `card-${card.id}`}
          initial={enter}
          animate={{ opacity: 1, x: 0 }}
          exit={reducedMotion ? {} : { opacity: 0, x: -8 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="h-full"
        >
          {block ? (
            <BlockPanel
              block={block}
              index={blockIndex}
              theme={state.doc.theme}
              onClose={() => dispatch({ type: "block/select", id: null })}
            />
          ) : (
            <CardPanel card={card} index={cardIndex} theme={state.doc.theme} />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}
