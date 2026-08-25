import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Plus } from "lucide-react"

import {
  cardContentClass,
  CardImageRegions,
  CardShell,
} from "@/components/editor/card-art"
import { EditableBlock } from "@/components/editor/editable-block"
import { InsertMenu } from "@/components/editor/insert-slot"
import {
  blockLayoutClass,
  type CarouselCard,
  type CarouselFormat,
  type CarouselTheme,
} from "@/lib/doc"

// O card vivo do canvas: a mesma moldura e as mesmas regiões da arte
// estática, com cada bloco embrulhado em seleção/edição.

type EditableCardProps = {
  card: CarouselCard
  theme: CarouselTheme
  format: CarouselFormat
}

export function EditableCard({ card, theme, format }: EditableCardProps) {
  const reducedMotion = useReducedMotion()

  return (
    <CardShell card={card} theme={theme} format={format} interactive>
      <CardImageRegions
        card={card}
        theme={theme}
        content={
          <div className={cardContentClass(card.align)}>
            {card.blocks.length === 0 ? (
              <EmptyCardInsert />
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {card.blocks.map((block, index) => (
                  <motion.div
                    key={block.id}
                    layout={reducedMotion ? false : "position"}
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className={blockLayoutClass(block)}
                  >
                    <EditableBlock
                      block={block}
                      theme={theme}
                      index={index}
                      isLast={index === card.blocks.length - 1}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        }
      />
    </CardShell>
  )
}

/** Card sem nenhum bloco: um único convite, no centro. */
function EmptyCardInsert() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-1 items-center justify-center">
      <InsertMenu
        index={0}
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-[2cqw] border-[0.4cqw] border-dashed border-current/40 px-[5cqw] py-[3cqw] text-[4.2cqw] font-medium opacity-70 outline-none hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="size-[4.5cqw] min-h-4 min-w-4" />
            {t("editor.canvas.addFirstBlock")}
          </button>
        }
      />
    </div>
  )
}
