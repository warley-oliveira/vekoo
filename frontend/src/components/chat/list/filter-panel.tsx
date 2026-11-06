import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Bookmark, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  DatePicker,
  NumberInput,
  SearchableSelect,
  SearchInput,
  SegmentedControl,
  SelectInput,
  SidePanel,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useChatViews } from "@/hooks/chat/use-chat-refs"
import { useFilterFields, type FilterField } from "@/hooks/chat/use-filter-fields"
import { apiDelete } from "@/lib/api"
import { isCompleteCondition, needsNoValue, toQueryConditions } from "@/lib/chat/filters"
import { useListFilters } from "@/lib/chat/stores"
import type { ChatView, FilterCondition, QueryOperator } from "@/lib/chat/types"
import { toDateInputValue } from "@/lib/date-format"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { SaveViewDialog } from "./save-view-dialog"

/** Campo digitado não vira uma requisição por tecla. */
const APPLY_DEBOUNCE_MS = 400

const EMPTY_CONDITION: FilterCondition = {
  attributeKey: "",
  filterOperator: "",
  values: [""],
  queryOperator: "and",
}

function ValueInput({
  field,
  condition,
  onChange,
}: {
  field: FilterField | undefined
  condition: FilterCondition
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const value = condition.values[0] ?? ""

  if (needsNoValue(condition.filterOperator)) return null

  if (!field) {
    return <Input disabled placeholder={t("chat.filters.valuePlaceholder")} />
  }

  if (field.input === "select") {
    return (field.options?.length ?? 0) > 10 ? (
      <SearchableSelect
        aria-label={t("chat.filters.value")}
        value={value || null}
        options={field.options}
        placeholder={t("chat.filters.valuePlaceholder")}
        onChange={(next) => onChange(next ?? "")}
      />
    ) : (
      <SelectInput
        aria-label={t("chat.filters.value")}
        className="w-full"
        value={value || null}
        options={field.options ?? []}
        placeholder={t("chat.filters.valuePlaceholder")}
        onChange={(next) => onChange(next ?? "")}
      />
    )
  }

  if (field.input === "date") {
    return (
      <DatePicker
        aria-label={t("chat.filters.value")}
        label={t("chat.filters.value")}
        className="w-full"
        value={value ? new Date(`${value}T00:00:00`) : null}
        onChange={(next) => onChange(next ? toDateInputValue(next) : "")}
      />
    )
  }

  if (field.input === "number") {
    return (
      <NumberInput
        aria-label={t("chat.filters.value")}
        className="w-full"
        value={value === "" ? null : Number(value)}
        onChange={(next) => onChange(next === null ? "" : String(next))}
      />
    )
  }

  return (
    <Input
      aria-label={t("chat.filters.value")}
      value={value}
      placeholder={t("chat.filters.valuePlaceholder")}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** Uma condição: campo, operador e valor. O operador muda o valor: "preenchido" não pede nenhum. */
const ConditionRow = memo(function ConditionRow({
  index,
  condition,
  fields,
  byKey,
  onChange,
  onRemove,
}: {
  index: number
  condition: FilterCondition
  fields: FilterField[]
  byKey: Map<string, FilterField>
  onChange: (index: number, next: FilterCondition) => void
  onRemove: (index: number) => void
}) {
  const { t } = useTranslation()
  const field = byKey.get(condition.attributeKey)

  const fieldOptions = useMemo(
    () =>
      fields.map((item) => ({
        value: item.key,
        label: item.label,
        description: item.group === "contact" ? t("chat.filters.contactField") : undefined,
      })),
    [fields, t]
  )

  const operatorOptions = useMemo(
    () =>
      (field?.operators ?? []).map((operator) => ({
        value: operator,
        label: t(`chat.filters.operators.${operator}`),
      })),
    [field, t]
  )

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2.5">
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <SearchableSelect
            aria-label={t("chat.filters.field")}
            value={condition.attributeKey || null}
            options={fieldOptions}
            placeholder={t("chat.filters.fieldPlaceholder")}
            onChange={(key) => {
              const next = key ? byKey.get(key) : undefined
              onChange(index, {
                ...condition,
                attributeKey: key ?? "",
                filterOperator: next?.operators[0] ?? "",
                values: [""],
                valueType: next?.valueType,
              })
            }}
          />
          <SelectInput
            aria-label={t("chat.filters.operator")}
            className="w-full"
            disabled={!field}
            value={condition.filterOperator || null}
            options={operatorOptions}
            placeholder={t("chat.filters.operatorPlaceholder")}
            onChange={(operator) =>
              onChange(index, {
                ...condition,
                filterOperator: operator ?? "",
                values: needsNoValue(operator ?? "") ? [""] : condition.values,
              })
            }
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground pointer-coarse:size-10"
          aria-label={t("chat.filters.removeCondition")}
          onClick={() => onRemove(index)}
        >
          <Trash2 />
        </Button>
      </div>

      {condition.attributeKey && !needsNoValue(condition.filterOperator) ? (
        <ValueInput
          field={field}
          condition={condition}
          onChange={(value) => onChange(index, { ...condition, values: [value] })}
        />
      ) : null}
    </div>
  )
})

const ViewsSection = memo(function ViewsSection({
  canSave,
  onSave,
  onRename,
  onApply,
}: {
  canSave: boolean
  onSave: (personal: boolean) => void
  onRename: (view: ChatView) => void
  onApply: (view: ChatView) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { views, isLoading, mutate } = useChatViews()
  const activeViewId = useListFilters((state) => state.activeViewId)
  const [search, setSearch] = useState("")

  const visible = useMemo(
    () => views.filter((view) => !search || matchesSearch(view.name, search)),
    [search, views]
  )
  const personal = visible.filter((view) => view.personal)
  const shared = visible.filter((view) => !view.personal)

  const remove = async (view: ChatView) => {
    const confirmed = await confirm({
      title: t("chat.views.deleteTitle", { name: view.name }),
      description: view.personal ? undefined : t("chat.views.deleteSharedHint"),
      confirmLabel: t("chat.views.delete"),
      destructive: true,
      onConfirm: async () => {
        await apiDelete(`/chat-views/${view.id}`)
        await mutate()
      },
    })
    if (confirmed) toast.success(t("chat.views.deleted"))
  }

  const renderGroup = (title: string, items: ChatView[], isPersonal: boolean) => (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!canSave}
          title={canSave ? undefined : t("chat.views.needsFilter")}
          onClick={() => onSave(isPersonal)}
        >
          <Plus />
          {t("chat.views.save")}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">{t("chat.views.empty")}</p>
      ) : (
        items.map((view) => (
          <div
            key={view.id}
            className={cn(
              "group/view flex items-center gap-1 rounded-lg pr-1 hover:bg-muted/70",
              view.id === activeViewId && "bg-accent"
            )}
          >
            <button
              type="button"
              aria-current={view.id === activeViewId ? "true" : undefined}
              onClick={() => onApply(view)}
              className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Bookmark aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{view.name}</span>
            </button>
            <ActionsMenu
              label={t("chat.views.actionsOf", { name: view.name })}
              actions={[
                { label: t("chat.views.rename"), onSelect: () => onRename(view) },
                {
                  label: t("chat.views.delete"),
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => void remove(view),
                },
              ]}
            />
          </div>
        ))
      )}
    </div>
  )

  return (
    <section aria-label={t("chat.views.title")} className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("chat.views.title")}</h2>
      {views.length > 5 ? (
        <SearchInput
          value={search}
          onChange={setSearch}
          debounce={0}
          shortcut={false}
          placeholder={t("chat.views.search")}
        />
      ) : null}
      {isLoading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <>
          {renderGroup(t("chat.views.personal"), personal, true)}
          {renderGroup(t("chat.views.shared"), shared, false)}
        </>
      )}
    </section>
  )
})

