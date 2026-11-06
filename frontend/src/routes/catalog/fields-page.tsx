import { useMemo, useState, type ComponentType } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Hash,
  Link2,
  List,
  Pencil,
  Plus,
  SlidersHorizontal,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react"
import { toast } from "sonner"

import { FieldFormPanel } from "@/components/products/field-form-panel"
import { DragHandle, SortableArea } from "@/components/shared/sortable"
import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageBody,
  PageHeader,
  SearchInput,
  SectionCard,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useFieldMutations, useProductFields } from "@/hooks/products/use-products"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import { useMotionPreset } from "@/lib/motion"
import { nextPosition } from "@/lib/products/reorder"
import type { FieldValueType, ProductField } from "@/lib/products/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

const SEARCH_THRESHOLD = 8

const TYPE_ICONS: Record<FieldValueType, ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  list: List,
  checkbox: ToggleLeft,
  date: CalendarDays,
  url: Link2,
}

export default function FieldsPage() {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const confirm = useConfirm()
  const { fields, error, isLoading, mutate } = useProductFields()
  const { deleteField, reorderFields } = useFieldMutations()

  const [panel, setPanel] = useState<{ field: ProductField | null } | null>(null)
  const [query, setQuery] = useState("")

  const list = useMemo(() => fields ?? [], [fields])
  const visible = useMemo(
    () => (query ? list.filter((field) => matchesSearch(field.name, query)) : list),
    [list, query]
  )

  async function reorder(ordered: ProductField[]) {
    try {
      await reorderFields(ordered)
    } catch {
      toast.error(t("products.fields.reorderFailed"))
    }
  }

  async function remove(field: ProductField) {
    const confirmed = await confirm({
      title: t("products.fields.deleteTitle", { name: field.name }),
      description: t("products.fields.deleteHint"),
      confirmLabel: t("products.fields.delete"),
      destructive: true,
      onConfirm: () => deleteField(field.id),
    })
    if (confirmed) toast.success(t("products.fields.deleted", { name: field.name }))
  }

  const create = () => setPanel({ field: null })

  let content
  if (error && !fields) {
    content = <ErrorState error={error} onRetry={() => void mutate()} />
  } else if (isLoading && !fields) {
    content = (
      <SectionCard contentClassName="px-4">
        <ListSkeleton rows={6} />
      </SectionCard>
    )
  } else if (list.length === 0) {
    content = (
      <EmptyState
        icon={<SlidersHorizontal className="size-5" />}
        title={t("products.fields.empty.title")}
        description={t("products.fields.empty.description")}
        action={{ label: t("products.fields.create"), onClick: create }}
      />
    )
  } else {
    content = (
      <div className="flex flex-col gap-3">
        {list.length > SEARCH_THRESHOLD ? (
          <SearchInput
            value={query}
            onChange={setQuery}
            debounce={0}
            placeholder={t("products.fields.search")}
            className="md:w-80"
          />
        ) : null}
        <SectionCard contentClassName="px-1.5 md:px-2">
          {visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("products.fields.noMatch")}
            </p>
          ) : (
            <SortableArea
              items={visible}
              disabled={Boolean(query)}
              nameOf={(field) => field.name}
              onReorder={(ordered) => void reorder(ordered)}
            >
              <ul className="flex flex-col divide-y">
                <AnimatePresence initial={false}>
                  {visible.map((field, index) => (
                    <motion.li key={field.id} {...preset.listItem} className="min-w-0">
                      <FieldRow
                        field={field}
                        index={index}
                        fields={visible}
                        searching={Boolean(query)}
                        onEdit={() => setPanel({ field })}
                        onDelete={() => void remove(field)}
                        onReorder={(ordered) => void reorder(ordered)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </SortableArea>
          )}
        </SectionCard>
      </div>
    )
  }

  return (
    <PageBody>
      <PageHeader
        title={t("navigation.routes.catalogFields")}
        backTo="/catalog"
        parentTitle={t("navigation.catalog")}
        description={t("products.fields.pageDescription")}
        actions={
          <Button onClick={create}>
            <Plus />
            {t("products.fields.create")}
          </Button>
        }
        mobileActions={
          <Button
            size="icon"
            className="size-10"
            aria-label={t("products.fields.create")}
            onClick={create}
          >
            <Plus className="size-5" />
          </Button>
        }
        mobilePlacement="inline"
      />
      {content}
      <FieldFormPanel
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
        field={panel?.field}
        nextPosition={nextPosition(list)}
      />
    </PageBody>
  )
}

function FieldRow({
  field,
  index,
  fields,
  searching,
  onEdit,
  onDelete,
  onReorder,
}: {
  field: ProductField
  index: number
  fields: readonly ProductField[]
  searching: boolean
  onEdit: () => void
  onDelete: () => void
  onReorder: (ordered: ProductField[]) => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps, isDragging } = useSortableEntry(field.id)
  const Icon = TYPE_ICONS[field.valueType]

  function moveTo(target: number) {
    const ordered = [...fields]
    ordered.splice(index, 1)
    ordered.splice(target, 0, field)
    onReorder(ordered)
  }

  const details = [
    t(`products.fields.types.${field.valueType}`),
    field.valueType === "list"
      ? t("products.fields.optionsCount", { count: field.optionValues.length })
      : null,
    field.searchable ? t("products.fields.inSearch") : null,
    field.description,
  ].filter(Boolean)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex min-h-14 items-center gap-1 rounded-lg py-1.5 pr-1 transition-colors hover:bg-muted/50",
        isDragging && "bg-background shadow-md ring-1 ring-foreground/10"
      )}
    >
      {searching ? (
        <span aria-hidden className="w-2 shrink-0" />
      ) : (
        <DragHandle {...handleProps} label={t("products.fields.reorder", { name: field.name })} />
      )}

      <span className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </span>

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 rounded-md py-0.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{field.name}</span>
          {field.required ? (
            <StatusBadge tone="neutral" dot={false}>
              {t("products.fields.requiredBadge")}
            </StatusBadge>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {details.join(" · ")}
        </span>
      </button>

      <ActionsMenu
        label={t("products.fields.actionsOf", { name: field.name })}
        actions={[
          {
            label: t("products.fields.editAction"),
            icon: <Pencil />,
            onSelect: onEdit,
          },
          {
            label: t("products.fields.moveUp"),
            icon: <ArrowUp />,
            hidden: searching,
            disabled: index === 0,
            separatorBefore: true,
            onSelect: () => moveTo(index - 1),
          },
          {
            label: t("products.fields.moveDown"),
            icon: <ArrowDown />,
            hidden: searching,
            disabled: index === fields.length - 1,
            onSelect: () => moveTo(index + 1),
          },
          {
            label: t("products.fields.delete"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            onSelect: onDelete,
          },
        ]}
      />
    </div>
  )
}
