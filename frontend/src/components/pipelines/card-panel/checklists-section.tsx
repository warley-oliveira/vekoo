import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useCardChecklists, useStageChecks } from "@/hooks/pipelines/use-card-detail"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import type { Checklist } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

/** Texto de uma linha que confirma com Enter e sai com Esc. */
function InlineAdd({
  placeholder,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  confirmLabel: string
  onSubmit: (text: string) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await onSubmit(value)
      setText("")
    } catch (error) {
      toast.error(pipelineErrorText(t, error, "pipelines.errors.saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={text}
        maxLength={500}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void submit()
          } else if (event.key === "Escape") {
            event.stopPropagation()
            onCancel()
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        className="pointer-coarse:h-10"
        aria-busy={busy}
        onClick={() => void submit()}
      >
        {confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="pointer-coarse:size-10"
        aria-label={t("pipelines.actions.cancel")}
        onClick={onCancel}
      >
        <X />
      </Button>
    </div>
  )
}

function ChecklistBlock({
  checklist,
  onToggle,
  onAddItem,
  onDeleteItem,
  onDelete,
}: {
  checklist: Checklist
  onToggle: (itemId: string) => void
  onAddItem: (title: string) => Promise<void>
  onDeleteItem: (itemId: string) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)

  const total = checklist.items.length
  const done = checklist.items.filter((item) => item.completed).length

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-sm">{checklist.name}</h4>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{total}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground pointer-coarse:size-9"
          aria-label={t("pipelines.checklists.deleteOf", { name: checklist.name })}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      {total > 0 ? <Progress value={(done / total) * 100} className="h-1" /> : null}

      <ul className="flex flex-col">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className="group/item flex min-h-8 items-center gap-2 rounded-md px-1 hover:bg-muted/50 pointer-coarse:min-h-10"
          >
            <Checkbox
              id={`check-${item.id}`}
              className="border-muted-foreground/40"
              checked={item.completed}
              onCheckedChange={() => onToggle(item.id)}
            />
            <label
              htmlFor={`check-${item.id}`}
              className={cn(
                "min-w-0 flex-1 cursor-pointer py-1 text-sm",
                item.completed && "text-muted-foreground line-through"
              )}
            >
              {item.title}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
              aria-label={t("pipelines.checklists.deleteItemOf", { title: item.title })}
              onClick={() => onDeleteItem(item.id)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>

      {adding ? (
        <InlineAdd
          placeholder={t("pipelines.checklists.itemPlaceholder")}
          confirmLabel={t("pipelines.checklists.addItemConfirm")}
          onSubmit={onAddItem}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={() => setAdding(true)}
          >
            <Plus />
            {t("pipelines.checklists.addItem")}
          </Button>
        </div>
      )}
    </div>
  )
}

/** As listas de tarefas do card. */
export function ChecklistsSection({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const {
    checklists,
    isLoading,
    createChecklist,
    deleteChecklist,
    createItem,
    toggleItem,
    deleteItem,
  } = useCardChecklists(boardId, cardId)
  const [adding, setAdding] = useState(false)

  const report = (error: unknown) =>
    toast.error(pipelineErrorText(t, error, "pipelines.errors.saveFailed"))

  async function removeChecklist(checklist: Checklist) {
    const confirmed = await confirm({
      title: t("pipelines.checklists.deleteTitle", { name: checklist.name }),
      description: t("pipelines.checklists.deleteHint"),
      confirmLabel: t("pipelines.checklists.delete"),
      destructive: true,
      onConfirm: () => deleteChecklist(checklist.id),
    })
    if (confirmed) toast.success(t("pipelines.checklists.deleted"))
  }

  return (
    <section aria-labelledby="card-checklists-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-checklists-title" className="text-sm font-medium">
          {t("pipelines.checklists.title")}
        </h3>
        {adding ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground pointer-coarse:h-10"
            onClick={() => setAdding(true)}
          >
            <Plus />
            {t("pipelines.checklists.add")}
          </Button>
        )}
      </div>

      {adding ? (
        <InlineAdd
          placeholder={t("pipelines.checklists.namePlaceholder")}
          confirmLabel={t("pipelines.checklists.create")}
          onSubmit={async (name) => {
            await createChecklist(name)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : checklists.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">{t("pipelines.checklists.empty")}</p>
      ) : (
        checklists.map((checklist) => (
          <ChecklistBlock
            key={checklist.id}
            checklist={checklist}
            onToggle={(itemId) => void toggleItem(checklist.id, itemId).catch(report)}
            onAddItem={(title) => createItem(checklist.id, title)}
            onDeleteItem={(itemId) => void deleteItem(checklist.id, itemId).catch(report)}
            onDelete={() => void removeChecklist(checklist)}
          />
        ))
      )}
    </section>
  )
}

/** O que falta marcar para o card sair da etapa. Só aparece se a etapa pede alguma coisa. */
export function StageChecksSection({
  boardId,
  cardId,
  stageId,
  stageName,
}: {
  boardId: string
  cardId: string
  stageId: string
  stageName: string
}) {
  const { t } = useTranslation()
  const { checks, toggle, reload } = useStageChecks(boardId, cardId)

  // A lista é da etapa: o card mudou de etapa, mudou a lista.
  useEffect(() => {
    void reload()
  }, [reload, stageId])

  if (checks.length === 0) return null

  const done = checks.filter((check) => check.completed).length

  return (
    <section aria-labelledby="card-stage-checks-title" className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h3 id="card-stage-checks-title" className="text-sm font-medium">
          {t("pipelines.stageChecks.title")}
        </h3>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{stageName}</span>
        <span
          className={cn(
            "text-xs text-muted-foreground tabular-nums",
            done === checks.length && "text-status-success"
          )}
        >
          {done}/{checks.length}
        </span>
      </div>
      <Progress value={(done / checks.length) * 100} className="h-1" />
      <ul className="flex flex-col pt-0.5">
        {checks.map((check) => (
          <li
            key={check.id}
            className="flex min-h-8 items-center gap-2 rounded-md px-1 hover:bg-muted/50 pointer-coarse:min-h-10"
          >
            <Checkbox
              id={`stage-check-${check.id}`}
              className="border-muted-foreground/40"
              checked={check.completed}
              onCheckedChange={() =>
                void toggle(check.id).catch((error: unknown) =>
                  toast.error(pipelineErrorText(t, error, "pipelines.errors.saveFailed"))
                )
              }
            />
            <label
              htmlFor={`stage-check-${check.id}`}
              className={cn(
                "min-w-0 flex-1 cursor-pointer py-1 text-sm",
                check.completed && "text-muted-foreground line-through"
              )}
            >
              {check.title}
              {check.required ? (
                <span className="ml-0.5 text-status-danger" title={t("pipelines.stageChecks.required")}>
                  *
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
