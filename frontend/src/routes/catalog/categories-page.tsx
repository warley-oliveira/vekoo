import { useCallback, useMemo, useState } from "react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CornerDownRight,
  FolderTree,
  PackageSearch,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { CategoryFormDialog } from "@/components/products/category-form-dialog"
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
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCategoryMutations, useProductCategories } from "@/hooks/products/use-products"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import {
  categoryPathLabel,
  childrenByParent,
  subtreeOf,
} from "@/lib/products/category-tree"
import type { ProductCategory } from "@/lib/products/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

/** Acima disto a árvore ganha busca própria. */
const SEARCH_THRESHOLD = 8
/** `Products::Category::MAX_DEPTH`: seis níveis, contando a raiz. */
const MAX_DEPTH = 6
const INDENT_PX = 20

type DialogState = { category?: ProductCategory; parentId?: string | null }

type TreeContext = {
  categories: readonly ProductCategory[]
  groups: Map<string | null, ProductCategory[]>
  collapsed: ReadonlySet<string>
  toggle: (id: string) => void
  edit: (category: ProductCategory) => void
  addChild: (category: ProductCategory) => void
  remove: (category: ProductCategory) => void
  reorder: (siblings: ProductCategory[]) => void
  viewItems: (category: ProductCategory) => void
}

export default function CategoriesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { categories, error, isLoading, mutate } = useProductCategories()
  const { deleteCategory, reorderCategories } = useCategoryMutations()

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const list = useMemo(() => categories ?? [], [categories])
  const groups = useMemo(() => childrenByParent(list), [list])

  const matches = useMemo(
    () =>
      query
        ? list.filter((category) => matchesSearch(categoryPathLabel(list, category), query))
        : [],
    [list, query]
  )

  const toggle = useCallback(
    (id: string) =>
      setCollapsed((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    []
  )

  const remove = useCallback(
    async (category: ProductCategory) => {
      const inside = subtreeOf(list, category).length - 1
      const confirmed = await confirm({
        title: t("products.categories.deleteTitle", { name: category.name }),
        description:
          inside > 0
            ? t("products.categories.deleteHintSubtree", { count: inside })
            : t("products.categories.deleteHint"),
        confirmLabel: t("products.categories.delete"),
        destructive: true,
        onConfirm: () => deleteCategory(category.id),
      })
      if (confirmed) toast.success(t("products.categories.deleted", { name: category.name }))
    },
    [confirm, deleteCategory, list, t]
  )

  const reorder = useCallback(
    async (siblings: ProductCategory[]) => {
      try {
        await reorderCategories(siblings)
      } catch {
        toast.error(t("products.categories.reorderFailed"))
      }
    },
    [reorderCategories, t]
  )

  const context = useMemo<TreeContext>(
    () => ({
      categories: list,
      groups,
      collapsed,
      toggle,
      edit: (category) => setDialog({ category }),
      addChild: (category) => setDialog({ parentId: category.id }),
      remove: (category) => void remove(category),
      reorder: (siblings) => void reorder(siblings),
      viewItems: (category) =>
        navigate(`/catalog?category=${encodeURIComponent(category.path)}`),
    }),
    [collapsed, groups, list, navigate, remove, reorder, toggle]
  )

  const create = () => setDialog({})

  const header = (
    <PageHeader
      title={t("navigation.routes.catalogCategories")}
      backTo="/catalog"
      parentTitle={t("navigation.catalog")}
      description={t("products.categories.description")}
      actions={
        <Button onClick={create}>
          <Plus />
          {t("products.categories.create")}
        </Button>
      }
      mobileActions={
        <Button
          size="icon"
          className="size-10"
          aria-label={t("products.categories.create")}
          onClick={create}
        >
          <Plus className="size-5" />
        </Button>
      }
      mobilePlacement="inline"
    />
  )

  let content
  if (error && !categories) {
    content = <ErrorState error={error} onRetry={() => void mutate()} />
  } else if (isLoading && !categories) {
    content = (
      <SectionCard contentClassName="px-4">
        <ListSkeleton rows={8} twoLines={false} />
      </SectionCard>
    )
  } else if (list.length === 0) {
    content = (
      <EmptyState
        icon={<FolderTree className="size-5" />}
        title={t("products.categories.empty.title")}
        description={t("products.categories.empty.description")}
        action={{ label: t("products.categories.create"), onClick: create }}
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
            placeholder={t("products.categories.search")}
            className="md:w-80"
          />
        ) : null}
        <SectionCard contentClassName="px-1.5 md:px-2">
          {query ? (
            matches.length > 0 ? (
              <ul className="flex flex-col">
                {matches.map((category) => (
                  <CategoryRow key={category.id} category={category} context={context} flat />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("products.categories.noMatch")}
              </p>
            )
          ) : (
            <CategoryBranch parentId={null} context={context} />
          )}
        </SectionCard>
      </div>
    )
  }

  return (
    <PageBody>
      {header}
      {content}
      <CategoryFormDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        categories={list}
        category={dialog?.category}
        defaultParentId={dialog?.parentId ?? null}
      />
    </PageBody>
  )
}

/** Um nível da árvore. Arrastar reordena entre irmãs, e cada irmã leva o próprio ramo junto. */
function CategoryBranch({
  parentId,
  context,
}: {
  parentId: string | null
  context: TreeContext
}) {
  const preset = useMotionPreset()
  const siblings = context.groups.get(parentId) ?? []

  return (
    <SortableArea items={siblings} nameOf={(category) => category.name} onReorder={context.reorder}>
      <motion.ul {...(parentId ? preset.fade : {})} className="flex flex-col">
        {siblings.map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            context={context}
            index={index}
            siblings={siblings}
          />
        ))}
      </motion.ul>
    </SortableArea>
  )
}

