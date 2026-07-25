import { useState, type DragEvent, type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router"
import {
  Check,
  ChevronsUpDown,
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
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { FOLDER_COLORS, type Folder } from "@/lib/mock-data"
import { newId, useStore } from "@/lib/store"
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
  const { state, dispatch } = useStore()
  const remaining = state.credits.total - state.credits.used
  const usagePercent = (state.credits.used / state.credits.total) * 100

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Identidade da conta */}
      <div className={cn("flex items-center gap-2 p-3", collapsed && "justify-center px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "h-auto flex-1 justify-start gap-2.5 px-2 py-1.5",
                  collapsed && "size-9 flex-none justify-center p-0"
                )}
                aria-label="Menu da conta"
              />
            }
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-xs font-bold text-primary-foreground">
              {initials(state.user.name)}
            </span>
            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
                  <span className="w-full truncate text-sm font-medium">
                    {state.user.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {state.user.plan}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem
              onClick={() => toast("As configurações chegam em breve.")}
            >
              <Settings /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                toast("Sair vai levar à tela de entrada — ela chega na próxima etapa.")
              }
            >
              <LogOut /> Sair
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
                  aria-label="Recolher menu"
                />
              }
            >
              <PanelLeftClose />
            </TooltipTrigger>
            <TooltipContent side="right">Recolher menu</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Navegação */}
      <nav className={cn("flex flex-col gap-0.5 px-3", collapsed && "px-2")}>
        {collapsed && (
          <SidebarIconButton
            label="Expandir menu"
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex"
          >
            <PanelLeftOpen />
          </SidebarIconButton>
        )}
        <SidebarLink
          to="/"
          icon={<Layers />}
          label="Meus carrosséis"
          collapsed={collapsed}
          onNavigate={onNavigate}
          acceptsDrop
          onDropCarousel={(id) => {
            dispatch({ type: "carousel/move", id, folderId: null })
            toast("Carrossel tirado da pasta.")
          }}
        />
        <SidebarButton
          icon={<Search />}
          label="Buscar"
          collapsed={collapsed}
          trailing={<Kbd>⌘K</Kbd>}
          onClick={onOpenSearch}
        />
        <SidebarLink
          to="/modelos"
          icon={<LayoutTemplate />}
          label="Modelos"
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <SidebarLink
          to="/marcas"
          icon={<Palette />}
          label="Marcas"
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <SidebarLink
          to="/lixeira"
          icon={<Trash2 />}
          label="Lixeira"
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
                  onClick={() => toast("Planos e upgrade chegam em uma próxima etapa.")}
                  aria-label={`${remaining} de ${state.credits.total} créditos`}
                />
              }
            >
              <Zap />
            </TooltipTrigger>
            <TooltipContent side="right">
              {remaining} de {state.credits.total} créditos
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {remaining}{" "}
                <span className="font-normal text-muted-foreground">
                  de {state.credits.total} créditos
                </span>
              </span>
            </div>
            <Progress value={usagePercent} aria-label="Créditos usados">
              <ProgressTrack className="h-1.5">
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => toast("Planos e upgrade chegam em uma próxima etapa.")}
            >
              <Sparkles /> Melhorar plano
            </Button>
          </div>
        )}
      </div>
    </div>
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
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  function createFolder(name: string, color: string) {
    const folder: Folder = { id: newId("pasta"), name, color }
    dispatch({ type: "folder/create", folder })
    setCreating(false)
    toast(`Pasta “${name}” criada.`)
    navigate(`/pastas/${folder.id}`)
    onNavigate?.()
  }

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        {state.folders.map((folder) => (
          <FolderRow key={folder.id} folder={folder} collapsed onNavigate={onNavigate} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between pl-2.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Pastas
        </span>
        {state.folders.length > 0 && !creating && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Criar pasta"
            onClick={() => setCreating(true)}
          >
            <Plus />
          </Button>
        )}
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2">
        {state.folders.map((folder) => (
          <FolderRow key={folder.id} folder={folder} onNavigate={onNavigate} />
        ))}

        {creating ? (
          <NewFolderForm
            onCancel={() => setCreating(false)}
            onCreate={createFolder}
          />
        ) : state.folders.length === 0 ? (
          <div className="mt-1 rounded-lg border border-dashed p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Pastas agrupam carrosséis por cliente, tema ou campanha. Arraste um
              carrossel para dentro para movê-lo.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-1.5 text-accent-foreground"
              onClick={() => setCreating(true)}
            >
              <Plus /> Criar primeira pasta
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
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const [dragOver, setDragOver] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const count = state.carousels.filter(
    (c) => c.folderId === folder.id && c.trashedAt === null
  ).length

  if (renaming) {
    return (
      <RenameFolderForm
        folder={folder}
        onDone={(name) => {
          if (name && name !== folder.name) {
            dispatch({ type: "folder/rename", id: folder.id, name })
            toast("Pasta renomeada.")
          }
          setRenaming(false)
        }}
      />
    )
  }

  const link = (
    <NavLink
      to={`/pastas/${folder.id}`}
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
          dispatch({ type: "carousel/move", id, folderId: folder.id })
          toast(`Movido para “${folder.name}”.`)
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
                    aria-label={`Ações da pasta ${folder.name}`}
                  />
                }
              >
                <Pencil />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <Pencil /> Renomear
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    dispatch({ type: "folder/delete", id: folder.id })
                    toast(`Pasta “${folder.name}” excluída.`, {
                      description: "Os carrosséis dela voltaram para Meus carrosséis.",
                    })
                    navigate("/")
                  }}
                >
                  <Trash2 /> Excluir pasta
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
        {folder.name} ({count})
      </TooltipContent>
    </Tooltip>
  )
}

function NewFolderForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (name: string, color: string) => void
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(FOLDER_COLORS[1].value)
  const valid = name.trim().length > 0

  function submit() {
    if (valid) onCreate(name.trim(), color)
  }

  return (
    <div className="mt-1 space-y-2 rounded-lg border p-2.5">
      <Input
        autoFocus
        placeholder="Nome da pasta"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") onCancel()
        }}
        className="h-8"
      />
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Cor da pasta">
        {FOLDER_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={color === c.value}
            aria-label={c.id}
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
          Criar pasta
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cancelar" onClick={onCancel}>
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
        aria-label="Novo nome da pasta"
      />
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ""
  return (first + last).toUpperCase()
}

/** Logo pequena usada no rail recolhido e telas de entrada (próxima etapa). */
export function VekooMark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading text-lg font-bold tracking-tight", className)}>
      vekoo<span className="text-primary">.</span>
    </span>
  )
}
