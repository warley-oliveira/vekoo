import { useState, type ReactNode } from "react"
import { motion } from "motion/react"

import { isLiveChange } from "@/lib/chat/live-change"
import { useMotionPreset } from "@/lib/motion"

/** Até esta posição, uma linha que aparece por causa de um evento é novidade (subiu ou chegou). */
const ENTERING_ROWS = 3

/** Quanto o destaque da novidade fica antes de sumir, e quanto leva sumindo. */
const HIGHLIGHT_HOLD_S = 0.6
const HIGHLIGHT_FADE_S = 0.3

/**
 * O lugar de uma linha na lista, para a troca de ordem ser vista. Quando uma conversa sobe para o
 * topo, ela desliza por cima das outras, e as outras descem um degrau: a pessoa vê de onde ela
 * veio, em vez de a lista inteira trocar debaixo do cursor.
 *
 * Só mede quando a posição muda por um evento (`isLiveChange`): filtrar ou trocar de aba não anima.
 * A linha em si é memoizada e não se desenha; só este invólucro, que é barato. A lista é virtual,
 * então o que entra na tela vindo de fora dela não tem de onde deslizar: entra com fade e um
 * destaque breve, que é como "chegou agora" se diz sem cor saturada.
 */
export function ReorderSlot({ index, children }: { index: number; children: ReactNode }) {
  const preset = useMotionPreset()
  const live = isLiveChange()

  const [place, setPlace] = useState({ index, lifted: false })
  if (live && place.index !== index) {
    // Subiu mais de um degrau: é a que se moveu, e passa por cima das que descem.
    setPlace({ index, lifted: place.index - index > 1 })
  }

  const [entering] = useState(() => live && index < ENTERING_ROWS)

  return (
    <motion.div
      layout={preset.reduced ? false : "position"}
      layoutDependency={place.index}
      transition={preset.springSoft}
      className="relative"
      style={{ zIndex: place.lifted ? 1 : 0 }}
    >
      {entering ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 inset-y-px rounded-lg bg-primary/[0.07]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: HIGHLIGHT_HOLD_S, duration: HIGHLIGHT_FADE_S, ease: "easeOut" }}
        />
      ) : null}
      {entering ? (
        <motion.div
          initial={preset.reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={preset.reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={preset.reduced ? { duration: 0.15 } : preset.spring}
        >
          {children}
        </motion.div>
      ) : (
        children
      )}
    </motion.div>
  )
}
