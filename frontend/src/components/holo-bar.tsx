import { motion, useReducedMotion } from "motion/react"

/**
 * A barra de progresso do site: 2px, trilho neutro e o holográfico como
 * preenchimento — o único brilho do chrome. O gradiente encolhe junto (escala
 * em X), então o espectro inteiro aparece em qualquer proporção.
 */
export function HoloBar({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <div aria-hidden className={className ?? "h-0.5 w-full bg-vk-track"}>
      <motion.div
        className="bg-holo h-full origin-left"
        initial={false}
        animate={{ scaleX: Math.min(Math.max(value, 0), 1) }}
        transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5 }}
      />
    </div>
  )
}
