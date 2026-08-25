import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { CardArt } from "@/components/editor/card-art"
import { useEditor } from "@/components/editor/editor-store"
import { Button } from "@/components/ui/button"
import { FORMAT_RATIOS } from "@/lib/doc"
import { cn } from "@/lib/utils"

// Ver o carrossel como quem passa o dedo nele. É o teste de realidade do
// produto: só olhando em sequência dá para saber se ele funciona — se a capa
// segura, se cada card entrega uma coisa, se o último fecha.

const SWIPE_DISTANCE = 60

export function PreviewOverlay({
  startIndex,
  onClose,
}: {
  startIndex: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state } = useEditor()
  const reducedMotion = useReducedMotion()
  const { cards, theme, format } = state.doc

  const [index, setIndex] = useState(startIndex)
  const [direction, setDirection] = useState(0)

  const go = (step: number) => {
    setIndex((current) => {
      const next = current + step
      if (next < 0 || next >= cards.length) return current
      setDirection(step)
      return next
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight" || e.key === "ArrowDown") go(1)
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const card = cards[index]
  if (!card) return null

  const enter = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, x: direction >= 0 ? 40 : -40 }
  const exit = reducedMotion
    ? { opacity: 0 }
    : { opacity: 0, x: direction >= 0 ? -40 : 40 }

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t("editor.preview.label")}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex flex-col bg-foreground/90 backdrop-blur-sm"
    >
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        <span className="text-sm text-background/80 tabular-nums">
          {t("editor.canvas.position", { current: index + 1, total: cards.length })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editor.preview.close")}
          className="text-background hover:bg-background/15 hover:text-background"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 px-3 pb-3 [container-type:size]">
        <PreviewArrow
          side="left"
          disabled={index === 0}
          label={t("editor.preview.previous")}
          onClick={() => go(-1)}
        />

        <div
          className="flex h-full items-center justify-center"
          style={{ width: `min(100%, calc(100cqh * ${FORMAT_RATIOS[format]}))` }}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={card.id}
              initial={enter}
              animate={{ opacity: 1, x: 0 }}
              exit={exit}
              transition={{ duration: 0.22, ease: "easeOut" }}
              drag={reducedMotion ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.12}
              onDragEnd={(_, info) => {
                if (info.offset.x < -SWIPE_DISTANCE) go(1)
                if (info.offset.x > SWIPE_DISTANCE) go(-1)
              }}
              className="w-full cursor-grab shadow-2xl active:cursor-grabbing"
            >
              <CardArt card={card} theme={theme} format={format} />
            </motion.div>
          </AnimatePresence>
        </div>

        <PreviewArrow
          side="right"
          disabled={index === cards.length - 1}
          label={t("editor.preview.next")}
          onClick={() => go(1)}
        />
      </div>

      {/* Os pontinhos do Instagram: mostram tamanho e posição de relance. */}
      <div className="flex shrink-0 items-center justify-center gap-1.5 pb-5">
        {cards.map((item, i) => (
          <button
            key={item.id}
            type="button"
            aria-label={t("editor.preview.goTo", { number: i + 1 })}
            aria-current={i === index ? "true" : undefined}
            onClick={() => {
              setDirection(i > index ? 1 : -1)
              setIndex(i)
            }}
            className={cn(
              "size-1.5 rounded-full outline-none transition-opacity",
              "focus-visible:ring-3 focus-visible:ring-background/50",
              i === index ? "bg-background" : "bg-background/40 hover:bg-background/70"
            )}
          />
        ))}
      </div>
    </motion.div>,
    document.body
  )
}

function PreviewArrow({
  side,
  disabled,
  label,
  onClick,
}: {
  side: "left" | "right"
  disabled: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hidden shrink-0 rounded-full text-background hover:bg-background/15 hover:text-background disabled:opacity-25 sm:flex"
    >
      {side === "left" ? <ChevronLeft /> : <ChevronRight />}
    </Button>
  )
}
