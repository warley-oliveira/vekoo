import { useEffect, useMemo, useState } from "react"
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useSearchParams } from "@/lib/router"
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, X } from "lucide-react"

import { type ReferenceListParams, type ReferenceSummary, useReferenceList } from "@/admin/api"
import { ReferenceStatusBadge } from "@/admin/components/status-badge"
import { ReferenceThumbnail } from "@/admin/components/reference-thumbnail"
import { TaxonomySelect } from "@/admin/components/taxonomy-select"
import { EmptyState } from "@/components/empty-state"
import { ErrorState } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatNumber, formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import { NICHES, OBJECTIVES, REFERENCE_FORMATS, type Niche, type Objective, type ReferenceFormat, type ReferenceStatus } from "@/lib/taxonomy"
import { cn } from "@/lib/utils"

// O banco de referências da curadoria: filtro, busca, ordem e página moram na
// URL (recarregar ou mandar o link mantém a vista), e quem decide é o servidor.

const STATUS_TABS = ["all", "in_review", "published", "draft", "archived"] as const
type StatusTab = (typeof STATUS_TABS)[number]
type Sort = NonNullable<ReferenceListParams["sort"]>
const PER_PAGE_OPTIONS = ["25", "50", "100"] as const

const column = createColumnHelper<ReferenceSummary>()

function useListParams() {
  const [search, setSearch] = useSearchParams()
  const tab = (STATUS_TABS as readonly string[]).includes(search.get("status") ?? "") ? (search.get("status") as StatusTab) : "all"
  const params: ReferenceListParams = {
    status: tab === "all" ? undefined : [tab as ReferenceStatus],
    niche: (search.get("niche") as Niche) || undefined,
    format: (search.get("format") as ReferenceFormat) || undefined,
    objective: (search.get("objective") as Objective) || undefined,
    q: search.get("q") || undefined,
    sort: (search.get("sort") as Sort) || "updatedAt",
    dir: search.get("dir") === "asc" ? "asc" : "desc",
    page: Math.max(Number(search.get("page")) || 1, 1),
    per: Number(search.get("per")) || 25,
  }
  const update = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(search)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key)
      else next.set(key, value)
    }
    if (resetPage) next.delete("page")
    setSearch(next, { replace: true })
  }
  return { tab, params, update }
}

