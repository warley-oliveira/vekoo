import { useState } from "react"
import { Link, useLocation, useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { FolderListSkeleton } from "@/components/carousel-skeletons"
import { InlineError } from "@/components/error-state"
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCarouselDrop } from "@/hooks/use-carousel-drop"
import { useCarouselMutations } from "@/hooks/use-carousel-mutations"
import { useFolderMutations, useFolders } from "@/hooks/use-folders"
import { brandPath, useCurrentBrandId } from "@/lib/brand-context"
import { useCatalog } from "@/lib/catalog"
import type { Folder } from "@/lib/types"
import { cn } from "@/lib/utils"

type FoldersSectionProps = {
  collapsed?: boolean
  /** Chamado depois de navegar: fecha o painel "Mais" no celular. */
  onNavigate?: () => void
  /**
   * Substitui a entrada do histórico em vez de empilhar. Dentro de uma folha, que tem
   * entrada própria no histórico para o botão voltar do Android.
   */
  replaceHistory?: boolean
  /**
   * Sem pastas, só o convite em uma linha e a explicação numa dica. Na barra lateral
   * um parágrafo empurraria o resto do menu para fora da tela.
   */
  compactEmpty?: boolean
}

export function FoldersSection({
  collapsed = false,
  onNavigate,
  replaceHistory = false,
  compactEmpty = false,
}: FoldersSectionProps) {
  const { t } = useTranslation()
  // As pastas são da marca de agora. Sem marca ainda, a seção não aparece.
  const brandId = useCurrentBrandId()
  const { folders, isLoading, error, reload } = useFolders(brandId ?? undefined)
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
      if (!brandId) return
      const folder = await create(brandId, name, color)
      setCreating(false)
      toast(t("folders.created", { name }))
      navigate(brandPath(brandId, `/folders/${folder.id}`), { replace: replaceHistory })
      onNavigate?.()
    } catch {
      toast.error(t("folders.createFailed"))
    } finally {
      setSaving(false)
    }
  }

  if (!brandId) return null

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        {list.map((folder) => (
          <FolderRow key={folder.id} folder={folder} collapsed />
        ))}
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div className="mb-0.5 flex h-6 items-center justify-between pl-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("folders.sectionTitle")}
        </span>
        {list.length > 0 && !creating && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground pointer-coarse:size-10"
            aria-label={t("folders.create")}
            onClick={() => setCreating(true)}
          >
            <Plus />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {list.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            onNavigate={onNavigate}
            replaceHistory={replaceHistory}
          />
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
        ) : list.length === 0 && compactEmpty ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
                />
              }
            >
              <Plus className="size-4 shrink-0" aria-hidden />
              {t("folders.createFirst")}
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-60">
              {t("folders.emptyHint")}
            </TooltipContent>
          </Tooltip>
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
    </div>
  )
}

function FolderRow({
  folder,
  collapsed = false,
  onNavigate,
  replaceHistory = false,
}: {
  folder: Folder
  collapsed?: boolean
  onNavigate?: () => void
  replaceHistory?: boolean
}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { renameFolder, deleteFolder } = useFolderMutations()
  const confirm = useConfirm()
  const { move } = useCarouselMutations()
  const navigate = useNavigate()
  const currentBrandId = useCurrentBrandId()
  const [renaming, setRenaming] = useState(false)
  // Contado pelo servidor, junto com a lista — a tela não tem mais todos os
  // carrosséis em memória para contar sozinha.
  const count = folder.carouselCount
  const brandId = folder.brandId ?? currentBrandId
  const to = brandId ? brandPath(brandId, `/folders/${folder.id}`) : `/folders/${folder.id}`
  const listPath = brandId ? brandPath(brandId, "/carousels") : "/carousels"
  const active = pathname === to

  const { dragOver, dropHandlers } = useCarouselDrop((id) => {
    move(id, folder.id)
      .then(() => toast(t("carousels.actions.movedToast", { name: folder.name })))
      .catch(() => toast.error(t("carousels.actions.moveFailed")))
  })

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
    <Link
      to={to}
      replace={replaceHistory}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={
        collapsed ? t("folders.countAria", { name: folder.name, count }) : undefined
      }
      {...dropHandlers}
      className={cn(
        "group/folder flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        collapsed && "justify-center px-0",
        dragOver && "bg-accent text-accent-foreground ring-2 ring-ring/60"
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: folder.color }}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{folder.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums group-hover/folder:hidden group-focus-within/folder:hidden pointer-coarse:hidden">
            {count}
          </span>
          <span
            className="hidden group-hover/folder:inline-flex group-focus-within/folder:inline-flex pointer-coarse:inline-flex"
            onClick={(event) => event.preventDefault()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground pointer-coarse:size-8"
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
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: t("folders.deleteConfirmTitle", { name: folder.name }),
                      description: t("folders.deleteConfirmDescription"),
                      confirmLabel: t("folders.deleteFolder"),
                      destructive: true,
                      onConfirm: () => deleteFolder(folder.id),
                    })
                    if (!confirmed) return

                    toast(t("folders.deleted", { name: folder.name }), {
                      description: t("folders.deletedDescription"),
                    })
                    navigate(listPath)
                  }}
                >
                  <Trash2 /> {t("folders.deleteFolder")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </>
      )}
    </Link>
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
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit()
          if (event.key === "Escape") onCancel()
        }}
        className="h-8"
      />
      <div
        className="flex items-center gap-1.5"
        role="radiogroup"
        aria-label={t("folders.colorGroupAria")}
      >
        {folderColors.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={color === option.value}
            aria-label={t(`folders.colors.${option.id}`, { defaultValue: option.id })}
            onClick={() => setColor(option.value)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-8",
              color === option.value && "ring-2 ring-ring"
            )}
            style={{ backgroundColor: option.value }}
          >
            {color === option.value && <Check className="size-3.5 text-white" />}
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
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onDone(name.trim() || null)
          if (event.key === "Escape") onDone(null)
        }}
        onBlur={() => onDone(name.trim() || null)}
        className="h-8"
        aria-label={t("folders.newNameAria")}
      />
    </div>
  )
}
