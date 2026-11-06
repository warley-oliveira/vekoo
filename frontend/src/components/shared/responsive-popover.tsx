import type { ComponentProps, ReactElement, ReactNode } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import { useSheetFocus } from "./use-sheet-focus"

export type ResponsivePopoverProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger: ReactElement
  /** Título da Sheet no celular e nome acessível do popover. */
  title: string
  children: ReactNode
  align?: ComponentProps<typeof PopoverContent>["align"]
  /** Classes do popover no desktop (largura, por exemplo). */
  className?: string
  /** Classes do corpo da Sheet no celular. */
  sheetClassName?: string
  /** Mantém o título visível também no desktop. */
  showTitle?: boolean
}

/**
 * Painel preso a um botão no desktop, Sheet inferior no celular, onde um popover
 * grande não cabe nem deixa o dedo trabalhar. Base de datas, filtros e cor.
 */
export function ResponsivePopover({
  open,
  onOpenChange,
  trigger,
  title,
  children,
  align = "start",
  className,
  sheetClassName,
  showTitle = false,
}: ResponsivePopoverProps) {
  const isMobile = useIsMobile()
  const { popupRef, initialFocus } = useSheetFocus()

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(next) => onOpenChange?.(next)}>
        <SheetTrigger render={trigger} />
        <SheetContent
          ref={popupRef}
          initialFocus={initialFocus}
          side="bottom"
          className="max-h-[90dvh] gap-0 rounded-t-2xl outline-none"
          showCloseButton={false}
        >
          <SheetTitle className="px-4 pt-4 pb-2">{title}</SheetTitle>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
              sheetClassName
            )}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} aria-label={title} className={className}>
        {showTitle ? <p className="text-sm font-medium">{title}</p> : null}
        {children}
      </PopoverContent>
    </Popover>
  )
}
