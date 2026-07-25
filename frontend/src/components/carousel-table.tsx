import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, MoreHorizontal, Star } from "lucide-react"

import { CAROUSEL_DRAG_TYPE } from "@/components/app-sidebar"
import { CarouselActionsMenu } from "@/components/carousel-actions"
import { CardArt } from "@/components/editor/card-art"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import type { Carousel } from "@/lib/mock-data"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { SortOption } from "@/lib/view-prefs"

// A visão em lista de Meus carrosséis: mesmas informações da grade, em
// colunas varríveis. A ordenação é a mesma da toolbar — clicar num cabeçalho
// ordenável apenas alterna a opção ativa, para grade e lista nunca divergirem.

type CarouselTableProps = {
  carousels: Carousel[]
  sort: SortOption
  onSortChange: (sort: SortOption) => void
}

const columnHelper = createColumnHelper<Carousel>()

export function CarouselTable({
  carousels,
  sort,
  onSortChange,
}: CarouselTableProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { dispatch } = useStore()
  const navigate = useNavigate()

  const columns = [
    columnHelper.display({
      id: "cover",
      header: "",
      cell: ({ row }) => (
        <div className="w-9">
          <CardArt
            card={row.original.cards[0]}
            theme={row.original.theme}
            format={row.original.format}
          />
        </div>
      ),
    }),
    columnHelper.accessor("title", {
      header: t("carousels.table.title"),
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.original.title}</span>
          {row.original.favorite && (
            <Star className="size-3.5 shrink-0 fill-amber-400 stroke-amber-400" />
          )}
        </div>
      ),
    }),
    columnHelper.accessor((c) => c.cards.length, {
      id: "cards",
      header: t("carousels.table.cards"),
      cell: (info) => (
        <span className="text-muted-foreground tabular-nums">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("format", {
      header: t("carousels.table.format"),
      cell: (info) => (
        <span className="text-muted-foreground">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("editedAt", {
      header: t("carousels.table.edited"),
      cell: (info) => (
        <span className="text-muted-foreground">
          {formatRelative(info.getValue(), language)}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              row.original.favorite
                ? t("carousels.favoriteRemove")
                : t("carousels.favoriteAdd")
            }
            aria-pressed={row.original.favorite}
            onClick={() =>
              dispatch({
                type: "carousel/toggle-favorite",
                id: row.original.id,
              })
            }
          >
            <Star
              className={cn(
                row.original.favorite && "fill-amber-400 stroke-amber-400"
              )}
            />
          </Button>
          <CarouselActionsMenu
            carousel={row.original}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("carousels.actionsAria", {
                  title: row.original.title,
                })}
              >
                <MoreHorizontal />
              </Button>
            }
          />
        </div>
      ),
    }),
  ]

  const table = useReactTable({
    data: carousels,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.column.id === "title" ? (
                    <SortHeader
                      label={t("carousels.table.title")}
                      ascOption="name-asc"
                      descOption="name-desc"
                      sort={sort}
                      onSortChange={onSortChange}
                    />
                  ) : header.column.id === "editedAt" ? (
                    <SortHeader
                      label={t("carousels.table.edited")}
                      ascOption="oldest"
                      descOption="recent"
                      sort={sort}
                      onSortChange={onSortChange}
                    />
                  ) : (
                    flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.original.id}
              className="group/row cursor-pointer"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(CAROUSEL_DRAG_TYPE, row.original.id)
                e.dataTransfer.effectAllowed = "move"
              }}
              onClick={() =>
                navigate(`/carousels/${row.original.id}/edit`)
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  onClick={
                    cell.column.id === "actions"
                      ? (e) => e.stopPropagation()
                      : undefined
                  }
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SortHeader({
  label,
  ascOption,
  descOption,
  sort,
  onSortChange,
}: {
  label: string
  ascOption: SortOption
  descOption: SortOption
  sort: SortOption
  onSortChange: (sort: SortOption) => void
}) {
  const { t } = useTranslation()
  const isAsc = sort === ascOption
  const isDesc = sort === descOption
  const active = isAsc || isDesc

  return (
    <button
      type="button"
      onClick={() => onSortChange(isDesc ? ascOption : descOption)}
      className={cn(
        "flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "text-foreground"
      )}
      aria-label={t("carousels.table.sortByAria", {
        column: label.toLowerCase(),
      })}
    >
      {label}
      {isDesc && <ArrowDown className="size-3.5" />}
      {isAsc && <ArrowUp className="size-3.5" />}
    </button>
  )
}
