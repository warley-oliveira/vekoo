import { memo, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Bookmark, Check, Lock, Pencil, Plus, Star, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { ResponsivePopover, SearchInput, SegmentedControl, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSavedFilterMutations, useSavedFilters } from "@/hooks/pipelines/use-saved-filters"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import type { AdvancedFilter } from "@/lib/pipelines/filters"
import type { PresetFilter, SavedFilter } from "@/lib/pipelines/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

type Tab = "all" | "favorites"

function Row({
  name,
  icon,
  applied,
  favorite,
  onApply,
  onFavorite,
  trailing,
}: {
  name: string
  icon: React.ReactNode
  applied: boolean
  favorite: boolean
  onApply: () => void
  onFavorite: () => void
  trailing?: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <li className="group/row flex items-center gap-0.5 rounded-md hover:bg-muted/60">
      <button
        type="button"
        onClick={onApply}
        aria-pressed={applied}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
      >
        <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">
          {applied ? <Check className="text-primary" /> : icon}
        </span>
        <span className={cn("min-w-0 flex-1 truncate", applied && "font-medium")}>{name}</span>
      </button>
      {trailing}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "text-muted-foreground pointer-coarse:size-9",
          favorite && "text-status-warning"
        )}
        aria-pressed={favorite}
        aria-label={t(favorite ? "pipelines.savedFilters.unfavorite" : "pipelines.savedFilters.favorite", { name })}
        onClick={onFavorite}
      >
        <Star className={favorite ? "fill-current" : undefined} />
      </Button>
    </li>
  )
}

type SavedFiltersMenuProps = {
  boardId: string
  advanced: AdvancedFilter | null
  onApply: (filter: AdvancedFilter) => void
  onCreate: () => void
  onEdit: (filter: SavedFilter) => void
}