export function ReferenceListPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const { tab, params, update } = useListParams()
  const { data, error, isLoading, mutate } = useReferenceList(params)

  // A busca espera a pessoa parar de digitar antes de ir à URL (e à API).
  const [query, setQuery] = useState(params.q ?? "")
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ((params.q ?? "") !== query.trim()) update({ q: query.trim() || null })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const filtered = Boolean(params.q || params.niche || params.format || params.objective || tab !== "all")
  const clearFilters = () => {
    setQuery("")
    update({ status: null, niche: null, format: null, objective: null, q: null })
  }

  const sortHeader = (key: Sort, label: string) => {
    const active = params.sort === key
    const Icon = !active ? ArrowUpDown : params.dir === "asc" ? ArrowUp : ArrowDown
    return (
      <button
        type="button"
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-1 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => update({ sort: key, dir: active && params.dir === "desc" ? "asc" : "desc" })}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      </button>
    )
  }

  const columns = useMemo(
    () => [
      column.display({
        id: "pattern",
        header: () => t("admin.list.columns.pattern"),
        cell: ({ row }) => {
          const card = row.original
          const title = [card.hookType && t(`admin.taxonomy.hookTypes.${card.hookType}`), card.format && t(`admin.taxonomy.formats.${card.format}`)]
            .filter(Boolean)
            .join(" · ")
          return (
            <div className="flex min-w-64 items-center gap-3">
              <ReferenceThumbnail id={card.id} available={card.hasThumbnail} alt="" className="w-10 shrink-0" />
              <div className="min-w-0">
                <Link
                  to={card.id}
                  className="font-medium hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  {title || t("admin.list.untitled")}
                </Link>
                {card.partialAnalysis && <span className="ml-1.5 text-xs text-muted-foreground">{t("admin.list.partial")}</span>}
                <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">{card.summary ?? card.channel ?? "—"}</p>
              </div>
            </div>
          )
        },
      }),
      column.display({
        id: "status",
        header: () => t("admin.list.columns.status"),
        cell: ({ row }) => <ReferenceStatusBadge status={row.original.status} analysis={row.original.analysisStatus} />,
      }),
      column.display({
        id: "niche",
        header: () => t("admin.list.columns.niche"),
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => (row.original.niche ? t(`taxonomy.niches.${row.original.niche}`) : "—"),
      }),
      column.display({
        id: "objective",
        header: () => t("admin.list.columns.objective"),
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (row.original.objective ? t(`admin.taxonomy.objectives.${row.original.objective}`) : "—"),
      }),
      column.display({
        id: "replicability",
        header: () => sortHeader("replicability", t("admin.list.columns.replicability")),
        meta: { className: "hidden md:table-cell text-right" },
        cell: ({ row }) => row.original.replicability ?? "—",
      }),
      column.display({
        id: "relativeEngagement",
        header: () => sortHeader("relativeEngagement", t("admin.list.columns.engagement")),
        meta: { className: "text-right" },
        cell: ({ row }) =>
          row.original.relativeEngagement === null
            ? "—"
            : t("admin.list.engagementValue", { value: formatNumber(row.original.relativeEngagement, language) }),
      }),
      column.display({
        id: "version",
        header: () => sortHeader("version", t("admin.list.columns.version")),
        meta: { className: "hidden lg:table-cell text-right" },
        cell: ({ row }) => row.original.version,
      }),
      column.display({
        id: "updatedAt",
        header: () => sortHeader("updatedAt", t("admin.list.columns.updated")),
        meta: { className: "hidden sm:table-cell text-right" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">{formatRelative(row.original.updatedAt, language)}</span>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, language, params.sort, params.dir]
  )

  const table = useReactTable({ data: data?.referenceCards ?? [], columns, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true })
  const meta = data?.meta
  const total = meta?.total ?? 0
  const from = total === 0 ? 0 : ((params.page ?? 1) - 1) * (params.per ?? 25) + 1
  const to = Math.min(from + (data?.referenceCards.length ?? 0) - 1, total)
  const counts = meta?.counts ?? {}
  const allCount = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("admin.list.title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t("admin.list.description")}</p>
        </div>
        <Button render={<Link to="new" />}>
          <Plus aria-hidden />
          {t("admin.list.new")}
        </Button>
      </div>

      <div className="space-y-3">
        <ToggleGroup
          value={[tab]}
          onValueChange={(value) => value[0] && update({ status: value[0] === "all" ? null : value[0] })}
          variant="outline"
          size="sm"
          className="flex-wrap"
          aria-label={t("admin.list.filters.status")}
        >
          {STATUS_TABS.map((value) => (
            <ToggleGroupItem key={value} value={value} className="gap-1.5">
              {value === "all" ? t("admin.list.filters.all") : t(`admin.status.${value}`)}
              <span className="font-mono text-[0.7rem] text-muted-foreground">
                {value === "all" ? allCount : (counts[value] ?? 0)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_repeat(3,11rem)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("admin.list.filters.search")}
              aria-label={t("admin.list.filters.search")}
              className="pl-8"
              type="search"
            />
          </div>
          <TaxonomySelect
            value={params.niche ?? null}
            options={NICHES}
            labelFor={(code) => t(`taxonomy.niches.${code}`)}
            onChange={(value) => update({ niche: value })}
            placeholder={t("admin.list.filters.niche")}
            noneLabel={t("admin.list.filters.anyNiche")}
            ariaLabel={t("admin.list.filters.niche")}
          />
          <TaxonomySelect
            value={params.format ?? null}
            options={REFERENCE_FORMATS}
            labelFor={(code) => t(`admin.taxonomy.formats.${code}`)}
            onChange={(value) => update({ format: value })}
            placeholder={t("admin.list.filters.format")}
            noneLabel={t("admin.list.filters.anyFormat")}
            ariaLabel={t("admin.list.filters.format")}
          />
          <TaxonomySelect
            value={params.objective ?? null}
            options={OBJECTIVES}
            labelFor={(code) => t(`admin.taxonomy.objectives.${code}`)}
            onChange={(value) => update({ objective: value })}
            placeholder={t("admin.list.filters.objective")}
            noneLabel={t("admin.list.filters.anyObjective")}
            ariaLabel={t("admin.list.filters.objective")}
          />
          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              <X aria-hidden />
              {t("admin.list.filters.clear")}
            </Button>
          )}
        </div>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={() => void mutate()} />
      ) : !isLoading && total === 0 ? (
        filtered ? (
          <EmptyState
            title={t("admin.list.emptyFiltered.title")}
            description={t("admin.list.emptyFiltered.description")}
            action={{ label: t("admin.list.filters.clear"), onClick: clearFilters }}
          />
        ) : (
          <EmptyState
            title={t("admin.list.empty.title")}
            description={t("admin.list.empty.description")}
            action={{ label: t("admin.list.new"), onClick: () => navigate("new") }}
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-14 z-10 bg-background">
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => {
                      const sortKey = header.column.id as Sort
                      const sortable = ["replicability", "relativeEngagement", "version", "updatedAt"].includes(sortKey)
                      return (
                        <TableHead
                          key={header.id}
                          className={(header.column.columnDef.meta as { className?: string } | undefined)?.className}
                          aria-sort={sortable && params.sort === sortKey ? (params.dir === "asc" ? "ascending" : "descending") : undefined}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading && !data
                  ? Array.from({ length: 8 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="aspect-[4/5] w-10 rounded-none" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-64" />
                          </div>
                        </div>
                      </TableCell>
                      {columns.slice(1).map((col) => (
                        <TableCell key={col.id} className={(col.meta as { className?: string } | undefined)?.className}>
                          <Skeleton className="ml-auto h-4 w-12" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                  : table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(row.original.id)}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={(cell.column.columnDef.meta as { className?: string } | undefined)?.className}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>{t("admin.list.pagination.range", { from, to, total })}</span>
              <div className="flex items-center gap-2">
                <Select value={String(params.per)} onValueChange={(value) => value && update({ per: value })}>
                  <SelectTrigger size="sm" aria-label={t("admin.list.pagination.perPage")} className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PER_PAGE_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(params.page ?? 1) <= 1}
                  onClick={() => update({ page: String((params.page ?? 1) - 1) }, false)}
                >
                  {t("admin.list.pagination.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={to >= total}
                  onClick={() => update({ page: String((params.page ?? 1) + 1) }, false)}
                >
                  {t("admin.list.pagination.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
