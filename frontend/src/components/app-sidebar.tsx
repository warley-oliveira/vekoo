import { useState, type DragEvent, type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router"
import { Trans, useTranslation } from "react-i18next"
import {
  Check,
  ChevronsUpDown,
  Languages,
  Layers,
  LayoutTemplate,
  LogOut,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCarouselMutations } from "@/hooks/use-carousel-mutations"
import { useFolderMutations, useFolders } from "@/hooks/use-folders"
import { InlineError } from "@/components/error-state"
import { FolderListSkeleton } from "@/components/carousel-skeletons"
import { initials, useAuth } from "@/lib/auth"
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"
import { useCatalog } from "@/lib/catalog"
import type { Folder } from "@/lib/types"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export const CAROUSEL_DRAG_TYPE = "application/x-vekoo-carousel"

type AppSidebarProps = {
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenSearch: () => void
  /** Fecha o drawer no mobile após navegar. */
  onNavigate?: () => void
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
  onOpenSearch,
  onNavigate,
}: AppSidebarProps) {
  const { t } = useTranslation()
  const { state } = useStore()
  const { move: moveCarousel } = useCarouselMutations()
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const remaining = state.credits.total - state.credits.used
  const usagePercent = (state.credits.used / state.credits.total) * 100

  // A sidebar só existe dentro da sessão (ver RequireAuth), mas o fallback
  // evita qualquer chance de tela branca durante a saída.
  const organizationName = session?.organization.name ?? t("account.fallbackName")
  const personName = session?.account.name ?? ""

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Identidade da conta (organização + pessoa) */}
      <div className={cn("flex items-center gap-2 p-3", collapsed && "justify-center px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "h-auto min-w-0 flex-1 justify-start gap-2.5 px-2 py-1.5",
                  collapsed && "size-9 flex-none justify-center p-0"
                )}
                aria-label={t("account.menuAria", { organization: organizationName })}
              />
            }
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-xs font-bold text-primary-foreground">
              {initials(organizationName)}
            </span>
            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                  <span className="w-full truncate text-sm font-medium">
                    {organizationName}
                  </span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {personName}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{personName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {session?.account.email}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast(t("account.settingsToast"))}>
              <Settings /> {t("account.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                toast(t("account.inviteToast"), {
                  description: t("account.inviteToastDescription", {
                    organization: organizationName,
                  }),
                })
              }
            >
              <UserPlus /> {t("account.invite")}
            </DropdownMenuItem>
            <LanguageSubmenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                // Navega já: o DELETE /logout é melhor esforço e não deve
                // segurar a saída se a rede estiver ruim.
                void signOut()
                navigate("/login", { replace: true })
                toast(t("account.signOutToast"))
              }}
            >
              <LogOut /> {t("account.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden shrink-0 text-muted-foreground lg:inline-flex"
                  onClick={onToggleCollapsed}
                  aria-label={t("shell.collapseMenu")}
                />
              }
            >
              <PanelLeftClose />
            </TooltipTrigger>
            <TooltipContent side="right">{t("shell.collapseMenu")}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Navegação */}
      <nav className={cn("flex flex-col gap-0.5 px-3", collapsed && "px-2")}>
        {collapsed && (
          <SidebarIconButton
            label={t("shell.expandMenu")}
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex"
          >
            <PanelLeftOpen />
          </SidebarIconButton>
        )}
        <SidebarLink
          to="/"
          icon={<Layers />}
          label={t("shell.nav.carousels")}
          collapsed={collapsed}
          onNavigate={onNavigate}
          acceptsDrop
          onDropCarousel={(id) => {
            moveCarousel(id, null)
              .then(() => toast(t("carousels.actions.removedFromFolderToast")))
              .catch(() => toast.error(t("carousels.actions.moveFailed")))
          }}
        />
        <SidebarButton
          icon={<Search />}
          label={t("shell.nav.search")}
          collapsed={collapsed}
          trailing={<Kbd>⌘K</Kbd>}
          onClick={onOpenSearch}
        />
        <SidebarLink
          to="/templates"
          icon={<LayoutTemplate />}
          label={t("shell.nav.templates")}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <SidebarLink
          to="/brands"
          icon={<Palette />}
          label={t("shell.nav.brands")}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <SidebarLink
          to="/trash"
          icon={<Trash2 />}
          label={t("shell.nav.trash")}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </nav>

      {/* Pastas */}
      <div className={cn("mt-5 flex min-h-0 flex-1 flex-col px-3", collapsed && "px-2")}>
        <FoldersSection collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      {/* Créditos */}
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "p-2")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full text-muted-foreground"
                  onClick={() => toast(t("credits.upgradeToast"))}
                  aria-label={t("credits.aria", {
                    remaining,
                    total: state.credits.total,
                  })}
                />
              }
            >
              <Zap />
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("credits.aria", { remaining, total: state.credits.total })}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                <Trans
                  i18nKey="credits.remaining"
                  values={{ remaining, total: state.credits.total }}
                  components={{
                    muted: <span className="font-normal text-muted-foreground" />,
                  }}
                />
              </span>
              <span className="text-xs text-muted-foreground">
                {session ? t(`plans.${session.organization.plan}`) : null}
              </span>
            </div>
            <Progress value={usagePercent} aria-label={t("credits.used")}>
              <ProgressTrack className="h-1.5">
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => toast(t("credits.upgradeToast"))}
            >
              <Sparkles /> {t("credits.upgrade")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- idioma ---------- */

/** Troca de idioma onde ela é esperada num SaaS: no menu da conta. */
function LanguageSubmenu() {
  const { t, i18n } = useTranslation()
  const language = useLanguage()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages /> {t("language.label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => i18n.changeLanguage(value)}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <DropdownMenuRadioItem key={code} value={code}>
              {t(`language.${code}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/* ---------- itens de navegação ---------- */

function SidebarLink({
  to,
  icon,
  label,
  collapsed,
  onNavigate,
  acceptsDrop,
  onDropCarousel,
}: {
  to: string
  icon: ReactNode
  label: string
  collapsed: boolean
  onNavigate?: () => void
  acceptsDrop?: boolean
  onDropCarousel?: (carouselId: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  const dropHandlers = acceptsDrop
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes(CAROUSEL_DRAG_TYPE)) {
            e.preventDefault()
            setDragOver(true)
          }
        },
        onDragLeave: () => setDragOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          setDragOver(false)
          const id = e.dataTransfer.getData(CAROUSEL_DRAG_TYPE)
          if (id) onDropCarousel?.(id)
        },
      }
    : {}

  const link = (
    <NavLink
      to={to}
      onClick={onNavigate}
      {...dropHandlers}
      className={({ isActive }) =>
        cn(
          "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          collapsed && "justify-center px-0",
          dragOver && "bg-accent text-accent-foreground ring-2 ring-ring/60"
        )
      }
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarButton({
  icon,
  label,
  collapsed,
  trailing,
  onClick,
}: {
  icon: ReactNode
  label: string
  collapsed: boolean
  trailing?: ReactNode
  onClick: () => void
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        collapsed && "justify-center px-0"
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
      {!collapsed && trailing}
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

function SidebarIconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("w-full text-muted-foreground", className)}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-background px-1.5 py-px font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  )
}

/* ---------- pastas ---------- */

function FoldersSection({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { folders, isLoading, error, reload } = useFolders()
  const { createFolder: create } = useFolderMutations()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const list = folders ?? []

  // Não é otimista: a tela navega para /folders/:id logo em seguida, e com um
  // id inventado essa navegação daria 404.
  async function createFolder(name: string, color: string) {
    setSaving(true)
    try {
      const folder = await create(name, color)
      setCreating(false)
      toast(t("folders.created", { name }))
      navigate(`/folders/${folder.id}`)
      onNavigate?.()
    } catch {
      toast.error(t("folders.createFailed"))
    } finally {
      setSaving(false)
    }
  }

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        {list.map((folder) => (
          <FolderRow key={folder.id} folder={folder} collapsed onNavigate={onNavigate} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between pl-2.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("folders.sectionTitle")}
        </span>
        {list.length > 0 && !creating && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={t("folders.create")}
            onClick={() => setCreating(true)}
          >
            <Plus />
          </Button>
        )}
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2">
        {list.map((folder) => (
          <FolderRow key={folder.id} folder={folder} onNavigate={onNavigate} />
        ))}

        {isLoading && !folders ? (
          <FolderListSkeleton />
        ) : error ? (
          <InlineError onRetry={reload} />
        ) : creating ? (
          <NewFolderForm
            onCancel={() => setCreating(false)}
            onCreate={createFolder}
            busy={saving}
          />
        ) : list.length === 0 ? (
          <div className="mt-1 rounded-lg border border-dashed p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("folders.emptyHint")}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-1.5 text-accent-foreground"
              onClick={() => setCreating(true)}
            >
              <Plus /> {t("folders.createFirst")}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}

function FolderRow({
  folder,
  collapsed = false,
  onNavigate,
}: {
  folder: Folder
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { renameFolder, deleteFolder } = useFolderMutations()
  const { move } = useCarouselMutations()
  const navigate = useNavigate()
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  // Contado pelo servidor, junto com a lista — a tela não tem mais todos os
  // carrosséis em memória para contar sozinha.
  const count = folder.carouselCount

  if (renaming) {
    return (
      <RenameFolderForm
        folder={folder}
        onDone={(name) => {
          if (name && name !== folder.name) {
            renameFolder(folder.id, name)
              .then(() => toast(t("folders.renamed")))
              .catch(() => toast.error(t("folders.renameFailed")))
          }
          setRenaming(false)
        }}
      />
    )
  }

  const link = (
    <NavLink
      to={`/folders/${folder.id}`}
      onClick={onNavigate}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(CAROUSEL_DRAG_TYPE)) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData(CAROUSEL_DRAG_TYPE)
        if (id) {
          move(id, folder.id)
            .then(() => toast(t("carousels.actions.movedToast", { name: folder.name })))
            .catch(() => toast.error(t("carousels.actions.moveFailed")))
        }
      }}
      className={({ isActive }) =>
        cn(
          "group/folder flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          collapsed && "justify-center px-0",
          dragOver && "bg-accent text-accent-foreground ring-2 ring-ring/60"
        )
      }
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: folder.color }}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{folder.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums group-hover/folder:hidden">
            {count}
          </span>
          <span
            className="hidden group-hover/folder:inline-flex"
            onClick={(e) => e.preventDefault()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t("folders.actionsAria", { name: folder.name })}
                  />
                }
              >
                <Pencil />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <Pencil /> {t("common.rename")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    deleteFolder(folder.id)
                      .then(() =>
                        toast(t("folders.deleted", { name: folder.name }), {
                          description: t("folders.deletedDescription"),
                        })
                      )
                      .catch(() => toast.error(t("folders.deleteFailed")))
                    navigate("/")
                  }}
                >
                  <Trash2 /> {t("folders.deleteFolder")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">
        {t("folders.countAria", { name: folder.name, count })}
      </TooltipContent>
    </Tooltip>
  )
}

function NewFolderForm({
  onCancel,
  onCreate,
  busy = false,
}: {
  onCancel: () => void
  onCreate: (name: string, color: string) => void
  /** Criar é ida ao servidor: o botão precisa dizer que está trabalhando. */
  busy?: boolean
}) {
  const { t } = useTranslation()
  const { folderColors } = useCatalog()
  // Violeta é o padrão — o mesmo acento da interface.
  const [color, setColor] = useState<string>(
    () => folderColors[1]?.value ?? folderColors[0].value
  )
  const [name, setName] = useState("")
  const valid = name.trim().length > 0 && !busy

  function submit() {
    if (valid) onCreate(name.trim(), color)
  }

  return (
    <div className="mt-1 space-y-2 rounded-lg border p-2.5">
      <Input
        autoFocus
        placeholder={t("folders.namePlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") onCancel()
        }}
        className="h-8"
      />
      <div
        className="flex items-center gap-1.5"
        role="radiogroup"
        aria-label={t("folders.colorGroupAria")}
      >
        {folderColors.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={color === c.value}
            aria-label={t(`folders.colors.${c.id}`, { defaultValue: c.id })}
            onClick={() => setColor(c.value)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              color === c.value && "ring-2 ring-ring"
            )}
            style={{ backgroundColor: c.value }}
          >
            {color === c.value && <Check className="size-3.5 text-white" />}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={!valid} onClick={submit}>
          {t("folders.create")}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.cancel")}
          onClick={onCancel}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}

function RenameFolderForm({
  folder,
  onDone,
}: {
  folder: Folder
  onDone: (name: string | null) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(folder.name)
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: folder.color }}
      />
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(name.trim() || null)
          if (e.key === "Escape") onDone(null)
        }}
        onBlur={() => onDone(name.trim() || null)}
        className="h-8"
        aria-label={t("folders.newNameAria")}
      />
    </div>
  )
}

/** Logo pequena usada no rail recolhido e telas de entrada (próxima etapa). */
export function VekooMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading text-lg font-bold tracking-tight", className)}>
      vekoo<span className="text-primary">.</span>
    </span>
  )
}
