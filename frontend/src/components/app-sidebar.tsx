import { useEffect, useRef } from "react"
import { useLocation } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"

import { AccountMenu } from "@/components/shell/account-menu"
import { CreditsSummary } from "@/components/shell/credits-summary"
import { SidebarNav } from "@/components/shell/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const IS_APPLE =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform)
/** Nomes de tecla: não se traduzem. */
const SEARCH_SHORTCUT = IS_APPLE ? "⌘K" : "Ctrl K"
/** Um pouco mais que a transição de altura dos grupos (`duration-200`). */
const GROUP_EXPAND_MS = 240
/** A altura da borda esmaecida no fim do menu (a máscara, abaixo). */
const EDGE_FADE_PX = 16

type AppSidebarProps = {
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenSearch: () => void
}

/** A barra lateral do desktop: conta, busca, menu e créditos. */
export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  onOpenSearch,
}: AppSidebarProps) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // O item ativo nunca fica escondido: quem abre um link direto para Integrações
  // precisa ver onde está. Espera o grupo terminar de expandir antes de medir, e só
  // rola se ele estiver fora de vista: mexer no menu a cada clique desorienta.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const scroller = scrollerRef.current
      const row = scroller?.querySelector('[aria-current="page"]')
      if (!scroller || !row) return
      const box = scroller.getBoundingClientRect()
      const rect = row.getBoundingClientRect()
      if (rect.top < box.top || rect.bottom > box.bottom - EDGE_FADE_PX) {
        // Não `scrollIntoView`: ele rola também os ancestrais, e a tela inteira, que é
        // `overflow-hidden`, sairia do lugar.
        scroller.scrollTop += rect.top - box.top - (box.height - rect.height) / 2
      }
    }, GROUP_EXPAND_MS)
    return () => window.clearTimeout(timer)
  }, [pathname, collapsed])

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn("flex items-center gap-2 p-3", collapsed && "justify-center px-2")}>
        <AccountMenu collapsed={collapsed} />
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={onToggleCollapsed}
                  aria-label={t("navigation.collapseMenu")}
                />
              }
            >
              <PanelLeftClose />
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("navigation.collapseMenu")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className={cn("mb-3 flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>
        {collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full text-muted-foreground"
                  onClick={onToggleCollapsed}
                  aria-label={t("navigation.expandMenu")}
                />
              }
            >
              <PanelLeftOpen />
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("navigation.expandMenu")}
            </TooltipContent>
          </Tooltip>
        )}
        <SearchRow
          collapsed={collapsed}
          onOpenSearch={onOpenSearch}
          label={t("navigation.search")}
        />
      </div>

      {/* O menu rola; conta e créditos ficam sempre à vista. A borda esmaecida avisa
          que há mais abaixo, sem uma barra de rolagem competindo com o menu. */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_calc(100%-1rem),transparent)] [scrollbar-width:none]"
      >
        <SidebarNav collapsed={collapsed} />
      </div>

      <div className={cn("border-t border-sidebar-border p-3", collapsed && "p-2")}>
        <CreditsSummary collapsed={collapsed} />
      </div>
    </div>
  )
}

function SearchRow({
  collapsed,
  label,
  onOpenSearch,
}: {
  collapsed: boolean
  label: string
  onOpenSearch: () => void
}) {
  const button = (
    <button
      type="button"
      onClick={onOpenSearch}
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10",
        collapsed && "justify-center px-0"
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          <Kbd>{SEARCH_SHORTCUT}</Kbd>
        </>
      )}
    </button>
  )

  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
