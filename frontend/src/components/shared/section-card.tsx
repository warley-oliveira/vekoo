import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type SectionCardProps = {
  title?: ReactNode
  description?: ReactNode
  /** À direita do título. */
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Conteúdo encostado nas bordas, para listas e tabelas. */
  flush?: boolean
  className?: string
  contentClassName?: string
}

/** Agrupa um assunto dentro da página quando só o espaçamento não basta. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  footer,
  flush = false,
  className,
  contentClassName,
}: SectionCardProps) {
  const hasHeader = title || description || actions

  return (
    <Card className={className}>
      {hasHeader ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
          {actions ? <CardAction>{actions}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(flush && "px-0", contentClassName)}>{children}</CardContent>
      {footer ? <CardFooter className="justify-end gap-2">{footer}</CardFooter> : null}
    </Card>
  )
}
