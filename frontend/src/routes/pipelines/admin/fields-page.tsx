import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { Info, ListPlus, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  Callout,
  DragHandle,
  EmptyState,
  ErrorState,
  FilterBar,
  ListSkeleton,
  SettingsSection,
  SortableArea,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { FIELD_TYPE_ICONS } from "@/components/pipelines-admin/fields/field-types"
import { FieldPanel } from "@/components/pipelines-admin/fields/field-panel"
import { StageDot } from "@/components/pipelines-admin/settings/stages-section"
import { useBoardMutations } from "@/hooks/pipelines-admin/use-board"
import {
  useCustomFieldMutations,
  useCustomFields,
} from "@/hooks/pipelines-admin/use-custom-fields"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import type { Board, CustomField } from "@/lib/pipelines-admin/types"
import { matchesSearch } from "@/lib/search-text"

const NEW_FIELD = "new"
const SEARCH_FROM = 8

export default function FieldsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()

  const openNew = () =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set("field", NEW_FIELD)
      return next
    })

  const newButton = (
    <Button onClick={openNew} className="pointer-coarse:h-10">
      <Plus />
      {t("pipelinesAdmin.fields.create")}
    </Button>
  )

  return (
    <BoardFrame
      area="fields"
      skeleton={
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-10 w-full max-w-xl" />
          <ListSkeleton rows={5} />
        </div>
      }
      header={() => ({
        description: t("pipelinesAdmin.fields.description"),
        actions: newButton,
        mobilePlacement: "inline",
        mobileActions: (
          <Button onClick={openNew} aria-label={t("pipelinesAdmin.fields.create")} className="pointer-coarse:h-10">
            <Plus />
            {t("pipelinesAdmin.common.new")}
          </Button>
        ),
      })}
    >
      {(board) => (
        <FieldsContent board={board} params={params} setParams={setParams} onNew={openNew} />
      )}
    </BoardFrame>
  )
}

