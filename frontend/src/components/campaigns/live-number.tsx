import { useEffect, useLayoutEffect, useRef } from "react"
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react"

import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type LiveNumberProps = {
  value: number
  /** Como escrever o número. O padrão é o do idioma ativo. */
  format?: (value: number) => string
  className?: string
}

/**
 * Número que anda em vez de saltar: é o sinal de que a campanha está viva. O valor passa por uma
 * `MotionValue` e vai direto ao DOM, então a animação não re-renderiza o React a cada quadro.
 */
export function LiveNumber({ value, format, className }: LiveNumberProps) {
  const language = useLanguage()
  const reduced = useReducedMotion()

  const formatter = useRef(format)
  const languageRef = useRef(language)
  useLayoutEffect(() => {
    formatter.current = format
    languageRef.current = language
  })

  const motionValue = useMotionValue(value)
  const text = useTransform(motionValue, (current) => {
    const rounded = Math.round(current)
    return formatter.current?.(rounded) ?? formatNumber(rounded, languageRef.current)
  })

  useEffect(() => {
    if (reduced) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, { duration: 0.3, ease: "easeOut" })
    return () => controls.stop()
  }, [motionValue, reduced, value])

  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>
}
