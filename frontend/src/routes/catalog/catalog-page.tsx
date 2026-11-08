import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "@/lib/router"
import { LayoutGrid, List, Plus, Upload } from "lucide-react"
import { toast } from "sonner"

import { CatalogMenu } from "@/components/products/catalog-menu"
import { CategoryFilter } from "@/components/products/category-filter"
import { ImportBanner } from "@/components/products/import/import-banner"
import { ImportPanel, type ImportView } from "@/components/products/import/import-panel"
import { ProductBulkActions } from "@/components/products/product-bulk-actions"
import { ProductCard } from "@/components/products/product-card"
import {
  PRODUCT_GRID_CLASS,
  ProductGridSkeleton,
} from "@/components/products/product-grid-skeleton"
import { ProductTable } from "@/components/products/product-table"
import { ProductsEmpty, ProductsNoResults } from "@/components/products/products-empty"
import { SearchTestPanel } from "@/components/products/search-test-panel"
import {
  BulkActionsBar,
  ErrorState,
  FacetedFilter,
  FilterBar,
  InlineError,
  PageBody,
  PageHeader,
  SegmentedControl,
  SortMenu,
  TablePagination,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  CATALOG_PER_PAGE_OPTIONS,
  CATALOG_SORTS,
  itemsListPath,
  sortAsColumn,
  sortFromColumn,
  useCatalogFilters,
  type CatalogSort,
} from "@/hooks/products/use-catalog-filters"
import { useItemActions } from "@/hooks/products/use-item-actions"
import { useImportFeed } from "@/hooks/products/use-product-imports"
import {
  BULK_DESTROY_LIMIT,
  fetchAllItemIds,
  useProductCategories,
  useProductFields,
  useProductItems,
} from "@/hooks/products/use-products"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { findPriceKeys } from "@/lib/products/pricing"
import type { ProductItem } from "@/lib/products/types"
import { cn } from "@/lib/utils"

type CatalogView = "grid" | "list"

const VIEW_KEY = "vekoo.products.view"
/** As colunas que a API sabe ordenar: "Criados" não tem coluna na tabela. */
const SORTABLE_COLUMNS = new Set(["title", "externalId", "updatedAt"])

