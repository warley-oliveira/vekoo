import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

// As peças de uma conversa do brandcore. A fala do agente não tem balão: é
// texto corrido, como quem escreve num terminal — a interface fica quieta e
// quem chama atenção é o que a pessoa conta. A fala dela tem balão, à direita,
// porque é o que muda de turno para turno.

/** Entrada suave das falas novas. Some com `prefers-reduced-motion`. */
export function Appear({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function AgentLine({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("max-w-prose text-[15px] leading-relaxed text-pretty", className)}>{children}</p>
}

/** "paleta gravada ✓" — o log do que entrou no brandcore. */
export function StatusLine({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>
}

export function UserBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-pretty",
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** O agente lendo a resposta. Três pontos em mono, sem spinner. */
export function Thinking() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <div role="status" aria-label={t("onboarding.a11y.thinking")} className="flex h-6 items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground"
          animate={reduced ? { opacity: 0.6 } : { opacity: [0.25, 1, 0.25] }}
          transition={reduced ? undefined : { duration: 1.2, repeat: Infinity, delay: dot * 0.18 }}
        />
      ))}
    </div>
  )
}
