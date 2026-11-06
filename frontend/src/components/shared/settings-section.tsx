import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type SettingsSectionProps = {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Rodapé da seção, geralmente `FormActions`. */
  footer?: ReactNode
  className?: string
}

/**
 * Bloco de página de configurações: explicação à esquerda, controles à direita, e
 * empilhado no celular. Seções vizinhas se separam sozinhas por um fio.
 */
export function SettingsSection({
  title,
  description,
  children,
  footer,
  className,
}: SettingsSectionProps) {
  return (
    <section
      data-slot="settings-section"
      className={cn(
        "grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-10 md:pt-8",
        className
      )}
    >
      <div className="space-y-1">
        <h2 className="font-heading text-base leading-snug font-medium">{title}</h2>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {children}
        {footer}
      </div>
    </section>
  )
}