function FieldsContent({
  board,
  params,
  setParams,
  onNew,
}: {
  board: Board
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
  onNew: () => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { fields, error, isLoading, reload } = useCustomFields(board.id)
  const { deleteField, reorderFields } = useCustomFieldMutations(board.id)
  const { updateBoard } = useBoardMutations(board.id)

  const [query, setQuery] = useState("")

  const selected = params.get("field")
  const panelOpen = Boolean(selected)
  const panelKey = useOpenCount(panelOpen)
  const shown = useRetained(selected)
  const editing = useMemo(() => fields?.find((field) => field.id === shown) ?? null, [fields, shown])
  const lastEditing = useRetained(editing)
  const shownField = shown === NEW_FIELD ? null : lastEditing

  function openPanel(value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set("field", value)
        else next.delete("field")
        return next
      },
      { replace: value === null }
    )
  }

  const visible = useMemo(
    () => (fields ?? []).filter((field) => !query || matchesSearch(field.name, query)),
    [fields, query]
  )

  // Os do quadro primeiro, depois os de cada etapa, na ordem do quadro. Uma lista só para a API.
  const groups = useMemo(() => {
    const boardFields = visible.filter((field) => field.scope === "board" || !field.stageId)
    const stageGroups = board.stages
      .map((stage) => ({
        stage,
        fields: visible.filter((field) => field.scope === "stage" && field.stageId === stage.id),
      }))
      .filter((group) => group.fields.length > 0)
    return { boardFields, stageGroups }
  }, [board.stages, visible])

  /** Arrastar vale dentro do grupo; os outros grupos continuam na ordem em que estão. */
  async function reorderGroup(group: CustomField[], ordered: CustomField[]) {
    if (!fields) return
    const inGroup = new Set(group.map((field) => field.id))
    const queue = [...ordered]
    const merged = fields.map((field) => (inGroup.has(field.id) ? queue.shift()! : field))
    try {
      await reorderFields(merged)
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    }
  }

  async function remove(field: CustomField) {
    const isScore = board.leadScoreFieldKey === field.key
    const confirmed = await confirm({
      title: t("pipelinesAdmin.fields.delete.title", { name: field.name }),
      description: isScore
        ? t("pipelinesAdmin.fields.delete.descriptionScore")
        : t("pipelinesAdmin.fields.delete.description"),
      confirmLabel: t("pipelinesAdmin.fields.delete.confirm"),
      destructive: true,
      onConfirm: async () => {
        await deleteField(field.id)
        // A pontuação apontaria para um campo que não existe mais.
        if (isScore) await updateBoard({ leadScoreFieldKey: null })
      },
    })
    if (confirmed) toast.success(t("pipelinesAdmin.fields.delete.done", { name: field.name }))
  }

  const canSearch = (fields?.length ?? 0) >= SEARCH_FROM

  return (
    <div className="flex flex-col gap-6">
      {board.boardType === "crm" ? (
        <DealCloseSection board={board} fields={fields ?? []} updateBoard={updateBoard} />
      ) : null}

      {error && !fields ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !fields ? (
        <ListSkeleton rows={5} />
      ) : fields.length === 0 ? (
        <EmptyState
          icon={<ListPlus className="size-5" />}
          title={t("pipelinesAdmin.fields.empty.title")}
          description={t("pipelinesAdmin.fields.empty.description")}
          action={{ label: t("pipelinesAdmin.fields.create"), onClick: onNew }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {canSearch ? (
            <FilterBar
              search={{
                value: query,
                onChange: setQuery,
                debounce: 0,
                placeholder: t("pipelinesAdmin.fields.search"),
              }}
              onClear={() => setQuery("")}
              resultLabel={t("pipelinesAdmin.fields.count", { count: visible.length })}
            />
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              title={t("pipelinesAdmin.fields.noResults.title")}
              description={t("pipelinesAdmin.fields.noResults.description")}
              action={{ label: t("pipelinesAdmin.common.clearSearch"), onClick: () => setQuery("") }}
            />
          ) : null}

          {groups.boardFields.length > 0 ? (
            <FieldGroup
              title={t("pipelinesAdmin.fields.groups.board")}
              fields={groups.boardFields}
              board={board}
              disabled={Boolean(query)}
              onReorder={(ordered) => void reorderGroup(groups.boardFields, ordered)}
              onEdit={(field) => openPanel(field.id)}
              onDelete={(field) => void remove(field)}
            />
          ) : null}

          {groups.stageGroups.map(({ stage, fields: stageFields }) => (
            <FieldGroup
              key={stage.id}
              title={
                <span className="flex items-center gap-2">
                  <StageDot color={stage.color} />
                  {t("pipelinesAdmin.fields.groups.stage", { name: stage.name })}
                </span>
              }
              fields={stageFields}
              board={board}
              disabled={Boolean(query)}
              onReorder={(ordered) => void reorderGroup(stageFields, ordered)}
              onEdit={(field) => openPanel(field.id)}
              onDelete={(field) => void remove(field)}
            />
          ))}
        </div>
      )}

      {shown ? (
        <FieldPanel
          key={panelKey}
          board={board}
          field={shownField}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) openPanel(null)
          }}
        />
      ) : null}
    </div>
  )
}

function FieldGroup({
  title,
  fields,
  board,
  disabled,
  onReorder,
  onEdit,
  onDelete,
}: {
  title: React.ReactNode
  fields: CustomField[]
  board: Board
  disabled: boolean
  onReorder: (ordered: CustomField[]) => void
  onEdit: (field: CustomField) => void
  onDelete: (field: CustomField) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-sm font-medium">{title}</h2>
      <SortableArea
        items={fields}
        nameOf={(field) => field.name}
        onReorder={onReorder}
        disabled={disabled}
      >
        <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
          {fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              board={board}
              disabled={disabled}
              onEdit={() => onEdit(field)}
              onDelete={() => onDelete(field)}
            />
          ))}
        </ul>
      </SortableArea>
    </section>
  )
}

