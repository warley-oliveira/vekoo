import { useLayoutEffect, useRef } from "react"
import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, SlidersHorizontal } from "lucide-react"

import { useOffscreenAfterExit } from "@/components/shell/motion"
import { NotificationCenter } from "@/components/shell/notification-center"
import { Button } from "@/components/ui/button"
import { VekooGlyph } from "@/components/vekoo-mark"
import { useAppShell } from "@/hooks/use-app-shell"
import { useHeaderStore, useHeaderTitle } from "@/hooks/use-header-slot"
import { useMobileNav } from "@/hooks/use-mobile-nav"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import { useScrollDirection } from "@/hooks/use-scroll-direction"
import { cn } from "@/lib/utils"
import { spring } from "@/lib/motion"

const HEADER_TOTAL_VAR = "--app-header-total"

/**
 * Cabeçalho do celular. Flutua sobre o conteúdo (o `<main>` reserva a altura medida em
 * `--app-header-total`), então sair de cena ao rolar não provoca pulo nenhum.
 */
export function MobileHeader({ scroller }: { scroller: HTMLElement | null }) {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { isCompactPhone } = useMobileShell()
  const { title, color, backTo, parentTitle } = useHeaderTitle()

  const immersive = useAppShell((shell) => shell.immersive)
  const activeSheet = useMobileNav((state) => state.activeSheet)
  const openSheet = useMobileNav((state) => state.openSheet)

  const node = useHeaderStore((state) => state.node)
  const mobileNode = useHeaderStore((state) => state.mobileNode)
  const placement = useHeaderStore((state) => state.mobilePlacement)

  const slot = mobileNode ?? node
  const showInline = Boolean(slot) && placement === "inline"
  const showToolbar = Boolean(slot) && placement === "toolbar"
  const showOverflow = Boolean(slot) && placement === "overflow"

  // Nunca esconde com uma folha aberta, nem com movimento reduzido.
  const isScrollingDown = useScrollDirection({
    element: scroller,
    enabled: activeSheet === "none" && !reducedMotion,
  })
  const hidden = immersive || isScrollingDown
  const { offscreen, onAnimationStart, onAnimationComplete } = useOffscreenAfterExit(
    hidden,
    reducedMotion
  )

  const ref = useRef<HTMLElement>(null)

  // Medido, não somado à mão: cobre a área segura e a segunda linha de filtros.
  // `useLayoutEffect` para quem mede altura em efeito normal já ler o valor novo.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const root = document.documentElement

    const write = () => {
      root.style.setProperty(
        HEADER_TOTAL_VAR,
        immersive ? "0px" : `${element.offsetHeight}px`
      )
    }
    write()

    const observer = new ResizeObserver(write)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty(HEADER_TOTAL_VAR)
    }
  }, [immersive])

  return (
    <motion.header
      ref={ref}
      aria-hidden={immersive || undefined}
      initial={false}
      animate={{ y: hidden ? "-110%" : 0 }}
      transition={reducedMotion ? { duration: 0 } : spring}
      onAnimationStart={onAnimationStart}
      onAnimationComplete={onAnimationComplete}
      style={{
        pointerEvents: hidden ? "none" : "auto",
        visibility: offscreen ? "hidden" : "visible",
      }}
      className={cn(
        "fixed inset-x-0 top-0 z-30 border-b bg-background/90 pt-safe pr-safe pl-safe",
        !isCompactPhone && "supports-backdrop-filter:backdrop-blur-md"
      )}
    >
      <div className="flex h-14 items-center gap-1 px-2">
        {backTo ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 text-muted-foreground"
            nativeButton={false}
            render={<Link to={backTo} aria-label={t("common.back")} />}
          >
            <ArrowLeft className="size-5" />
          </Button>
        ) : (
          <Link
            to="/"
            aria-label={t("navigation.home")}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <VekooGlyph />
          </Link>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5">
          {color && (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            {parentTitle && (
              <p className="truncate text-xs leading-tight text-muted-foreground">
                {parentTitle}
              </p>
            )}
            <h1 className="truncate font-heading text-base leading-tight font-semibold tracking-tight">
              {title}
            </h1>
          </div>
        </div>

        {showInline && <div className="flex shrink-0 items-center">{slot}</div>}
        {showOverflow && (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 text-muted-foreground"
            aria-label={t("navigation.pageActions")}
            onClick={() => openSheet("headerSlot")}
          >
            <SlidersHorizontal className="size-5" />
          </Button>
        )}
        <NotificationCenter />
      </div>

      {showToolbar && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {slot}
        </div>
      )}
    </motion.header>
  )
}
