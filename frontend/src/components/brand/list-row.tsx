import type { ReactNode } from "react"
import { Plus, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A moldura das listas dinâmicas do formulário (personagens, cores, palavras
// banidas, fatos): a mesma linha, o mesmo botão de remover, a mesma entrada.

type ListRowProps = {
  children: ReactNode
  onRemove?: () => void
  removeLabel: string
  className?: string
}

export function ListRow({ children, onRemove, removeLabel, className }: ListRowProps) {
  const reduced = useReducedMotion()
  return (
    <motion.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("flex items-start gap-2 rounded-lg border bg-card p-3", className)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-1 shrink-0 text-muted-foreground"
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <X />
        </Button>
      )}
    </motion.li>
  )
}

type ListProps = { children: ReactNode; className?: string; "aria-label"?: string }

export function List({ children, className, ...aria }: ListProps) {
  return (
    <ul className={cn("space-y-2", className)} aria-label={aria["aria-label"]}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </ul>
  )
}

type AddButtonProps = { onClick: () => void; children: ReactNode; disabled?: boolean }

export function AddButton({ onClick, children, disabled }: AddButtonProps) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <Plus /> {children}
    </Button>
  )
}
