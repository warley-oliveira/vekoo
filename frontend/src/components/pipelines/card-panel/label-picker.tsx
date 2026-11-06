import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Check, Pencil, Plus, Tag, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ResponsivePopover, TagChip, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLabelMutations, useLabels } from "@/hooks/pipelines/use-labels"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import { COLOR_SWATCHES } from "@/lib/tag-color"
import type { CardLabel, Label } from "@/lib/pipelines/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

const MAX_NAME = 60

type LabelPickerProps = {
  value: CardLabel[]
  onChange: (labels: CardLabel[]) => void
}

/** Marcar etiquetas, criar uma nova e editar as que existem, sem sair do card. */
export function LabelPicker({ value, onChange }: LabelPickerProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { labels } = useLabels()
  const { createLabel, updateLabel, deleteLabel } = useLabelMutations()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<Label | "new" | null>(null)
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0])
  const [saving, setSaving] = useState(false)

  const selectedIds = useMemo(() => new Set(value.map((label) => label.id)), [value])
  const visible = useMemo(
    () => (query ? labels.filter((label) => matchesSearch(label.name, query)) : labels),
    [labels, query]
  )

  function toggle(label: Label) {
    onChange(
      selectedIds.has(label.id)
        ? value.filter((item) => item.id !== label.id)
        : [...value, { id: label.id, name: label.name, color: label.color }]
    )
  }

  function startCreate() {
    setName(query.trim())
    setColor(COLOR_SWATCHES[0])
    setEditing("new")
  }

  function startEdit(label: Label) {
    setName(label.name)
    setColor(label.color)
    setEditing(label)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      if (editing === "new") {
        const label = await createLabel({ name: trimmed, color })
        onChange([...value, { id: label.id, name: label.name, color: label.color }])
      } else if (editing) {
        const label = await updateLabel(editing.id, { name: trimmed, color })
        if (selectedIds.has(label.id)) {
          onChange(
            value.map((item) =>
              item.id === label.id ? { id: label.id, name: label.name, color: label.color } : item
            )
          )
        }
      }
      setEditing(null)
      setQuery("")
    } catch (error) {
      toast.error(pipelineErrorText(t, error, "pipelines.errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function remove(label: Label) {
    const confirmed = await confirm({
      title: t("pipelines.labels.deleteTitle", { name: label.name }),
      description: t("pipelines.labels.deleteHint"),
      confirmLabel: t("pipelines.labels.delete"),
      destructive: true,
      onConfirm: () => deleteLabel(label.id),
    })
    if (!confirmed) return
    onChange(value.filter((item) => item.id !== label.id))
    setEditing(null)
    toast.success(t("pipelines.labels.deleted"))
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setEditing(null)
          setQuery("")
        }
      }}
      title={t("pipelines.card.labels")}
      className="w-72 gap-0 overflow-hidden p-0"
      sheetClassName="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      trigger={
        <button
          type="button"
          className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
        >
          {value.length > 0 ? (
            value.map((label) => (
              <TagChip key={label.id} color={label.color}>
                {label.name}
              </TagChip>
            ))
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Tag className="size-3.5" aria-hidden />
              {t("pipelines.card.addLabel")}
            </span>
          )}
        </button>
      }
    >
      {editing ? (
        <div className="flex flex-col gap-3 md:p-3">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="pointer-coarse:size-9"
              aria-label={t("pipelines.actions.back")}
              onClick={() => setEditing(null)}
            >
              <ArrowLeft />
            </Button>
            <span className="text-sm font-medium">
              {t(editing === "new" ? "pipelines.labels.new" : "pipelines.labels.edit")}
            </span>
          </div>
          <TagChip color={color} className="self-start">
            {name.trim() || t("pipelines.labels.preview")}
          </TagChip>
          <Input
            autoFocus
            value={name}
            maxLength={MAX_NAME}
            aria-label={t("pipelines.labels.name")}
            placeholder={t("pipelines.labels.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void save()
              }
            }}
          />
          <div
            role="radiogroup"
            aria-label={t("pipelines.labels.color")}
            className="grid grid-cols-8 gap-1.5"
          >
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={color === swatch}
                aria-label={swatch}
                onClick={() => setColor(swatch)}
                style={{ backgroundColor: swatch }}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  color === swatch && "ring-2 ring-foreground ring-offset-1 ring-offset-popover"
                )}
              >
                {color === swatch ? <Check className="size-3" aria-hidden /> : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="flex-1 pointer-coarse:h-10"
              disabled={!name.trim()}
              aria-busy={saving}
              onClick={() => void save()}
            >
              {t(editing === "new" ? "pipelines.labels.create" : "pipelines.labels.save")}
            </Button>
            {editing !== "new" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive pointer-coarse:size-10"
                aria-label={t("pipelines.labels.delete")}
                onClick={() => void remove(editing)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="md:p-2">
            <Input
              value={query}
              aria-label={t("pipelines.labels.search")}
              placeholder={t("pipelines.labels.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ul className="flex max-h-56 flex-col overflow-y-auto px-1 pt-1 md:pt-0">
            {visible.map((label) => {
              const selected = selectedIds.has(label.id)
              return (
                <li key={label.id} className="group/label flex items-center rounded-md hover:bg-muted/60">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(label)}
                    className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{label.name}</span>
                    {selected ? <Check className="size-4 text-primary" aria-hidden /> : null}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground opacity-0 group-focus-within/label:opacity-100 group-hover/label:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
                    aria-label={t("pipelines.labels.editOf", { name: label.name })}
                    onClick={() => startEdit(label)}
                  >
                    <Pencil />
                  </Button>
                </li>
              )
            })}
            {visible.length === 0 ? (
              <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                {labels.length === 0 ? t("pipelines.labels.empty") : t("pipelines.labels.noResults")}
              </li>
            ) : null}
          </ul>
          <div className="border-t pt-1 md:mt-1 md:p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start pointer-coarse:h-10"
              onClick={startCreate}
            >
              <Plus />
              {t("pipelines.labels.new")}
            </Button>
          </div>
        </>
      )}
    </ResponsivePopover>
  )
}
