import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react"
import { Outlet, useLocation } from "react-router"

import { AppSidebar } from "@/components/app-sidebar"
import { CreateCarouselDialog } from "@/components/create-carousel-dialog"
import { SearchPalette } from "@/components/search-palette"
import { DocumentTitle } from "@/components/shell/header-slot"
import { MobileHeader } from "@/components/shell/mobile-header"
import { MobileShell } from "@/components/shell/mobile-shell"
import { NavigationProvider } from "@/components/shell/navigation-provider"
import { Topbar } from "@/components/shell/topbar"
import {
  MobileViewportMeta,
  VisualViewportBridge,
} from "@/components/shell/viewport"
import { useAppShell } from "@/hooks/use-app-shell"
import { useLaunchQueue } from "@/hooks/use-launch-queue"
import { useMobileShell } from "@/hooks/use-mobile-shell"
import { usePushSessionSync } from "@/hooks/use-push-notifications"
import { cn } from "@/lib/utils"
import { usePersistentState } from "@/lib/view-prefs"

type ShellContextValue = {
  openCreate: () => void
  openSearch: () => void
  /** A área que rola (`<main>`), para lista virtual ou "voltar ao topo". */
  scroller: HTMLElement | null
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error("useShell precisa estar dentro do AppShell")
  return ctx
}

export function AppShell() {
  const { isMobileShell } = useMobileShell()
  const fullBleed = useAppShell((shell) => shell.fullBleed)
  const { pathname } = useLocation()

  const [collapsedPref, setCollapsedPref] = usePersistentState<"0" | "1">(
    "vekoo.sidebar.collapsed",
    "0"
  )
  const collapsed = collapsedPref === "1"
  const [searchOpen, setSearchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)

  usePushSessionSync()
  useLaunchQueue()

  // ⌘K / Ctrl+K abre a busca de qualquer lugar do app
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Cada rota abre do topo: o `<main>` sobrevive à troca de tela e guardaria a rolagem
  // da anterior. Quem precisa manter a própria (conversa, quadro) é dona dela, em
  // `fullBleed`, e não passa por aqui.
  useLayoutEffect(() => {
    scroller?.scrollTo({ top: 0 })
  }, [pathname, scroller])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const openCreate = useCallback(() => setCreateOpen(true), [])
  const shell = useMemo(
    () => ({ openCreate, openSearch, scroller }),
    [openCreate, openSearch, scroller]
  )

  return (
    <ShellContext.Provider value={shell}>
      <NavigationProvider>
        <VisualViewportBridge />
        <MobileViewportMeta />
        <DocumentTitle />

        <div className="flex h-dvh overflow-hidden">
          {/* Só uma das duas navegações monta, para não duplicar requisições. */}
          {!isMobileShell && (
            <aside
              className={cn(
                "shrink-0 overflow-hidden border-r border-sidebar-border transition-[width] duration-200 motion-reduce:transition-none",
                collapsed ? "w-[3.75rem]" : "w-64"
              )}
            >
              <AppSidebar
                collapsed={collapsed}
                onToggleCollapsed={() => setCollapsedPref(collapsed ? "0" : "1")}
                onOpenSearch={openSearch}
              />
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {isMobileShell ? <MobileHeader scroller={scroller} /> : <Topbar />}
            <main
              ref={setScroller}
              className={cn(
                "relative min-h-0 flex-1 overscroll-contain",
                fullBleed ? "overflow-hidden" : "overflow-y-auto",
                isMobileShell && "pt-(--app-header-total)",
                // A tela dona da própria rolagem reserva a folga no fim do que rola.
                isMobileShell && !fullBleed && "pb-(--app-bottom-nav-total)"
              )}
            >
              <Outlet />
            </main>
          </div>
        </div>

        {isMobileShell && <MobileShell onOpenSearch={openSearch} />}

        <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
        <CreateCarouselDialog open={createOpen} onOpenChange={setCreateOpen} />
      </NavigationProvider>
    </ShellContext.Provider>
  )
}
