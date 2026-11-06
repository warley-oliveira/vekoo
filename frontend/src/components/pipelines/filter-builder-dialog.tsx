import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  RadioField,
  ResponsiveDialog,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useLabels } from "@/hooks/pipelines/use-labels"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { useSavedFilterMutations } from "@/hooks/pipelines/use-saved-filters"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import {
  definitionToRows,
  emptyRow,
  fieldCatalog,
  isRowComplete,
  rowsToDefinition,
  type ConditionRow,
} from "@/lib/pipelines/filter-catalog"
import type { AdvancedFilter } from "@/lib/pipelines/filters"
import type {
  BoardDetail,
  FilterDefinition,
  SavedFilter,
  SavedFilterVisibility,
} from "@/lib/pipelines/types"
import { FilterConditionRow, type ConditionContext } from "./filter-condition-row"

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("pipelines.filters.builder.nameRequired")).max(120),
    visibility: z.enum(["private", "shared"]),
  })
}

type GroupKey = "all" | "any"

function ConditionGroup({
  title,
  connector,
  rows,
  context,
  onChange,
  onRemove,
  onAdd,
}: {
  title: string
  connector: string
  rows: ConditionRow[]
  context: ConditionContext
  onChange: (id: string, patch: Partial<ConditionRow>) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-1.5 text-sm font-medium">{title}</legend>
      {rows.map((row, index) => (
        <div key={row.id} className="flex flex-col gap-2">
          {index > 0 ? (
            <span className="text-xs font-medium text-muted-foreground">{connector}</span>
          ) : null}
          <FilterConditionRow
            row={row}
            context={context}
            onChange={onChange}
            onRemove={onRemove}
          />
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={onAdd}
        >
          <Plus />
          {t("pipelines.filters.builder.addCondition")}
        </Button>
      </div>
    </fieldset>
  )
}

type FilterBuilderBodyProps = {
  board: BoardDetail
  editing: SavedFilter | null
  initial: { definition: FilterDefinition; name: string | null } | null
  onApply: (filter: AdvancedFilter) => void
  onClose: () => void
}

function FilterBuilderBody({ board, editing, initial, onApply, onClose }: FilterBuilderBodyProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { labels } = useLabels()
  const { people } = usePeopleOptions()
  const { createFilter, updateFilter, previewCount } = useSavedFilterMutations(board.id)

  const catalog = useMemo(
    () => fieldCatalog(board, board.customFields),
    [board.boardType, board.customFields] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const context = useMemo<ConditionContext>(
    () => ({ catalog, stages: board.stages, labels, people }),
    [board.stages, catalog, labels, people]
  )

  const [rows, setRows] = useState(() => {
    if (editing) return definitionToRows(editing.definition)
    if (initial) return definitionToRows(initial.definition)
    return { all: [emptyRow()], any: [] as ConditionRow[] }
  })
  const [conditionsError, setConditionsError] = useState(false)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<{ name: string; visibility: SavedFilterVisibility }>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? initial?.name ?? "",
      visibility: editing?.visibility ?? "private",
    },
    mode: "onBlur",
  })

  const definition = useMemo(
    () => rowsToDefinition(rows.all, rows.any, catalog),
    [catalog, rows.all, rows.any]
  )
  const hasConditions = definition.all.length + definition.any.length > 0

  /* ---------- nome sugerido ---------- */

  // Só enquanto a pessoa não escreveu o próprio: a sugestão nunca apaga o que ela digitou.
  const lastSuggestion = useRef("")
  useEffect(() => {
    const kindOf = new Map(catalog.map((field) => [field.key, field.kind]))
    const first = [...rows.all, ...rows.any].find((row) => isRowComplete(row, kindOf.get(row.field)))
    if (!first) return
    const field = catalog.find((candidate) => candidate.key === first.field)
    const fieldLabel = field?.label ?? t(`pipelines.filters.fields.${field?.labelKey}`)
    const suggestion = `${fieldLabel} ${t(`pipelines.filters.operators.${first.operator}`)}`
    const current = form.getValues("name")
    if (current === "" || current === lastSuggestion.current) {
      lastSuggestion.current = suggestion
      form.setValue("name", suggestion)
    }
  }, [catalog, form, rows, t])

  /* ---------- prévia ---------- */

  const previewText = useDebouncedValue(hasConditions ? JSON.stringify(definition) : "", 400)
  const [preview, setPreview] = useState<{ text: string; count: number | null } | null>(null)
  useEffect(() => {
    if (!previewText) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    setPreview((current) => ({ text: previewText, count: current?.text === previewText ? current.count : null }))
    previewCount(JSON.parse(previewText) as FilterDefinition, controller.signal)
      .then(({ count }) => setPreview({ text: previewText, count }))
      .catch(() => {
        if (!controller.signal.aborted) setPreview(null)
      })
    return () => controller.abort()
  }, [previewCount, previewText])

  /* ---------- linhas ---------- */

  const editRow = useCallback((id: string, patch: Partial<ConditionRow>) => {
    setConditionsError(false)
    setRows((current) => {
      const update = (list: ConditionRow[]) =>
        list.map((row) => (row.id === id ? { ...row, ...patch } : row))
      return { all: update(current.all), any: update(current.any) }
    })
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((current) => ({
      all: current.all.filter((row) => row.id !== id),
      any: current.any.filter((row) => row.id !== id),
    }))
  }, [])

  const addRow = (group: GroupKey) =>
    setRows((current) => ({ ...current, [group]: [...current[group], emptyRow()] }))

  /* ---------- enviar ---------- */

  const submit = useFormSubmit(form, async (values) => {
    if (!hasConditions) {
      setConditionsError(true)
      return
    }
    const input = { name: values.name, visibility: values.visibility, definition }
    const saved = editing
      ? await updateFilter(editing.id, input)
      : await createFilter(input)
    toast.success(t("pipelines.savedFilters.saved"))
    onApply({ kind: "saved", id: saved.id })
    onClose()
  })

  function applyWithoutSaving() {
    if (!hasConditions) {
      setConditionsError(true)
      return
    }
    onApply({ kind: "inline", definition, name: form.getValues("name") || null })
    onClose()
  }

  const formatted =
    preview?.count !== null && preview?.count !== undefined
      ? t("pipelines.filters.builder.preview", {
          count: preview.count,
          formatted: formatNumber(preview.count, language),
        })
      : null

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-1">
        <ConditionGroup
          title={t("pipelines.filters.builder.allTitle")}
          connector={t("pipelines.filters.builder.and")}
          rows={rows.all}
          context={context}
          onChange={editRow}
          onRemove={removeRow}
          onAdd={() => addRow("all")}
        />
        <ConditionGroup
          title={t("pipelines.filters.builder.anyTitle")}
          connector={t("pipelines.filters.builder.or")}
          rows={rows.any}
          context={context}
          onChange={editRow}
          onRemove={removeRow}
          onAdd={() => addRow("any")}
        />

        {conditionsError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("pipelines.filters.builder.conditionsRequired")}
          </p>
        ) : null}

        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="name"
            label={t("pipelines.filters.builder.name")}
            maxLength={120}
          />
          <RadioField
            control={form.control}
            name="visibility"
            label={t("pipelines.filters.builder.visibility")}
            orientation="horizontal"
            options={[
              { value: "private", label: t("pipelines.filters.builder.private") },
              { value: "shared", label: t("pipelines.filters.builder.shared") },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center">
        <p
          aria-live="polite"
          className="flex min-h-5 flex-1 items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
        >
          {preview && preview.count === null ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : null}
          {formatted}
        </p>
        <Button
          type="button"
          variant="outline"
          className="pointer-coarse:h-10"
          onClick={applyWithoutSaving}
        >
          {t("pipelines.filters.builder.applyWithoutSaving")}
        </Button>
        <FormActions
          form={form}
          className="sm:w-auto"
          submitLabel={t(editing ? "pipelines.filters.builder.saveChanges" : "pipelines.filters.builder.save")}
          onCancel={onClose}
          cancelLabel={t("pipelines.filters.builder.cancel")}
        />
      </div>
    </form>
  )
}

type FilterBuilderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: BoardDetail
  editing: SavedFilter | null
  initial: { definition: FilterDefinition; name: string | null } | null
  onApply: (filter: AdvancedFilter) => void
}

/** O filtro com condições: "todas estas" e "qualquer destas". Dá para aplicar sem salvar. */
export default function FilterBuilderDialog({
  open,
  onOpenChange,
  board,
  editing,
  initial,
  onApply,
}: FilterBuilderDialogProps) {
  const { t } = useTranslation()

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={t(editing ? "pipelines.filters.builder.titleEdit" : "pipelines.filters.builder.titleCreate")}
      bodyClassName="flex min-h-0 flex-col p-0"
      className="md:max-w-3xl"
    >
      {open ? (
        <FilterBuilderBody
          board={board}
          editing={editing}
          initial={initial}
          onApply={onApply}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveDialog>
  )
}
