import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from "motion/react"
import { useTranslation } from "react-i18next"

import { useSheetFocus } from "@/components/shared/use-sheet-focus"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/** Puxar além disto (ou rápido assim) dispensa a folha. */
const DISMISS_OFFSET = 120
const DISMISS_VELOCITY = 700
/** Deslocamento que decide entre rolar o corpo e arrastar a folha. */
const DRAG_INTENT_PX = 6
/** Quanto a saída leva, para quem encadeia uma folha na outra (`replaceSheet`). */
export const SHEET_EXIT_MS = 220

/**
 * Elementos que resolvem o próprio gesto. Sem isto, um campo de busca nunca recebe
 * foco, porque o toque vira arrasto da folha.
 */
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, [role="slider"], [data-no-sheet-drag]'

function isInteractive(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.(INTERACTIVE_SELECTOR))
}

/**
 * O voltar do Android fecha a folha em vez de sair da tela: ao abrir, ela empilha uma
 * entrada no histórico; ao fechar, desfaz a sua, se ainda estiver no topo.
 *
 * Quem navega de dentro de uma folha usa `replace`: assim a entrada dela vira a rota
 * nova, em vez de ficar órfã e exigir um voltar a mais depois.
 */
function useCloseOnBack(open: boolean, onClose: () => void) {
  // Por ref, fora das dependências: quase todo mundo passa uma arrow nova. Com ela nas
  // dependências, cada re-render do pai refazia o ciclo: o `back()` (assíncrono)
  // derrubava o `pushState` (síncrono) recém-feito, e a folha fechava sozinha.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    window.history.pushState({ ...window.history.state, vekooSheet: true }, "")
    const handlePop = () => onCloseRef.current()
    window.addEventListener("popstate", handlePop)

    return () => {
      window.removeEventListener("popstate", handlePop)
      if (window.history.state?.vekooSheet) window.history.back()
    }
  }, [open])
}

type BottomSheetProps = {
  open: boolean
  onClose: () => void
  /** Nome da folha para leitor de tela; também é o título quando `showTitle`. */
  title: string
  showTitle?: boolean
  /** Fração da altura visível, que encolhe junto com o teclado. */
  maxHeightRatio?: number
  disableDrag?: boolean
  bodyClassName?: string
  children: ReactNode
}

/**
 * Folha de baixo, o contêiner de painéis no celular. A transição de entrada é do
 * Sheet (no popup); o arraste é do `motion.div` de dentro. Nunca os dois transformando
 * o mesmo nó.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  showTitle = false,
  maxHeightRatio = 0.85,
  disableDrag = false,
  bodyClassName,
  children,
}: BottomSheetProps) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const dragControls = useDragControls()
  const y = useMotionValue(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Folha com campo de busca: com dedo, abrir não sobe o teclado por cima dela.
  const { popupRef, initialFocus } = useSheetFocus()

  useCloseOnBack(open, onClose)

  // Reabrir depois de um arraste que dispensou: a folha precisa nascer no lugar.
  useEffect(() => {
    if (open) y.set(0)
  }, [open, y])

  const handleDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
        onClose()
        return
      }
      y.set(0)
    },
    [onClose, y]
  )

  const startDrag = useCallback(
    (event: ReactPointerEvent) => {
      if (disableDrag || isInteractive(event.target)) return
      dragControls.start(event)
    },
    [disableDrag, dragControls]
  )

  /**
   * Arrastar de qualquer ponto, como em app nativo. O corpo é a região que rola, então
   * a decisão é adiada: o toque só vira arrasto com o corpo no topo e o dedo descendo
   * além do limiar. Qualquer outra coisa fica com a rolagem nativa.
   */
  const handleBodyPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disableDrag || event.pointerType === "mouse") return
      if (isInteractive(event.target)) return
      if ((bodyRef.current?.scrollTop ?? 0) > 0) return

      const startX = event.clientX
      const startY = event.clientY

      const cleanup = () => {
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", cleanup)
        window.removeEventListener("pointercancel", cleanup)
      }

      function handleMove(move: PointerEvent) {
        const deltaX = move.clientX - startX
        const deltaY = move.clientY - startY

        // Na horizontal é gesto de quem está dentro (faixa de abas, por exemplo).
        if (Math.abs(deltaX) > Math.abs(deltaY) || deltaY < -DRAG_INTENT_PX) {
          cleanup()
          return
        }
        if (deltaY > DRAG_INTENT_PX) {
          cleanup()
          dragControls.start(move)
        }
      }

      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", cleanup)
      window.addEventListener("pointercancel", cleanup)
    },
    [disableDrag, dragControls]
  )

  const maxHeight = `calc(var(--app-vh, 100dvh) * ${maxHeightRatio})`

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        ref={popupRef}
        initialFocus={initialFocus}
        side="bottom"
        showCloseButton={false}
        // A área larga do popup é transparente e deixa o toque passar para o fundo: no
        // tablet o papel fica estreito e centralizado, e tocar ao lado continua fechando.
        className={cn(
          "pointer-events-none gap-0 bg-transparent shadow-none outline-none data-[side=bottom]:border-t-0",
          reducedMotion && "transition-none"
        )}
        style={{ maxHeight }}
      >
        <motion.div
          drag={disableDrag ? false : "y"}
          dragControls={dragControls}
          dragListener={false}
          dragDirectionLock
          dragMomentum={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.55 }}
          style={{ y, maxHeight }}
          onDragEnd={handleDragEnd}
          onPointerDown={handleBodyPointerDown}
          className="pointer-events-auto mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden rounded-t-2xl bg-popover shadow-xl ring-1 ring-foreground/5"
        >
          <div
            aria-hidden
            onPointerDown={startDrag}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1.5"
          >
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>

          <SheetTitle
            onPointerDown={startDrag}
            className={cn(
              showTitle
                ? "shrink-0 touch-none px-4 pt-1 pb-3 text-base font-semibold"
                : "sr-only"
            )}
          >
            {title}
          </SheetTitle>

          <div
            ref={bodyRef}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe",
              bodyClassName
            )}
          >
            {children}
            {/* Arrastar e tocar fora não existem para quem navega por leitor de tela. */}
            <SheetClose className="sr-only focus-visible:not-sr-only focus-visible:mb-3 focus-visible:block focus-visible:rounded-lg focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:ring-3 focus-visible:ring-ring/50">
              {t("navigation.closePanel")}
            </SheetClose>
          </div>
        </motion.div>
      </SheetContent>
    </Sheet>
  )
}
