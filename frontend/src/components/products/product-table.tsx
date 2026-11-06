import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"

import {
  DataTable,
  RelativeTime,
  StatusBadge,
  TagChip,
  type DataTableProps,
} from "@/components/shared"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { displaySku } from "@/lib/products/item-form"
import type { PriceKeys } from "@/lib/products/pricing"
import type { ProductItem } from "@/lib/products/types"
import { ProductPrice } from "./product-price"
import { ProductThumb } from "./product-thumb"

const VISIBLE_TAGS = 2

type ProductTableProps = Omit<DataTableProps<ProductItem>, "columns" | "aria-label"> & {
  priceKeys: PriceKeys
}

/** A lista para comparar: preço, código e situação em colunas. No celular, o kit a empilha. */
export function ProductTable({ priceKeys, ...props }: ProductTableProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  const columns = useMemo<ColumnDef<ProductItem, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("products.list.columns.item"),
        enableSorting: !isMobile,
        meta: { mobile: "primary", className: "whitespace-normal min-w-72" },
        cell: ({ row }) => {
          const item = row.original
          return (
            <div className="flex min-w-0 items-center gap-3">
              <div className="size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-foreground/5">
                <ProductThumb
                  image={item.images[0]}
                  alt={item.title}
                  iconClassName="size-4"
                  className={item.active ? undefined : "opacity-50"}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{item.title}</p>
                <p className="line-clamp-1 text-xs font-normal text-muted-foreground">
                  {item.summary || t("products.list.noSummary")}
                </p>
              </div>
            </div>
          )
        },
      },
      {
        id: "price",
        header: t("products.list.columns.price"),
        enableSorting: false,
        meta: { align: "right", label: t("products.list.columns.price") },
        cell: ({ row }) => (
          <ProductPrice
            item={row.original}
            priceKeys={priceKeys}
            className="flex-col items-end max-md:flex-row max-md:items-baseline"
          />
        ),
      },
      {
        accessorKey: "externalId",
        header: t("products.list.columns.sku"),
        enableSorting: !isMobile,
        meta: { mobile: "meta" },
        cell: ({ row }) => {
          const sku = displaySku(row.original.externalId)
          return sku ? (
            <span className="text-muted-foreground tabular-nums">{sku}</span>
          ) : (
            <span className="text-muted-foreground">{t("products.list.noSku")}</span>
          )
        },
      },
      {
        accessorKey: "tags",
        header: t("products.list.columns.tags"),
        enableSorting: false,
        meta: { mobile: "hidden" },
        cell: ({ row }) => {
          const { tags } = row.original
          const extra = tags.length - VISIBLE_TAGS
          return tags.length > 0 ? (
            <div className="flex items-center gap-1">
              {tags.slice(0, VISIBLE_TAGS).map((tag) => (
                <TagChip key={tag} className="h-5 max-w-28">
                  {tag}
                </TagChip>
              ))}
              {extra > 0 ? (
                <TagChip className="h-5">{t("products.list.moreTags", { count: extra })}</TagChip>
              ) : null}
            </div>
          ) : null
        },
      },
      {
        accessorKey: "active",
        header: t("products.list.columns.status"),
        enableSorting: false,
        meta: { mobile: "secondary" },
        cell: ({ row }) =>
          row.original.active ? (
            <StatusBadge tone="success">{t("products.status.active")}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">{t("products.status.inactive")}</StatusBadge>
          ),
      },
      {
        accessorKey: "updatedAt",
        header: t("products.list.columns.updatedAt"),
        enableSorting: !isMobile,
        sortDescFirst: true,
        meta: { mobile: "hidden" },
        cell: ({ row }) => (
          <RelativeTime value={row.original.updatedAt} className="text-muted-foreground" />
        ),
      },
    ],
    [isMobile, priceKeys, t]
  )

  return <DataTable aria-label={t("products.list.tableLabel")} columns={columns} {...props} />
}
