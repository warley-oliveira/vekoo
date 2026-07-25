import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { Outlet, useLocation, useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { Bell, Menu, Plus, SquarePen } from "lucide-react"
import { toast } from "sonner"

import { AppSidebar, VekooMark } from "@/components/app-sidebar"
import { CreateCarouselDialog } from "@/components/create-carousel-dialog"
import { SearchPalette } from "@/components/search-palette"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const SIDEBAR_COLLAPSED_KEY = "vekoo.sidebar.collapsed"

type ShellContextValue = {
  openCreate: () => void
  openSearch: () => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error("useShell precisa estar dentro do AppShell")
  return ctx
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "0" : "1")
      return !value
    })
  }, [])

  // ⌘K / Ctrl+K abre a busca de qualquer lugar do app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const openCreate = useCallback(() => setCreateOpen(true), [])

  return (
    <ShellContext.Provider value={{ openCreate, openSearch }}>
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar fixa (desktop) */}
        <aside
          className={cn(
            "hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 lg:block",
            collapsed ? "w-14" : "w-64"
          )}
        >
          <AppSidebar
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onOpenSearch={openSearch}
          />
        </aside>

        {/* Sidebar em drawer (mobile) */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-foreground/25"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar shadow-lg">
              <AppSidebar
                collapsed={false}
                onToggleCollapsed={toggleCollapsed}
                onOpenSearch={() => {
                  setMobileOpen(false)
                  openSearch()
                }}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMobileSidebar={() => setMobileOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <CreateCarouselDialog open={createOpen} onOpenChange={setCreateOpen} />
    </ShellContext.Provider>
  )
}

/* ---------- barra superior ---------- */

function Topbar({ onOpenMobileSidebar }: { onOpenMobileSidebar: () => void }) {
  const { t } = useTranslation()
  const location = useLocation()
  const params = useParams()
  const { state } = useStore()
  const { openCreate } = useShell()

  const folder = params.folderId
    ? state.folders.find((f) => f.id === params.folderId)
    : undefined

  let title = t("shell.nav.carousels")
  if (location.pathname.startsWith("/templates")) title = t("shell.nav.templates")
  else if (location.pathname.startsWith("/brands")) title = t("shell.nav.brands")
  else if (location.pathname.startsWith("/trash")) title = t("shell.nav.trash")
  else if (folder) title = folder.name

  const showCreateActions =
    location.pathname === "/" || location.pathname.startsWith("/folders/")

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon-sm"
        className="-ml-1.5 lg:hidden"
        onClick={onOpenMobileSidebar}
        aria-label={t("shell.openMenu")}
      >
        <Menu />
      </Button>
      <VekooMark className="mr-1 text-base lg:hidden" />

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {folder && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: folder.color }}
            aria-hidden
          />
        )}
        <h1 className="truncate font-heading text-lg font-semibold tracking-tight">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <NotificationsMenu />
        {showCreateActions && (
          <>
            <Button
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() =>
                toast(t("shell.createBlankToast"))
              }
            >
              <SquarePen /> {t("shell.createBlank")}
            </Button>
            <Button onClick={openCreate}>
              <Plus /> {t("shell.createCarousel")}
            </Button>
          </>
        )}
      </div>
    </header>
  )
}

function NotificationsMenu() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { state, dispatch } = useStore()
  const unread = state.notifications.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
            aria-label={
              unread > 0
                ? t("shell.notifications.ariaUnread", { count: unread })
                : t("shell.notifications.aria")
            }
          />
        }
      >
        <Bell />
        {unread > 0 && (
          <span
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary"
            aria-hidden
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            {t("shell.notifications.label")}
            {unread > 0 && (
              <button
                type="button"
                className="text-xs font-normal text-accent-foreground hover:underline"
                onClick={() => dispatch({ type: "notifications/read-all" })}
              >
                {t("shell.notifications.markAllRead")}
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {state.notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t("shell.notifications.empty")}
          </p>
        ) : (
          state.notifications.map((n) => (
            <DropdownMenuItem key={n.id} className="items-start gap-2.5 py-2">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  n.read ? "bg-border" : "bg-primary"
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {t(`notifications.${n.key}.title`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`notifications.${n.key}.body`)}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {formatRelative(n.at, language)}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
