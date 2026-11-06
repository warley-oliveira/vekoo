import type { FormEventHandler, ReactElement, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const SIZES = {
  md: "data-[side=right]:sm:max-w-md",
  lg: "data-[side=right]:sm:max-w-lg",
  xl: "data-[side=right]:sm:max-w-2xl",
} as const

export type SidePanelProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactElement
  title: ReactNode
  description?: ReactNode
  /** Ao lado do fechar, no topo. */
  headerActions?: ReactNode
  children: ReactNode
  /** Fica fixo embaixo, com o corpo rolando entre o cabeçalho e ele. */
  footer?: ReactNode
  size?: keyof typeof SIZES
  /** Vira o conteúdo em `<form>`, com o `footer` dentro. */
  onSubmit?: FormEventHandler<HTMLFormElement>
  disablePointerDismissal?: boolean
  className?: string
  bodyClassName?: string
}

/**
 * Detalhe ou edição sem sair da lista: entra pela direita, ocupa a largura toda no
 * celular. É a escolha padrão no lugar de um modal grande.
 */
export function SidePanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  headerActions,
  children,
  footer,
  size = "md",
  onSubmit,
  disablePointerDismissal,
  className,
  bodyClassName,
}: SidePanelProps) {
  const { t } = useTranslation()

  const content = (
    <>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", bodyClassName)}>
        {children}
      </div>
      {footer ? (
        <div className="flex flex-col-reverse gap-2 border-t bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          {footer}
        </div>
      ) : null}
    </>
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      disablePointerDismissal={disablePointerDismissal}
    >
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "gap-0 data-[side=right]:w-full",
          SIZES[size],
          className
        )}
      >
        <div className="flex shrink-0 items-start gap-3 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1 space-y-0.5">
            <SheetTitle className="truncate">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-pretty">{description}</SheetDescription>
            ) : null}
          </div>
          <div className="-mr-1 flex shrink-0 items-center gap-1">
            {headerActions}
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("kit.actions.close")}
                />
              }
            >
              <X />
            </SheetClose>
          </div>
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            {content}
          </form>
        ) : (
          content
        )}
      </SheetContent>
    </Sheet>
  )
}