function CategoryRow({
  category,
  context,
  flat = false,
  index = 0,
  siblings = [],
}: {
  category: ProductCategory
  context: TreeContext
  /** Na busca: a linha mostra o caminho inteiro, sem recuo e sem arrastar. */
  flat?: boolean
  index?: number
  siblings?: readonly ProductCategory[]
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { setNodeRef, style, handleProps, isDragging } = useSortableEntry(category.id)

  const children = context.groups.get(category.id) ?? []
  const hasChildren = children.length > 0
  const expanded = !context.collapsed.has(category.id)
  const canMoveUp = index > 0
  const canMoveDown = index < siblings.length - 1

  function moveTo(target: number) {
    const ordered = [...siblings]
    ordered.splice(index, 1)
    ordered.splice(target, 0, category)
    context.reorder(ordered)
  }

  const row = (
    <div
      style={flat ? undefined : { paddingInlineStart: category.depth * INDENT_PX }}
      className={cn(
        "group/row flex min-h-11 items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-muted/50",
        isDragging && "bg-background shadow-md ring-1 ring-foreground/10"
      )}
    >
      {flat ? (
        <span aria-hidden className="w-2 shrink-0" />
      ) : (
        <>
          <DragHandle
            {...handleProps}
            label={t("products.categories.reorder", { name: category.name })}
          />
          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-expanded={expanded}
              aria-label={t(expanded ? "products.categories.collapse" : "products.categories.expand", {
                name: category.name,
              })}
              // O ghost pinta o botão aberto, como o de um menu. Aqui aberto é o estado comum,
              // e a árvore ficaria cheia de botões parecendo pressionados.
              className="text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:bg-muted"
              onClick={() => context.toggle(category.id)}
            >
              <ChevronRight
                className={cn(
                  "transition-transform duration-150",
                  expanded && "rotate-90"
                )}
              />
            </Button>
          ) : (
            <span aria-hidden className="size-7 shrink-0 pointer-coarse:size-10" />
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => context.edit(category)}
        className="min-w-0 flex-1 rounded-md py-1 text-left text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="block truncate">
          {flat ? categoryPathLabel(context.categories, category) : category.name}
        </span>
      </button>

      <span className="shrink-0 px-2 text-xs text-muted-foreground tabular-nums">
        {category.itemsCount > 0
          ? t("products.categories.itemsCount", {
              count: category.itemsCount,
              formatted: formatNumber(category.itemsCount, language),
            })
          : null}
      </span>

      <ActionsMenu
        label={t("products.categories.actionsOf", { name: category.name })}
        actions={[
          {
            label: t("products.categories.editAction"),
            icon: <Pencil />,
            onSelect: () => context.edit(category),
          },
          {
            label: t("products.categories.addChild"),
            icon: <CornerDownRight />,
            hidden: category.depth >= MAX_DEPTH - 1,
            onSelect: () => context.addChild(category),
          },
          {
            label: t("products.categories.viewItems"),
            icon: <PackageSearch />,
            onSelect: () => context.viewItems(category),
          },
          {
            label: t("products.categories.moveUp"),
            icon: <ArrowUp />,
            hidden: flat,
            disabled: !canMoveUp,
            separatorBefore: true,
            onSelect: () => moveTo(index - 1),
          },
          {
            label: t("products.categories.moveDown"),
            icon: <ArrowDown />,
            hidden: flat,
            disabled: !canMoveDown,
            onSelect: () => moveTo(index + 1),
          },
          {
            label: t("products.categories.delete"),
            icon: <Trash2 />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => context.remove(category),
          },
        ]}
      />
    </div>
  )

  return (
    <li ref={flat ? undefined : setNodeRef} style={flat ? undefined : style} className="min-w-0">
      {row}
      {!flat && hasChildren && expanded ? (
        <CategoryBranch parentId={category.id} context={context} />
      ) : null}
    </li>
  )
}
