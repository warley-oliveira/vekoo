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
import { useIsMobile } from "@/hooks/use-is-mobile"
import { cn } from "@/lib/utils"
import { useSheetFocus } from "./use-sheet-focus"

/**
 * Do aviso curto ao detalhe pesado. A largura é do tamanho; a altura acompanha o conteúdo até o
 * teto, e o corpo rola entre o cabeçalho e o rodapé, que ficam parados.
 *
 * - `sm` (24rem): uma pergunta ou um campo. Renomear, escolher uma opção.
 * - `md` (28rem): formulário curto, até uns cinco campos.
 * - `lg` (32rem): formulário com seções, ou um detalhe simples.
 * - `xl` (42rem): detalhe com abas, formulário longo, lista para escolher.
 * - `2xl` (56rem): duas colunas, prévia ao lado, tabela de conferência.
 * - `full` (até 88rem × 90dvh, altura fixa): trabalho que pede a tela, como o card do pipeline,
 *   editor de código, editor de widget e importações.
 */
const SIZES = {
  sm: { width: "sm:max-w-sm", height: "short", divided: false },
  md: { width: "sm:max-w-md", height: "short", divided: false },
  lg: { width: "sm:max-w-lg", height: "short", divided: false },
  xl: { width: "sm:max-w-2xl", height: "tall", divided: true },
  "2xl": { width: "sm:max-w-4xl", height: "tall", divided: true },
  full: { width: "sm:max-w-[min(96vw,88rem)]", height: "full", divided: true },
} as const

export type ResponsiveDialogSize = keyof typeof SIZES

/** O teto de altura no desktop. `fixed` ocupa o teto sempre, para não saltar ao trocar de passo. */
const DESKTOP_HEIGHT = {
  short: { max: "max-h-[min(85dvh,48rem)]", fixed: "h-[min(85dvh,48rem)]" },
  tall: { max: "max-h-[min(90dvh,60rem)]", fixed: "h-[min(90dvh,60rem)]" },
  full: { max: "max-h-[90dvh]", fixed: "h-[90dvh]" },
} as const

/**
 * Como cada tamanho aparece no celular, abaixo do `md`. A decisão mora só aqui: para voltar à
 * folha que sobe de baixo, troque os valores por `"sheet"`.
 *
 * - `card`: cartão centrado, com 16 px de margem, preso ao viewport visível (o teclado não cobre).
 * - `screen`: tela cheia, com as áreas seguras.
 * - `sheet`: folha presa embaixo, com cantos de cima arredondados.
 */
const MOBILE_PRESENTATION: Record<ResponsiveDialogSize, MobilePresentation> = {
  sm: "card",
  md: "card",
  lg: "screen",
  xl: "screen",
  "2xl": "screen",
  full: "screen",
}

type MobilePresentation = "card" | "screen" | "sheet"

// `--app-vh` e `--app-vv-top` são o viewport visível (`VisualViewportBridge`): com o teclado aberto,
// a caixa encolhe junto, e o campo e o botão continuam à vista. Fora da casca, valem os `dvh`.
const MOBILE_CLASSES: Record<MobilePresentation, string> = {
  card: "top-[calc(var(--app-vv-top,0px)+var(--app-vh,100dvh)/2)] max-h-[calc(var(--app-vh,100dvh)-2rem)]",
  screen:
    "top-[var(--app-vv-top,0px)] left-0 h-[var(--app-vh,100dvh)] w-full max-w-none translate-x-0 translate-y-0 rounded-none ring-0 sm:max-w-none",
  sheet:
    "top-auto bottom-0 left-0 max-h-[calc(var(--app-vh,100dvh)*0.9)] w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none sm:max-w-none data-open:slide-in-from-bottom-10 data-closed:slide-out-to-bottom-10",
}

export type ResponsiveDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Botão que abre. Dispensável quando `open` é controlado. */
  trigger?: ReactElement
  title: ReactNode
  description?: ReactNode
  /** Ao lado do fechar, no topo: copiar, abrir em outra tela, menu de ações. */
  headerActions?: ReactNode
  children: ReactNode
  /** Fica fixo embaixo, com o corpo rolando entre o título e ele. */
  footer?: ReactNode
  /** Pelo conteúdo, não pela tela de onde abre. Ver `SIZES`. */
  size?: ResponsiveDialogSize
  /**
   * Ocupa o teto de altura mesmo com pouco conteúdo, para a caixa não saltar ao trocar de passo ou
   * de aba. `full` já nasce assim.
   */
  fixedHeight?: boolean
  /** Vira o conteúdo em `<form>`, com o `footer` dentro: o botão de enviar funciona sem `form=`. */
  onSubmit?: FormEventHandler<HTMLFormElement>
  /** Clicar fora não fecha. Use quando a pessoa pode perder o que digitou. */
  disablePointerDismissal?: boolean
  className?: string
  bodyClassName?: string
}

/**
 * O modal da plataforma: toda tarefa, edição ou detalhe abre aqui, com o tamanho que o conteúdo
 * pede. No celular, cartão centrado nos tamanhos pequenos e tela cheia nos grandes.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  headerActions,
  children,
  footer,
  size = "md",
  fixedHeight,
  onSubmit,
  disablePointerDismissal,
  className,
  bodyClassName,
}: ResponsiveDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { popupRef, initialFocus } = useSheetFocus()

  const config = SIZES[size]
  const presentation = isMobile ? MOBILE_PRESENTATION[size] : null
  const screen = presentation === "screen"
  const height = DESKTOP_HEIGHT[config.height]
  const fixed = fixedHeight || config.height === "full"

  const content = (
    <>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 pb-4",
          config.divided && "pt-4",
          bodyClassName
        )}
      >
        {children}
      </div>
      {footer ? (
        <div
          className={cn(
            "flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/50 px-4 pt-3 pb-3 sm:flex-row sm:justify-end",
            (screen || presentation === "sheet") && "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          )}
        >
          {footer}
        </div>
      ) : null}
    </>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      disablePointerDismissal={disablePointerDismissal}
    >
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        ref={popupRef}
        initialFocus={initialFocus}
        showCloseButton={false}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          config.width,
          presentation ? MOBILE_CLASSES[presentation] : fixed ? height.fixed : height.max,
          className
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-start gap-3 p-4 pr-12 pb-3",
            config.divided && "border-b",
            screen && "pt-[max(1rem,env(safe-area-inset-top))]"
          )}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <DialogTitle className="leading-snug break-words">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-pretty">{description}</DialogDescription>
            ) : null}
          </div>
          {headerActions ? (
            <div className="-my-1 flex shrink-0 items-center gap-1">{headerActions}</div>
          ) : null}
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            {content}
          </form>
        ) : (
          content
        )}
        {/* Depois do conteúdo no DOM, embora apareça no topo: o teclado começa no primeiro campo. */}
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("kit.actions.close")}
              className={cn(
                "absolute top-3 right-3",
                screen && "top-[max(0.75rem,env(safe-area-inset-top))]"
              )}
            />
          }
        >
          <X />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
