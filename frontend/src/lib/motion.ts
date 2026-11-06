import { useMemo } from "react"
import {
  useReducedMotion,
  type MotionProps,
  type Transition,
  type Variants,
} from "motion/react"

// Linguagem de movimento do app, num lugar só. Springs para o que responde à
// pessoa, easing curto para o resto, bounce abaixo de 0.1, 150 a 300 ms, e só
// `transform` e `opacity`.
//
//   const motionPreset = useMotionPreset()
//   <motion.div {...motionPreset.slideUp} />
//
// Prefira sempre `useMotionPreset()`: ele troca o deslocamento por um fade curto
// quando a pessoa pediu menos movimento no sistema. As constantes exportadas
// servem para fora de componente e para compor transições próprias.

export const spring: Transition = { type: "spring", duration: 0.25, bounce: 0.05 }
export const springSoft: Transition = { type: "spring", duration: 0.3, bounce: 0 }

const easeOut: Transition = { duration: 0.15, ease: "easeOut" }

type Preset = Pick<MotionProps, "initial" | "animate" | "exit" | "transition">
type ContainerPreset = Pick<MotionProps, "initial" | "animate" | "variants">

export const fade: Preset = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: easeOut,
}

export const slideUp: Preset = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: spring,
}

/** Linha que entra ou sai de uma lista, com `AnimatePresence`. */
export const listItem: Preset = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98 },
  transition: springSoft,
}

const STAGGER_STEP = 0.03

/** Para o contêiner: `<motion.ul {...preset.stagger}>` com `<motion.li variants={preset.staggerItem}>`. */
export const stagger: ContainerPreset = {
  initial: "hidden",
  animate: "show",
  variants: {
    hidden: {},
    show: { transition: { staggerChildren: STAGGER_STEP } },
  },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: springSoft },
}

const INSTANT: Transition = { duration: 0 }

export type MotionPreset = {
  reduced: boolean
  spring: Transition
  springSoft: Transition
  fade: Preset
  slideUp: Preset
  listItem: Preset
  stagger: ContainerPreset
  staggerItem: Variants
}

const fullPreset: MotionPreset = {
  reduced: false,
  spring,
  springSoft,
  fade,
  slideUp,
  listItem,
  stagger,
  staggerItem,
}

// O caminho reduzido mantém a informação (algo entrou, algo saiu) sem o
// deslocamento: só um fade, que não dispara sensibilidade vestibular.
const reducedPreset: MotionPreset = {
  reduced: true,
  spring: INSTANT,
  springSoft: INSTANT,
  fade,
  slideUp: { ...fade },
  listItem: { ...fade },
  stagger: {
    ...stagger,
    variants: { hidden: {}, show: {} },
  },
  staggerItem: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: easeOut },
  },
}

/** Os presets já adaptados à preferência de movimento da pessoa. */
export function useMotionPreset(): MotionPreset {
  const reduced = useReducedMotion()
  return useMemo(() => (reduced ? reducedPreset : fullPreset), [reduced])
}