/**
 * O construtor de filtros e as visões salvas, num painel lateral. Vale à medida que se monta: cada
 * condição completa já filtra a lista atrás do painel, e a incompleta espera. "Lembrar" guarda neste
 * navegador, para o filtro continuar lá da próxima vez.
 */
export default function FilterPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { fields, byKey } = useFilterFields()

  const applied = useListFilters((state) => state.conditions)
  const setConditions = useListFilters((state) => state.setConditions)
  const remember = useListFilters((state) => state.remember)
  const setRemember = useListFilters((state) => state.setRemember)

  const [draft, setDraft] = useState(applied)
  const lastWritten = useRef(applied)

  // De fora (X num chip, limpar, visão aplicada): o painel acompanha.
  useEffect(() => {
    if (applied !== lastWritten.current) {
      lastWritten.current = applied
      setDraft(applied)
    }
  }, [applied])

  const write = useCallback(
    (next: FilterCondition[]) => {
      lastWritten.current = next
      setConditions(next)
    },
    [setConditions]
  )
  const debouncedWrite = useDebouncedCallback(write, APPLY_DEBOUNCE_MS)

  const change = useCallback(
    (next: FilterCondition[]) => {
      setDraft(next)
      debouncedWrite(next)
    },
    [debouncedWrite]
  )

  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  })

  const onRowChange = useCallback(
    (index: number, condition: FilterCondition) => {
      change(draftRef.current.map((item, position) => (position === index ? condition : item)))
    },
    [change]
  )
  const onRowRemove = useCallback(
    (index: number) => {
      change(draftRef.current.filter((_, position) => position !== index))
    },
    [change]
  )

  const setOperator = (index: number, queryOperator: QueryOperator) => {
    change(draft.map((item, position) => (position === index ? { ...item, queryOperator } : item)))
  }

  const [saving, setSaving] = useState<
    { mode: "create"; personal: boolean } | { mode: "rename"; view: ChatView } | null
  >(null)

  const completeConditions = useMemo(() => toQueryConditions(draft), [draft])

  return (
    <>
      <SidePanel
        open={open}
        onOpenChange={onOpenChange}
        size="lg"
        title={t("chat.filters.title")}
        description={t("chat.filters.description")}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Switch checked={remember} onCheckedChange={setRemember} />
              {t("chat.filters.remember")}
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={draft.length === 0}
                onClick={() => {
                  debouncedWrite.cancel()
                  setDraft([])
                  write([])
                }}
              >
                {t("chat.filters.clear")}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("chat.filters.done")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <section aria-label={t("chat.filters.conditions")} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{t("chat.filters.conditions")}</h2>

            {draft.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t("chat.filters.none")}</p>
            ) : (
              draft.map((condition, index) => (
                <div key={index} className="flex flex-col gap-2">
                  {index > 0 ? (
                    <SegmentedControl<QueryOperator>
                      aria-label={t("chat.filters.queryOperator")}
                      className="self-center"
                      value={condition.queryOperator}
                      onChange={(value) => setOperator(index, value)}
                      options={[
                        { value: "and", label: t("chat.filters.and") },
                        { value: "or", label: t("chat.filters.or") },
                      ]}
                    />
                  ) : null}
                  <ConditionRow
                    index={index}
                    condition={condition}
                    fields={fields}
                    byKey={byKey}
                    onChange={onRowChange}
                    onRemove={onRowRemove}
                  />
                </div>
              ))
            )}

            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setDraft((list) => [...list, { ...EMPTY_CONDITION }])}
            >
              <Plus />
              {t("chat.filters.add")}
            </Button>
          </section>

          <ViewsSection
            canSave={completeConditions.length > 0 && draft.every(isCompleteCondition)}
            onSave={(personal) => setSaving({ mode: "create", personal })}
            onRename={(view) => setSaving({ mode: "rename", view })}
            onApply={(view) => {
              debouncedWrite.cancel()
              lastWritten.current = view.payload
              setDraft(view.payload)
              setConditions(view.payload, view.id)
            }}
          />
        </div>
      </SidePanel>

      {saving ? (
        <SaveViewDialog
          state={saving}
          conditions={completeConditions}
          onClose={() => setSaving(null)}
        />
      ) : null}
    </>
  )
}
