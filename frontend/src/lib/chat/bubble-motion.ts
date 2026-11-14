import type { MotionProps, Transition } from "motion/react"

/** Quanto dura a entrada da bolha, para quem continua uma que já começou. */
export const BUBBLE_ENTER_MS = 250

/**
 * De onde a bolha nasce. A nossa sobe do composer, com um quase nada de escala, do canto de baixo
 * à direita, onde o dedo ou o Enter estavam. A do contato chega do lado dele, deslizando da
 * esquerda. Com menos movimento, as duas só aparecem. Só `transform` e `opacity`.
 */
export function bubbleEntry(
  own: boolean,
  reduced: boolean
): Pick<MotionProps, "initial" | "animate" | "style"> {
  if (reduced) return { initial: { opacity: 0 }, animate: { opacity: 1 } }
  return own
    ? {
        initial: { opacity: 0, y: 14, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        style: { transformOrigin: "100% 100%" },
      }
    : {
        initial: { opacity: 0, x: -10, scale: 0.98 },
        animate: { opacity: 1, x: 0, scale: 1 },
        style: { transformOrigin: "0% 100%" },
      }
}

/** O caminho reduzido: um fade curto, sem deslocamento. */
export const BUBBLE_REDUCED_TRANSITION: Transition = { duration: 0.15, ease: "easeOut" }

/**
 * O resto da entrada da nossa bolha, a partir de `progress` (0 a 1): é o que a mensagem confirmada
 * faz quando chega antes de a otimista terminar de subir. Sem isto, ela apareceria inteira de uma
 * vez no meio do movimento.
 */
export function bubbleEntryFrom(
  progress: number,
  reduced: boolean
): Pick<MotionProps, "initial" | "animate" | "style" | "transition"> {
  const done = Math.min(Math.max(progress, 0), 1)
  if (reduced) {
    return {
      initial: { opacity: done },
      animate: { opacity: 1 },
      transition: { duration: (150 * (1 - done)) / 1000, ease: "easeOut" },
    }
  }
  // A otimista anda depressa no começo (mola): a posição já percorrida cresce mais que o tempo.
  const travelled = 1 - (1 - done) ** 2
  return {
    initial: { opacity: travelled, y: 14 * (1 - travelled), scale: 0.97 + 0.03 * travelled },
    animate: { opacity: 1, y: 0, scale: 1 },
    style: { transformOrigin: "100% 100%" },
    transition: { duration: (BUBBLE_ENTER_MS * (1 - done)) / 1000, ease: "easeOut" },
  }
}
