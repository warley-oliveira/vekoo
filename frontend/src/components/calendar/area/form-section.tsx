import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Um assunto dentro de um formulário comprido de painel lateral. O fio separa um do outro, e o
 * título é pequeno: quem manda na hierarquia é o título do painel.
 */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn("flex flex-col gap-4 border-t pt-5 first:border-t-0 first:pt-0", className)}
    >
      {title || action ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            {title ? <h3 className="font-heading text-sm font-medium">{title}</h3> : null}
            {description ? (
              <p className="text-xs leading-snug text-pretty text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