function FieldRow({
  field,
  board,
  disabled,
  onEdit,
  onDelete,
}: {
  field: CustomField
  board: Board
  disabled: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps } = useSortableEntry(field.id)
  const Icon = FIELD_TYPE_ICONS[field.fieldType]

  const detail =
    field.fieldType === "select" && field.options?.length
      ? field.options.join(" · ")
      : t(`pipelinesAdmin.fields.types.${field.fieldType}`)

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="relative flex items-center gap-2 bg-card py-2 pr-2 pl-1 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/40"
    >
      <DragHandle
        {...handleProps}
        disabled={disabled}
        label={t("pipelinesAdmin.fields.drag", { name: field.name })}
        className="relative z-10"
      />
      <span
        title={t(`pipelinesAdmin.fields.types.${field.fieldType}`)}
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="block w-full truncate rounded text-left text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {field.name}
        </button>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        {board.leadScoreFieldKey === field.key ? (
          <StatusBadge tone="neutral">{t("pipelinesAdmin.fields.badges.score")}</StatusBadge>
        ) : null}
        {field.requiredToLeaveStage ? (
          <StatusBadge tone="warning">{t("pipelinesAdmin.fields.badges.requiredToLeave")}</StatusBadge>
        ) : null}
        {field.required && board.boardType === "crm" ? (
          <StatusBadge tone="neutral">{t("pipelinesAdmin.fields.badges.required")}</StatusBadge>
        ) : null}
      </div>
      <ActionsMenu
        label={t("pipelinesAdmin.fields.actionsOf", { name: field.name })}
        className="relative z-10"
        actions={[
          { label: t("pipelinesAdmin.fields.edit"), icon: <Pencil />, onSelect: onEdit },
          {
            label: t("pipelinesAdmin.fields.delete.action"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            onSelect: onDelete,
          },
        ]}
      />
    </li>
  )
}

/**
 * Liga o "obrigatório" de cada campo ao fechamento do negócio. Dois interruptores que valem na hora:
 * não há o que revisar antes, e a lista ao lado mostra o que vai passar a travar.
 */
function DealCloseSection({
  board,
  fields,
  updateBoard,
}: {
  board: Board
  fields: CustomField[]
  updateBoard: ReturnType<typeof useBoardMutations>["updateBoard"]
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  const required = fields.filter((field) => field.required)

  async function toggle(key: "requireFieldsOnDealWon" | "requireFieldsOnDealLost", value: boolean) {
    setSaving(key)
    setOptimistic((current) => ({ ...current, [key]: value }))
    try {
      await updateBoard({ [key]: value })
      toast.success(t("pipelinesAdmin.fields.dealClose.saved"))
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    } finally {
      setSaving(null)
      setOptimistic((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }

  const toggles = [
    { key: "requireFieldsOnDealWon", label: t("pipelinesAdmin.fields.dealClose.won") },
    { key: "requireFieldsOnDealLost", label: t("pipelinesAdmin.fields.dealClose.lost") },
  ] as const

  return (
    <SettingsSection
      title={t("pipelinesAdmin.fields.dealClose.title")}
      description={t("pipelinesAdmin.fields.dealClose.description")}
      className="border-b pb-6 md:pb-8"
    >
      <div className="flex flex-col gap-3">
        {toggles.map(({ key, label }) => (
          <label
            key={key}
            className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium pointer-coarse:min-h-10"
          >
            {label}
            <Switch
              checked={optimistic[key] ?? board[key]}
              disabled={saving === key}
              onCheckedChange={(checked) => void toggle(key, checked)}
            />
          </label>
        ))}
      </div>

      {required.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t("pipelinesAdmin.fields.dealClose.affected")}</span>
          <div className="flex flex-wrap gap-1.5">
            {required.map((field) => (
              <StatusBadge key={field.id} tone="neutral">
                {field.name}
              </StatusBadge>
            ))}
          </div>
        </div>
      ) : (
        <Callout tone="neutral" icon={<Info />}>
          {t("pipelinesAdmin.fields.dealClose.noneRequired")}
        </Callout>
      )}
    </SettingsSection>
  )
}
