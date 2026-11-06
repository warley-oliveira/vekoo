import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { BarChart3, Pencil, Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CustomFieldPanel } from "@/components/content/custom-field-panel"
import { CustomFieldValuesPanel } from "@/components/content/custom-field-values-panel"
import { FieldTypeIcon } from "@/components/content/field-type-icon"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FacetedFilter,
  FilterBar,
  ListSkeleton,
  PageBody,
  PageHeader,
  SectionCard,
  SortMenu,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  countFieldValues,
  useCustomFieldMutations,
  useCustomFields,
} from "@/hooks/content/use-custom-fields"
import { usePanelParam } from "@/hooks/content/use-panel-param"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { VALUE_TYPES, type CustomField } from "@/lib/content/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

type SortOrder = "name-asc" | "name-desc" | "recent" | "type"

const MAX_OPTIONS_IN_ROW = 5

export default function CustomFieldsPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const { customFields, error, isLoading, isValidating, reload } = useCustomFields()
  const { deleteCustomField } = useCustomFieldMutations()

  /* ---------- painéis ---------- */

  const panel = usePanelParam("field", ["values"] as const)
  const list = useMemo(() => customFields ?? [], [customFields])

  const selected = list.find((field) => field.id === panel.selectedId) ?? null
  const formOpen = panel.creating || Boolean(selected)
  const formKey = useOpenCount(formOpen)
  const shownField = useRetained(selected)
  const shownForm = useRetained(panel.creating ? ("new" as const) : selected ? ("edit" as const) : null)

  const valuesId = panel.extra("values")
  const valuesField = list.find((field) => field.id === valuesId) ?? null
  const valuesKey = useOpenCount(Boolean(valuesField))
  const shownValuesField = useRetained(valuesField)

  // Link para um campo que não existe mais: a tela segue, sem painel nenhum.
  useEffect(() => {
    if (!customFields) return
    if ((panel.selectedId && !selected) || (valuesId && !valuesField)) panel.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFields, panel.selectedId, selected, valuesField, valuesId])

  /* ---------- filtros ---------- */

  const [query, setQuery] = useState("")
  const [types, setTypes] = useState<string[]>([])
  const [sort, setSort] = useState<SortOrder>("name-asc")

  const clearFilters = () => {
    setQuery("")
    setTypes([])
  }

  const typeOptions = VALUE_TYPES.map((type) => ({
    value: type,
    label: t(`content.customFields.types.${type}`),
    count: list.filter((field) => field.valueType === type).length,
  }))

  const visible = useMemo(() => {
    const matching = list.filter((field) => {
      if (types.length > 0 && !types.includes(field.valueType)) return false
      return !query || matchesSearch(`${field.name} ${field.key} ${field.description ?? ""}`, query)
    })
    return [...matching].sort((a, b) => {
      switch (sort) {
        case "recent":
          return b.updatedAt - a.updatedAt
        case "name-desc":
          return b.name.localeCompare(a.name, language)
        case "type":
          return (
            VALUE_TYPES.indexOf(a.valueType) - VALUE_TYPES.indexOf(b.valueType) ||
            a.name.localeCompare(b.name, language)
          )
        default:
          return a.name.localeCompare(b.name, language)
      }
    })
  }, [language, list, query, sort, types])

  /* ---------- ações ---------- */

  async function remove(field: CustomField) {
    // Quantas conversas guardam valor: é o que a pessoa quer saber antes de apagar.
    let filled: number | null = null
    try {
      filled = await countFieldValues(field.id)
    } catch {
      /* sem a contagem, a pergunta segue com o texto geral */
    }

    const confirmed = await confirm({
      title: t("content.customFields.delete.title", { name: field.name }),
      description:
        filled && filled > 0
          ? t("content.customFields.delete.descriptionFilled", { count: filled })
          : t("content.customFields.delete.description"),
      confirmLabel: t("content.customFields.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteCustomField(field.id),
    })
    if (confirmed) {
      panel.close()
      toast.success(t("content.customFields.delete.done", { name: field.name }))
    }
  }

  const formatDefault = (field: CustomField) => {
    if (!field.defaultValue) return null
    return field.valueType === "checkbox"
      ? t(`content.customFields.checkbox.${field.defaultValue === "true" ? "true" : "false"}`)
      : field.defaultValue
  }

  function detailsOf(field: CustomField) {
    const defaultValue = formatDefault(field)
    const hidden = field.optionValues.length - MAX_OPTIONS_IN_ROW
    const options =
      field.valueType === "list" && field.optionValues.length > 0
        ? [
            ...field.optionValues.slice(0, MAX_OPTIONS_IN_ROW),
            ...(hidden > 0 ? [t("content.customFields.moreOptions", { count: hidden })] : []),
          ].join(", ")
        : null

    return [
      t(`content.customFields.types.${field.valueType}`),
      options,
      defaultValue ? t("content.customFields.defaultLabel", { value: defaultValue }) : null,
      field.description,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  return (
    <PageBody>
      <PageHeader
        description={t("content.customFields.description")}
        actions={
          <Button onClick={panel.openNew} className="pointer-coarse:h-10">
            <Plus />
            {t("content.customFields.create.action")}
          </Button>
        }
        mobileActions={
          <Button
            onClick={panel.openNew}
            aria-label={t("content.customFields.create.action")}
            className="pointer-coarse:h-10"
          >
            <Plus />
            {t("content.customFields.create.mobileAction")}
          </Button>
        }
        mobilePlacement="inline"
      />

      {error && !customFields ? (
        <ErrorState error={error} onRetry={reload} />
      ) : isLoading && !customFields ? (
        <SectionCard contentClassName="px-4">
          <ListSkeleton rows={6} />
        </SectionCard>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<SlidersHorizontal className="size-5" />}
          title={t("content.customFields.empty.title")}
          description={t("content.customFields.empty.description")}
          action={{ label: t("content.customFields.create.action"), onClick: panel.openNew }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <FilterBar
            search={{
              value: query,
              onChange: setQuery,
              debounce: 0,
              placeholder: t("content.customFields.search"),
            }}
            activeCount={types.length}
            onClear={clearFilters}
            resultLabel={t("content.customFields.count", { count: visible.length })}
            filters={
              <FacetedFilter
                title={t("content.customFields.filters.type")}
                options={typeOptions}
                value={types}
                onChange={setTypes}
              />
            }
            sort={
              <SortMenu
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name-asc", label: t("content.customFields.sort.nameAsc") },
                  { value: "name-desc", label: t("content.customFields.sort.nameDesc") },
                  { value: "recent", label: t("content.customFields.sort.recent") },
                  { value: "type", label: t("content.customFields.sort.type") },
                ]}
              />
            }
            actions={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("content.common.refresh")}
                onClick={reload}
                className="text-muted-foreground"
              >
                <RefreshCw className={cn(isValidating && "animate-spin")} />
              </Button>
            }
          />

          {visible.length === 0 ? (
            <EmptyState
              title={t("content.customFields.noResults.title")}
              description={t("content.customFields.noResults.description")}
              action={{ label: t("content.common.clearFilters"), onClick: clearFilters }}
            />
          ) : (
            <SectionCard contentClassName="px-1.5 md:px-2">
              <ul className="flex flex-col divide-y">
                <AnimatePresence initial={false}>
                  {visible.map((field) => (
                    <motion.li key={field.id} {...preset.listItem} className="min-w-0">
                      <div className="flex items-start gap-1 rounded-lg transition-colors hover:bg-muted/50">
                        <button
                          type="button"
                          onClick={() => panel.open(field.id)}
                          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <FieldTypeIcon type={field.valueType} className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="min-w-0 truncate text-sm font-medium">{field.name}</span>
                              <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                {field.key}
                              </code>
                              {field.autoNormalize ? (
                                <StatusBadge tone="neutral" dot={false}>
                                  {t("content.customFields.autoNormalizeBadge")}
                                </StatusBadge>
                              ) : null}
                            </span>
                            <span className="line-clamp-2 text-xs text-pretty text-muted-foreground">
                              {detailsOf(field)}
                            </span>
                          </span>
                        </button>
                        <ActionsMenu
                          className="mt-1.5 mr-0.5 shrink-0"
                          label={t("content.customFields.actionsOf", { name: field.name })}
                          actions={[
                            {
                              label: t("content.customFields.actions.edit"),
                              icon: <Pencil />,
                              onSelect: () => panel.open(field.id),
                            },
                            {
                              label: t("content.customFields.actions.values"),
                              icon: <BarChart3 />,
                              onSelect: () => panel.openExtra("values", field.id),
                            },
                            {
                              label: t("content.customFields.delete.action"),
                              icon: <Trash2 />,
                              destructive: true,
                              separatorBefore: true,
                              onSelect: () => void remove(field),
                            },
                          ]}
                        />
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </SectionCard>
          )}
        </div>
      )}

      {shownForm ? (
        <CustomFieldPanel
          key={`form-${formKey}`}
          field={shownForm === "edit" ? shownField : null}
          allFields={list}
          open={formOpen}
          onOpenChange={(open) => {
            if (!open) panel.close()
          }}
          onDelete={(field) => void remove(field)}
          onOpenValues={(field) => panel.openExtra("values", field.id)}
        />
      ) : null}

      {shownValuesField ? (
        <CustomFieldValuesPanel
          key={`values-${valuesKey}`}
          field={valuesField ?? shownValuesField}
          allFields={list}
          open={Boolean(valuesField)}
          onOpenChange={(open) => {
            if (!open) panel.close()
          }}
        />
      ) : null}
    </PageBody>
  )
}