/** Os filtros prontos e os salvos: aplicar, favoritar, editar, apagar e criar um novo. */
export const SavedFiltersMenu = memo(function SavedFiltersMenu({
  boardId,
  advanced,
  onApply,
  onCreate,
  onEdit,
}: SavedFiltersMenuProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { presets, filters, favorites, isLoading } = useSavedFilters(boardId)
  const { toggleFavorite, deleteFilter } = useSavedFilterMutations(boardId)

  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>("all")
  const [query, setQuery] = useState("")

  const presetName = (preset: PresetFilter) => t(preset.nameKey)
  const applied = (item: SavedFilter | PresetFilter) =>
    item.isPreset
      ? advanced?.kind === "preset" && advanced.key === item.key
      : advanced?.kind === "saved" && advanced.id === item.id

  const visibleFilters = useMemo(
    () => filters.filter((filter) => !query || matchesSearch(filter.name, query)),
    [filters, query]
  )
  const visiblePresets = presets.filter(
    (preset) => !query || matchesSearch(presetName(preset), query)
  )
  const quick = visiblePresets.filter((preset) => preset.section === "quick")
  const cleanup = visiblePresets.filter((preset) => preset.section === "data_cleanup")

  const favorite = (target: Parameters<typeof toggleFavorite>[0]) => {
    toggleFavorite(target).catch((error: unknown) =>
      toast.error(pipelineErrorText(t, error, "pipelines.errors.saveFailed"))
    )
  }

  async function remove(filter: SavedFilter) {
    const confirmed = await confirm({
      title: t("pipelines.savedFilters.deleteTitle", { name: filter.name }),
      description: t("pipelines.savedFilters.deleteHint"),
      confirmLabel: t("pipelines.savedFilters.delete"),
      destructive: true,
      onConfirm: () => deleteFilter(filter.id),
    })
    if (confirmed) toast.success(t("pipelines.savedFilters.deleted"))
  }

  const renderFilter = (filter: SavedFilter) => (
    <Row
      key={filter.id}
      name={filter.name}
      icon={filter.visibility === "private" ? <Lock /> : <Users />}
      applied={applied(filter)}
      favorite={filter.favorite}
      onApply={() => {
        onApply({ kind: "saved", id: filter.id })
        setOpen(false)
      }}
      onFavorite={() => favorite({ savedFilterId: filter.id })}
      trailing={
        filter.editable ? (
          <span className="flex items-center opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground pointer-coarse:size-9"
              aria-label={t("pipelines.savedFilters.edit", { name: filter.name })}
              onClick={() => {
                setOpen(false)
                onEdit(filter)
              }}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground pointer-coarse:size-9"
              aria-label={t("pipelines.savedFilters.deleteOf", { name: filter.name })}
              onClick={() => void remove(filter)}
            >
              <Trash2 />
            </Button>
          </span>
        ) : null
      }
    />
  )

  const renderPreset = (preset: PresetFilter) => (
    <Row
      key={preset.key}
      name={presetName(preset)}
      icon={<Bookmark />}
      applied={applied(preset)}
      favorite={preset.favorite}
      onApply={() => {
        onApply({ kind: "preset", key: preset.key })
        setOpen(false)
      }}
      onFavorite={() => favorite({ presetKey: preset.key })}
    />
  )

  const groupTitle = "px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground"

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={t("pipelines.savedFilters.title")}
      align="end"
      className="w-80 gap-0 overflow-hidden p-0"
      sheetClassName="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      trigger={
        <Button
          type="button"
          size={isMobile ? "icon" : "default"}
          variant={advanced ? "secondary" : "outline"}
          aria-label={isMobile ? t("pipelines.savedFilters.trigger") : undefined}
          className={cn(
            "pointer-coarse:h-10 pointer-coarse:min-w-10",
            advanced && "bg-accent text-accent-foreground"
          )}
        >
          <Bookmark />
          {isMobile ? null : t("pipelines.savedFilters.trigger")}
        </Button>
      }
    >
      <div className="flex flex-col gap-2 md:p-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          debounce={0}
          shortcut={false}
          placeholder={t("pipelines.savedFilters.search")}
          aria-label={t("pipelines.savedFilters.search")}
        />
        <SegmentedControl<Tab>
          fullWidth
          aria-label={t("pipelines.savedFilters.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: t("pipelines.savedFilters.tabAll") },
            { value: "favorites", label: t("pipelines.savedFilters.tabFavorites"), count: favorites.length },
          ]}
        />
      </div>

      <div className="max-h-[min(55dvh,22rem)] overflow-y-auto px-1 pb-1">
        {isLoading ? (
          <div className="flex flex-col gap-1.5 p-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-4/5" />
          </div>
        ) : tab === "favorites" ? (
          favorites.length > 0 ? (
            <ul className="flex flex-col gap-0.5 pt-1">
              {favorites.map((item) => (item.isPreset ? renderPreset(item) : renderFilter(item)))}
            </ul>
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("pipelines.savedFilters.noFavorites")}
            </p>
          )
        ) : (
          <>
            {visibleFilters.length > 0 ? (
              <>
                <p className={groupTitle}>{t("pipelines.savedFilters.mine")}</p>
                <ul className="flex flex-col gap-0.5">{visibleFilters.map(renderFilter)}</ul>
              </>
            ) : null}
            {quick.length > 0 ? (
              <>
                <p className={groupTitle}>{t("pipelines.savedFilters.quick")}</p>
                <ul className="flex flex-col gap-0.5">{quick.map(renderPreset)}</ul>
              </>
            ) : null}
            {cleanup.length > 0 ? (
              <>
                <p className={groupTitle}>{t("pipelines.savedFilters.cleanup")}</p>
                <ul className="flex flex-col gap-0.5">{cleanup.map(renderPreset)}</ul>
              </>
            ) : null}
            {visibleFilters.length === 0 && quick.length === 0 && cleanup.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("pipelines.savedFilters.noResults")}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="border-t pt-1 md:p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start pointer-coarse:h-10"
          onClick={() => {
            setOpen(false)
            onCreate()
          }}
        >
          <Plus />
          {t("pipelines.savedFilters.create")}
        </Button>
      </div>
    </ResponsivePopover>
  )
})
