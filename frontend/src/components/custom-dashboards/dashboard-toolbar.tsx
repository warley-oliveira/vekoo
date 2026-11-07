import { useTranslation } from "react-i18next"
import { Copy, Pencil, Plus, Redo2, RefreshCw, Star, Trash2, Type, Undo2 } from "lucide-react"

import { ActionsMenu, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { CustomDashboard } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

export const REFRESH_OPTIONS = [0, 30, 60, 300] as const

type DashboardToolbarProps = {
  dashboard: CustomDashboard
  editing: boolean
  dirty: boolean
  saving: boolean
  canUndo: boolean
  canRedo: boolean
  refreshSeconds: number
  onRefreshSecondsChange: (seconds: number) => void
  onRefresh: () => void
  onEdit: () => void
  onAddCard: () => void
  onUndo: () => void
  onRedo: () => void
  onCancel: () => void
  onSave: () => void
  onRename: () => void
  onDuplicate: () => void
  onToggleFavorite: () => void
  onDelete: () => void
}

/** Os controles do painel. Lendo, é quase nada; editando, gruda no alto, porque "Salvar" não pode sair de vista. */
export function DashboardToolbar({
  dashboard,
  editing,
  dirty,
  saving,
  canUndo,
  canRedo,
  refreshSeconds,
  onRefreshSecondsChange,
  onRefresh,
  onEdit,
  onAddCard,
  onUndo,
  onRedo,
  onCancel,
  onSave,
  onRename,
  onDuplicate,
  onToggleFavorite,
  onDelete,
}: DashboardToolbarProps) {
  const { t } = useTranslation()

  const menu = (
    <ActionsMenu
      label={t("customDashboards.toolbar.more")}
      actions={[
        { label: t("customDashboards.toolbar.rename"), icon: <Type />, onSelect: onRename },
        { label: t("customDashboards.toolbar.duplicate"), icon: <Copy />, onSelect: onDuplicate, disabled: dirty },
        {
          label: t(dashboard.isFavorite ? "customDashboards.toolbar.unfavorite" : "customDashboards.toolbar.favorite"),
          icon: <Star className={cn(dashboard.isFavorite && "fill-current")} />,
          onSelect: onToggleFavorite,
        },
        { label: t("customDashboards.toolbar.delete"), icon: <Trash2 />, onSelect: onDelete, destructive: true, separatorBefore: true },
      ]}
    />
  )

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 basis-60 text-sm text-pretty text-muted-foreground">{dashboard.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("customDashboards.toolbar.refresh")}
            title={t("customDashboards.toolbar.refresh")}
            className="text-muted-foreground"
            onClick={onRefresh}
          >
            <RefreshCw />
          </Button>
          <div className="w-48">
            <SelectInput
              size="sm"
              aria-label={t("customDashboards.toolbar.autoRefresh")}
              options={REFRESH_OPTIONS.map((seconds) => ({
                value: String(seconds),
                label: t(`customDashboards.toolbar.refreshOptions.${seconds}`),
              }))}
              value={String(refreshSeconds)}
              onChange={(next) => onRefreshSecondsChange(Number(next ?? 0))}
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={onEdit}>
            <Pencil />
            {t("customDashboards.toolbar.edit")}
          </Button>
          {menu}
        </div>
      </div>
    )
  }

  return (
    <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-b-lg bg-background/95 px-1 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canUndo}
          aria-label={t("customDashboards.toolbar.undo")}
          title={t("customDashboards.toolbar.undo")}
          className="text-muted-foreground"
          onClick={onUndo}
        >
          <Undo2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canRedo}
          aria-label={t("customDashboards.toolbar.redo")}
          title={t("customDashboards.toolbar.redo")}
          className="text-muted-foreground"
          onClick={onRedo}
        >
          <Redo2 />
        </Button>
      </div>
      <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={onAddCard}>
        <Plus />
        {t("customDashboards.toolbar.addCard")}
      </Button>

      <div className="ml-auto flex items-center gap-1.5">
        <span role="status" className="hidden text-xs text-muted-foreground sm:inline">
          {dirty ? t("customDashboards.toolbar.unsaved") : t("customDashboards.toolbar.noChanges")}
        </span>
        {menu}
        <Button type="button" variant="ghost" size="sm" disabled={saving} className="pointer-coarse:h-10" onClick={onCancel}>
          {t("customDashboards.toolbar.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!dirty}
          aria-busy={saving}
          className={cn("pointer-coarse:h-10", saving && "pointer-events-none opacity-80")}
          onClick={onSave}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          {t("customDashboards.toolbar.save")}
        </Button>
      </div>
    </div>
  )
}
