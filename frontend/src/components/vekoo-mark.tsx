import { cn } from "@/lib/utils"

/** A marca em texto, nas telas de entrada e nos estados de abertura. */
export function VekooMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading text-lg font-bold tracking-tight", className)}>
      vekoo<span className="text-primary">.</span>
    </span>
  )
}

/** A marca compacta, onde só cabe o quadrado: cabeçalho do celular. */
export function VekooGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-heading text-xl leading-none font-bold tracking-tight",
        className
      )}
    >
      v<span className="text-primary">.</span>
    </span>
  )
}
