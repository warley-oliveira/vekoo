import type { FormEventHandler, ReactElement, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import { useSheetFocus } from "./use-sheet-focus"

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
} as const

export type ResponsiveDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Botão que abre. Dispensável quando `open` é controlado. */
  trigger?: ReactElement
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Fica fixo embaixo, com o corpo rolando entre o título e ele. */
  footer?: ReactNode
  size?: keyof typeof SIZES
  /** Vira o conteúdo em `<form>`, com o `footer` dentro: o botão de enviar funciona sem `form=`. */
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** Clicar fora não fecha. Use quando a pessoa pode perder o que digitou. */
  disablePointerDismissal?: boolean
  className?: string
  bodyClassName?: string
}

/**
 * Tarefa curta sobre a tela atual: Dialog no desktop, Sheet que sobe de baixo no
 * celular. Para detalhes e edições longas, prefira o `SidePanel`.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  size = "md",
  onSubmit,
  disablePointerDismissal,
  className,
  bodyClassName,
}: ResponsiveDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const { popupRef, initialFocus } = useSheetFocus()

  // Vem depois do conteúdo no DOM, embora apareça no topo: o teclado começa no primeiro
  // campo, e não no fechar.
  const closeButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("kit.actions.close")}
      className="absolute top-3 right-3"
    />
  )

  const content = (
    <>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", bodyClassName)}>
        {children}
      </div>
      {footer ? (
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/50 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          {footer}
        </div>
      ) : null}
    </>
  )

  const body = onSubmit ? (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      {content}
    </form>
  ) : (
    content
  )

  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => onOpenChange?.(next)}
        disablePointerDismissal={disablePointerDismissal}
      >
        {trigger ? <SheetTrigger render={trigger} /> : null}
        <SheetContent
          ref={popupRef}
          initialFocus={initialFocus}
          side="bottom"
          showCloseButton={false}
          className={cn("max-h-[90dvh] gap-0 rounded-t-2xl outline-none", className)}
        >
          <div className="space-y-1 p-4 pr-12 pb-3">
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </div>
          {body}
          <SheetClose render={closeButton}>
            <X />
          </SheetClose>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      disablePointerDismissal={disablePointerDismissal}
    >
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[min(85dvh,48rem)] flex-col gap-0 overflow-hidden p-0",
          SIZES[size],
          className
        )}
      >
        <div className="space-y-1.5 p-4 pr-12 pb-3">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </div>
        {body}
        <DialogClose render={closeButton}>
          <X />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
