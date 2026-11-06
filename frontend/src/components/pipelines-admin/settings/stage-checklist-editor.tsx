import { useState, type FormEvent, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { ListChecks, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  DragHandle,
  ErrorState,
  ListSkeleton,
  SortableArea,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useStageChecklist } from "@/hooks/pipelines-admin/use-stage-checklist"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import { adminErrorMessage } from "@/lib/pipelines-admin/error-message"
import type { StageChecklistItem } from "@/lib/pipelines-admin/types"

/**
 * O que precisa estar marcado para o card avançar. Trava só para a frente: voltar de etapa não
 * exige nada. Item não obrigatório aparece no card, sem segurar ninguém.
 */
export function StageChecklistEditor({ boardId, stageId }: { boardId: string; stageId: string }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { items, error, isLoading, reload, createItem, updateItem, deleteItem, reorderItems } =
    useStageChecklist(boardId, stageId)

  const [title, setTitle] = useState("")
  const [creating, setCreating] = useState(false)

  async function add(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    const text = title.trim()
    if (!text || creating) return

    setCreating(true)
    try {
      await createItem({ title: text })
      setTitle("")
    } catch (cause) {
      toast.error(adminErrorMessage(t, cause))
    } finally {
      setCreating(false)
    }
  }

  async function remove(item: StageChecklistItem) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.stages.checklist.delete.title"),
      description: t("pipelinesAdmin.stages.checklist.delete.description", { title: item.title }),
      confirmLabel: t("pipelinesAdmin.stages.checklist.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteItem(item.id),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.stages.checklist.delete.done"))
  }

  function safely(action: Promise<unknown>) {
    action.catch((cause) => toast.error(adminErrorMessage(t, cause)))
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`checklist-${stageId}`}>
      <div className="space-y-0.5">
        <h3 id={`checklist-${stageId}`} className="text-sm font-medium">
          {t("pipelinesAdmin.stages.checklist.title")}
        </h3>
        <p className="text-xs text-pretty text-muted-foreground">
          {t("pipelinesAdmin.stages.checklist.hint")}
        </p>
      </div>

      {error && !items ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !items ? (
        <ListSkeleton rows={2} />
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <ListChecks aria-hidden className="size-4 shrink-0" />
          {t("pipelinesAdmin.stages.checklist.empty")}
        </p>
      ) : (
        <SortableArea
          items={items}
          nameOf={(item) => item.title}
          onReorder={(ordered) => safely(reorderItems(ordered))}
        >
          <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onRename={(next) => safely(updateItem(item.id, { title: next }))}
                onToggleRequired={(required) => safely(updateItem(item.id, { required }))}
                onDelete={() => void remove(item)}
              />
            ))}
          </ul>
        </SortableArea>
      )}

      {/* Não é um <form>: o painel já é um, e formulário dentro de formulário não existe. */}
      <div className="flex gap-2">
        <Input
          value={title}
          placeholder={t("pipelinesAdmin.stages.checklist.addPlaceholder")}
          aria-label={t("pipelinesAdmin.stages.checklist.addPlaceholder")}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add(event)
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!title.trim() || creating}
          onClick={(event) => void add(event)}
          className="shrink-0 pointer-coarse:h-10"
        >
          <Plus />
          {t("pipelinesAdmin.stages.checklist.add")}
        </Button>
      </div>
    </section>
  )
}

function ChecklistRow({
  item,
  onRename,
  onToggleRequired,
  onDelete,
}: {
  item: StageChecklistItem
  onRename: (title: string) => void
  onToggleRequired: (required: boolean) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps } = useSortableEntry(item.id)
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    const text = draft?.trim()
    setDraft(null)
    if (text && text !== item.title) onRename(text)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      commit()
    } else if (event.key === "Escape") {
      event.stopPropagation()
      setDraft(null)
    }
  }

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-1 bg-card py-1 pr-1 pl-1 first:rounded-t-lg last:rounded-b-lg">
      <DragHandle
        {...handleProps}
        label={t("pipelinesAdmin.stages.checklist.dragItem", { title: item.title })}
      />
      <Input
        value={draft ?? item.title}
        aria-label={t("pipelinesAdmin.stages.checklist.itemTitle")}
        className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 shadow-none hover:border-input pointer-coarse:h-10"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 px-1 text-xs text-muted-foreground pointer-coarse:min-h-10">
        {t("pipelinesAdmin.stages.checklist.required")}
        <Switch checked={item.required} onCheckedChange={onToggleRequired} />
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("pipelinesAdmin.stages.checklist.deleteItem", { title: item.title })}
        className="text-muted-foreground hover:text-destructive pointer-coarse:size-10"
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </li>
  )
}
