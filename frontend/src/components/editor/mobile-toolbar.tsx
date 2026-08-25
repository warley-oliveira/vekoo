import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Plus, Settings2, X } from "lucide-react"

import { BlockPanel } from "@/components/editor/block-panel"
import { CardPanel } from "@/components/editor/card-panel"
import { activeCard, useEditor } from "@/components/editor/editor-store"
import { InsertMenu } from "@/components/editor/insert-slot"
import { Button } from "@/components/ui/button"

// No telefone não cabe painel lateral nem barra de blocos — mas editar não
// pode virar privilégio de desktop. A mesma inserção e os mesmos painéis
// entram por uma barra embaixo e uma folha que sobe.

export function MobileToolbar() {
  const { t } = useTranslation()
  const { state } = useEditor()
  const [open, setOpen] = useState(false)

  const card = activeCard(state)
  if (!card) return null

  const blockIndex = card.blocks.findIndex((b) => b.id === state.selection.blockId)
  const insertAt = blockIndex >= 0 ? blockIndex + 1 : card.blocks.length

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-t bg-background p-2 lg:hidden">
        <InsertMenu
          index={insertAt}
          trigger={<Button variant="outline" size="sm" className="flex-1" />}
        >
          <Plus />
          {t("editor.mobile.addBlock")}
        </InsertMenu>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setOpen(true)}
        >
          <Settings2 />
          {t("editor.mobile.adjust")}
        </Button>
      </div>

      <AnimatePresence>
        {open && <MobileSheet onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  )
}

/** A folha que sobe com o painel do bloco ou do card — o mesmo conteúdo. */
function MobileSheet({ onClose }: { onClose: () => void }) {
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

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <motion.div
        aria-hidden
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t("editor.properties.label")}
        initial={reducedMotion ? { opacity: 0 } : { y: "100%" }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
        exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-hidden rounded-t-2xl bg-background shadow-2xl"
      >
        <div className="flex items-center justify-end px-2 pt-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("editor.mobile.close")}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="max-h-[calc(75dvh-3rem)] overflow-y-auto [&>div]:h-auto [&>div]:w-full">
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
        </div>
      </motion.div>
    </div>,
    document.body
  )
}
