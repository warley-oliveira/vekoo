import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Pencil, Plus, Tag, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ActionsMenu,
  ColorField,
  EmptyState,
  ErrorState,
  FilterBar,
  FormActions,
  ListSkeleton,
  ResponsiveDialog,
  SortMenu,
  TagChip,
  TextField,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { useLabels } from "@/hooks/pipelines-admin/use-labels"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { useLanguage } from "@/lib/i18n"
import type { Label } from "@/lib/pipelines-admin/types"
import { matchesSearch } from "@/lib/search-text"
import { COLOR_SWATCHES } from "@/lib/tag-color"

const NAME_MAX = 100

type SortOrder = "name-asc" | "name-desc" | "recent"
type DialogState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; label: Label }

export default function LabelsPage() {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" })
  const openNew = () => setDialog({ kind: "new" })

  return (
    <BoardFrame
      area="labels"
      skeleton={
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-10 w-full max-w-xl" />
          <ListSkeleton rows={6} />
        </div>
      }
      header={() => ({
        description: t("pipelinesAdmin.labels.description"),
        actions: (
          <Button onClick={openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("pipelinesAdmin.labels.create")}
          </Button>
        ),
        mobilePlacement: "inline",
        mobileActions: (
          <Button onClick={openNew} aria-label={t("pipelinesAdmin.labels.create")} className="pointer-coarse:h-10">
            <Plus />
            {t("pipelinesAdmin.common.new")}
          </Button>
        ),
      })}
    >
      {() => <LabelsContent dialog={dialog} setDialog={setDialog} onNew={openNew} />}
    </BoardFrame>
  )
}

function LabelsContent({
  dialog,
  setDialog,
  onNew,
}: {
  dialog: DialogState
  setDialog: (state: DialogState) => void
  onNew: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { labels, error, isLoading, reload, deleteLabel } = useLabels()

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortOrder>("name-asc")

  const open = dialog.kind !== "closed"
  const dialogKey = useOpenCount(open)
  const shown = useRetained(open ? dialog : null)

  const visible = useMemo(() => {
    const matching = (labels ?? []).filter((label) => !query || matchesSearch(label.name, query))
    return [...matching].sort((a, b) => {
      if (sort === "recent") return b.createdAt - a.createdAt
      const order = a.name.localeCompare(b.name, language)
      return sort === "name-asc" ? order : -order
    })
  }, [labels, language, query, sort])

  async function remove(label: Label) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.labels.delete.title", { name: label.name }),
      description: t("pipelinesAdmin.labels.delete.description"),
      confirmLabel: t("pipelinesAdmin.labels.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteLabel(label.id),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.labels.delete.done", { name: label.name }))
  }

  return (
    <>
      {error && !labels ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !labels ? (
        <ListSkeleton rows={6} />
      ) : labels.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-5" />}
          title={t("pipelinesAdmin.labels.empty.title")}
          description={t("pipelinesAdmin.labels.empty.description")}
          action={{ label: t("pipelinesAdmin.labels.create"), onClick: onNew }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <FilterBar
            search={{
              value: query,
              onChange: setQuery,
              debounce: 0,
              placeholder: t("pipelinesAdmin.labels.search"),
            }}
            onClear={() => setQuery("")}
            resultLabel={t("pipelinesAdmin.labels.count", { count: visible.length })}
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("pipelinesAdmin.labels.sort.nameAsc") },
                  { value: "name-desc", label: t("pipelinesAdmin.labels.sort.nameDesc") },
                  { value: "recent", label: t("pipelinesAdmin.labels.sort.recent") },
                ]}
              />
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("pipelinesAdmin.labels.noResults.title")}
              description={t("pipelinesAdmin.labels.noResults.description")}
              action={{ label: t("pipelinesAdmin.common.clearSearch"), onClick: () => setQuery("") }}
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((label) => (
                <li
                  key={label.id}
                  className="relative flex min-h-12 items-center gap-2 rounded-lg p-2 pl-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
                >
                  <button
                    type="button"
                    aria-label={t("pipelinesAdmin.labels.editNamed", { name: label.name })}
                    className="min-w-0 flex-1 rounded text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                    onClick={() => setDialog({ kind: "edit", label })}
                  >
                    <TagChip color={label.color} className="max-w-full">
                      <span className="truncate">{label.name}</span>
                    </TagChip>
                  </button>
                  <ActionsMenu
                    label={t("pipelinesAdmin.labels.actionsOf", { name: label.name })}
                    className="relative z-10"
                    actions={[
                      {
                        label: t("pipelinesAdmin.labels.edit"),
                        icon: <Pencil />,
                        onSelect: () => setDialog({ kind: "edit", label }),
                      },
                      {
                        label: t("pipelinesAdmin.labels.delete.action"),
                        icon: <Trash2 />,
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () => void remove(label),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shown ? (
        <LabelDialog
          key={dialogKey}
          label={shown.kind === "edit" ? shown.label : null}
          open={open}
          onOpenChange={(next) => {
            if (!next) setDialog({ kind: "closed" })
          }}
        />
      ) : null}
    </>
  )
}

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("pipelinesAdmin.labels.form.nameRequired"))
      .max(NAME_MAX, t("pipelinesAdmin.labels.form.nameTooLong")),
    color: z.string().min(1, t("pipelinesAdmin.labels.form.colorRequired")),
  })
}

type LabelValues = z.infer<ReturnType<typeof buildSchema>>

function LabelDialog({
  label,
  open,
  onOpenChange,
}: {
  label: Label | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { labels, createLabel, updateLabel } = useLabels()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<LabelValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: label?.name ?? "", color: label?.color ?? COLOR_SWATCHES[0] },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const name = useWatch({ control: form.control, name: "name" })
  const color = useWatch({ control: form.control, name: "color" })

  const submit = useFormSubmit(form, async (values) => {
    const input = { name: values.name.trim(), color: values.color }
    if (label) {
      await updateLabel(label.id, input)
      toast.success(t("pipelinesAdmin.labels.saved", { name: input.name }))
    } else {
      // A API acha ou cria: mesmo nome, sem ligar para a caixa, devolve a que já existe.
      const known = new Set((labels ?? []).map((item) => item.id))
      const saved = await createLabel(input)
      if (known.has(saved.id)) {
        toast.info(t("pipelinesAdmin.labels.alreadyExists", { name: saved.name }))
      } else {
        toast.success(t("pipelinesAdmin.labels.created", { name: saved.name }))
      }
    }
    close()
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={label ? t("pipelinesAdmin.labels.form.editTitle") : t("pipelinesAdmin.labels.form.createTitle")}
      description={t("pipelinesAdmin.labels.form.hint")}
      size="sm"
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={label ? t("pipelinesAdmin.labels.form.submitEdit") : t("pipelinesAdmin.labels.form.submitCreate")}
          onCancel={close}
          requireChanges={Boolean(label)}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          control={form.control}
          name="name"
          label={t("pipelinesAdmin.labels.form.name")}
          placeholder={t("pipelinesAdmin.labels.form.namePlaceholder")}
          autoComplete="off"
          autoFocus
          maxLength={NAME_MAX}
        />
        <ColorField control={form.control} name="color" label={t("pipelinesAdmin.labels.form.color")} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t("pipelinesAdmin.labels.form.preview")}</span>
          <div>
            <TagChip color={color} className="max-w-full">
              <span className="truncate">{name.trim() || t("pipelinesAdmin.labels.form.previewName")}</span>
            </TagChip>
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