export default function CatalogPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const preset = useMotionPreset()

  const {
    filters,
    search,
    isFiltered,
    activeCount,
    setQuery,
    setCategories,
    setStatuses,
    setSort,
    setPage,
    setPerPage,
    clear,
  } = useCatalogFilters()
  const [view, setView] = useLocalStorage<CatalogView>(VIEW_KEY, "grid")

  const listPath = itemsListPath(filters)
  const { items, meta, error, isLoading, isValidating, mutate } = useProductItems(listPath)
  const { categories } = useProductCategories()
  const { fields } = useProductFields()
  const priceKeys = useMemo(() => findPriceKeys(fields ?? []), [fields])

  /* ---------- seleção ---------- */

  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const selectedIds = Object.keys(selection).filter((id) => selection[id])
  const selecting = selectedIds.length > 0

  // Mudou o que se está procurando: o que estava marcado pode nem estar mais à vista, e uma
  // ação em lote não pode alcançar o que a pessoa já não enxerga.
  const scope = JSON.stringify([filters.q, filters.categories, filters.statuses])
  const [lastScope, setLastScope] = useState(scope)
  if (scope !== lastScope) {
    setLastScope(scope)
    setSelection({})
  }

  function toggleSelected(item: Pick<ProductItem, "id">) {
    setSelection((current) => {
      const next = { ...current }
      if (next[item.id]) delete next[item.id]
      else next[item.id] = true
      return next
    })
  }

  async function selectAllResults() {
    try {
      const ids = await fetchAllItemIds(listPath)
      setSelection(Object.fromEntries(ids.map((id) => [id, true])))
    } catch {
      toast.error(t("products.bulk.failed"))
    }
  }

  const linkState = useMemo(() => ({ from: search ? `?${search}` : "" }), [search])
  const { actionsFor } = useItemActions({
    from: linkState.from,
    onSelect: toggleSelected,
  })

  /* ---------- paginação ---------- */

  // A última página pode esvaziar: excluiu tudo o que havia nela, ou o link era antigo.
  const emptiedPage = items?.length === 0 && filters.page > 1
  const lastPage = Math.max(1, meta?.totalPages ?? 1)
  useEffect(() => {
    if (emptiedPage) setPage(lastPage)
  }, [emptiedPage, lastPage, setPage])

  /* ---------- opções ---------- */

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("products.status.active") },
      { value: "inactive", label: t("products.status.inactive") },
    ],
    [t]
  )
  const sortOptions = useMemo(
    () => CATALOG_SORTS.map((value) => ({ value, label: t(`products.list.sort.${value}`) })),
    [t]
  )
  const columnSort = sortAsColumn(filters.sort)
  const total = meta?.total ?? 0
  const canSelectAll = total <= BULK_DESTROY_LIMIT

  /* ---------- importação e teste de busca ---------- */

  const [importView, setImportView] = useState<ImportView | null>(null)
  const [searchTestOpen, setSearchTestOpen] = useState(false)

  const openImport = () => setImportView({ name: "upload" })
  const openHistory = () => setImportView({ name: "history" })
  const openSearchTest = () => setSearchTestOpen(true)

  const feed = useImportFeed({
    onFinished: (importId, live) => {
      // Com o painel aberto, a pessoa já está vendo. Fechado, pode ser dela ou de um colega.
      if (importView) return

      const view = {
        label: t("products.import.toast.view"),
        onClick: () => setImportView({ name: "tracking", importId }),
      }
      if (live.kind === "completed") {
        const counts = t("products.import.toast.counts", {
          created: formatNumber(live.created, language),
          updated: formatNumber(live.updated, language),
          errors: formatNumber(live.errors, language),
        })
        const notify = live.errors > 0 ? toast.warning : toast.success
        notify(t("products.import.toast.completed"), { description: counts, action: view })
      } else if (live.kind === "error") {
        toast.error(t("products.import.toast.failed"), { action: view })
      }
    },
  })

  /* ---------- tela ---------- */

  const menu = (mobile: boolean) => (
    <CatalogMenu
      categoriesCount={categories?.length}
      fieldsCount={fields?.length}
      onImport={mobile ? openImport : undefined}
      onHistory={openHistory}
      onSearchTest={openSearchTest}
      onRefresh={() => void mutate()}
    />
  )

  const header = (
    <PageHeader
      actions={
        <>
          <Button variant="outline" onClick={openImport}>
            <Upload />
            {t("products.list.import")}
          </Button>
          <Button nativeButton={false} render={<Link to="/catalog/new" state={linkState} />}>
            <Plus />
            {t("products.list.create")}
          </Button>
          {menu(false)}
        </>
      }
      mobileActions={
        <>
          <Button
            nativeButton={false}
            size="icon"
            className="size-10"
            aria-label={t("products.list.create")}
            render={<Link to="/catalog/new" state={linkState} />}
          >
            <Plus className="size-5" />
          </Button>
          {menu(true)}
        </>
      }
      mobilePlacement="inline"
    />
  )

  const panels = (
    <>
      <ImportPanel view={importView} onViewChange={setImportView} feed={feed} />
      <SearchTestPanel
        open={searchTestOpen}
        onOpenChange={setSearchTestOpen}
        initialQuery={filters.q}
        priceKeys={priceKeys}
      />
    </>
  )

  if (error && !items) {
    return (
      <PageBody variant="wide">
        {header}
        <ErrorState error={error} onRetry={() => void mutate()} />
        {panels}
      </PageBody>
    )
  }

  // Catálogo vazio de verdade: filtros e ordem não têm sobre o que agir.
  const nothingYet = items?.length === 0 && !isFiltered && filters.page === 1
  const noResults = items?.length === 0 && isFiltered
  const count = formatNumber(total, language)

  return (
    <PageBody variant="wide">
      {header}

      <ImportBanner
        feed={feed}
        hidden={importView !== null}
        onOpen={(importId) => setImportView({ name: "tracking", importId })}
      />

      {nothingYet ? (
        <ProductsEmpty onImport={openImport} />
      ) : (
        <>
          <FilterBar
            search={{
              value: filters.q,
              onChange: setQuery,
              placeholder: t("products.list.search"),
              loading: isValidating && Boolean(filters.q),
              className: "md:w-80",
            }}
            activeCount={activeCount}
            onClear={clear}
            resultLabel={
              // Sem resultado, quem fala é o estado vazio. "0 item" não ajuda ninguém.
              total > 0 ? t("products.list.count", { count: total, formatted: count }) : undefined
            }
            filters={
              <>
                <CategoryFilter
                  categories={categories ?? []}
                  value={filters.categories}
                  onChange={setCategories}
                />
                {/* Na folha do celular vem antes: é curto, e a árvore empurraria para fora. */}
                <FacetedFilter
                  title={t("products.list.filters.status")}
                  options={statusOptions}
                  value={filters.statuses}
                  onChange={setStatuses}
                  className="max-md:order-first"
                />
              </>
            }
            sort={
              <SortMenu<CatalogSort>
                options={sortOptions}
                value={filters.sort}
                onChange={setSort}
              />
            }
            actions={
              <SegmentedControl<CatalogView>
                aria-label={t("products.list.view.label")}
                value={view}
                onChange={setView}
                options={[
                  {
                    value: "grid",
                    label: <LayoutGrid />,
                    "aria-label": t("products.list.view.grid"),
                  },
                  {
                    value: "list",
                    label: <List />,
                    "aria-label": t("products.list.view.list"),
                  },
                ]}
              />
            }
          />

          {error ? (
            <div className="rounded-lg border border-dashed">
              <InlineError onRetry={() => void mutate()} />
            </div>
          ) : null}

          {noResults ? (
            <ProductsNoResults
              hasQuery={Boolean(filters.q)}
              onClear={clear}
              onSearchTest={openSearchTest}
            />
          ) : view === "list" ? (
            <ProductTable
              data={items ?? []}
              meta={meta}
              priceKeys={priceKeys}
              isLoading={isLoading && !items}
              isFetching={isValidating}
              error={error}
              onRetry={() => void mutate()}
              isFiltered={isFiltered}
              onClearFilters={clear}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
              perPageOptions={CATALOG_PER_PAGE_OPTIONS}
              sorting={SORTABLE_COLUMNS.has(columnSort.id) ? [columnSort] : []}
              onSortingChange={(next) => {
                const sort = next[0] ? sortFromColumn(next[0].id, next[0].desc) : null
                setSort(sort ?? "recent")
              }}
              selectable
              rowSelection={selection}
              onRowSelectionChange={setSelection}
              selectAllMatching={canSelectAll}
              bulkActions={({ ids, allMatching, clear: clearSelection }) => (
                <ProductBulkActions
                  ids={ids}
                  allMatching={allMatching}
                  count={allMatching ? total : ids.length}
                  listPath={listPath}
                  onDone={clearSelection}
                />
              )}
              rowActions={actionsFor}
              onRowClick={(item) => navigate(`/catalog/${item.id}`, { state: linkState })}
            />
          ) : isLoading && !items ? (
            <ProductGridSkeleton />
          ) : (
            <>
              <ul
                className={cn(
                  PRODUCT_GRID_CLASS,
                  isValidating && "opacity-60 transition-opacity"
                )}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {(items ?? []).map((item) => (
                    <motion.li
                      key={item.id}
                      layout={!preset.reduced}
                      {...preset.listItem}
                      className="min-w-0"
                    >
                      <ProductCard
                        item={item}
                        priceKeys={priceKeys}
                        actions={actionsFor(item)}
                        selected={Boolean(selection[item.id])}
                        selecting={selecting}
                        onToggleSelect={toggleSelected}
                        linkState={linkState}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {meta ? (
                <TablePagination
                  page={meta.page}
                  totalPages={meta.totalPages}
                  total={meta.total}
                  perPage={meta.perPage}
                  perPageOptions={CATALOG_PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              ) : null}
              <BulkActionsBar
                count={selectedIds.length}
                onClear={() => setSelection({})}
                label={(amount) => t("products.bulk.selected", amount)}
                selectAll={
                  canSelectAll ? { total, onSelect: () => void selectAllResults() } : undefined
                }
              >
                <ProductBulkActions
                  ids={selectedIds}
                  count={selectedIds.length}
                  listPath={listPath}
                  onDone={() => setSelection({})}
                />
              </BulkActionsBar>
            </>
          )}
        </>
      )}

      {/* A barra de lote flutua: sem esta folga, cobriria a paginação no fim da página. */}
      {selecting ? <div aria-hidden className="h-12" /> : null}

      {panels}
    </PageBody>
  )
}
