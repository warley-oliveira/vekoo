import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FileSpreadsheet, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  ListSkeleton,
  RelativeTime,
  TablePagination,
  useConfirm,
} from "@/components/shared"
import { useImportMutations, useProductImports } from "@/hooks/products/use-product-imports"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { ProductImport } from "@/lib/products/types"
import { ImportStatusBadge } from "./import-status"

type ImportHistoryProps = {
  onOpen: (entry: ProductImport) => void
  onNew: () => void
}

/** As importações da organização, das mais novas para as mais antigas. */
export function ImportHistory({ onOpen, onNew }: ImportHistoryProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { deleteImport } = useImportMutations()

  const [page, setPage] = useState(1)
  const { imports, meta, error, isLoading, mutate } = useProductImports(page)

  async function remove(entry: ProductImport) {
    const confirmed = await confirm({
      title: t("products.import.history.deleteTitle"),
      description: t("products.import.history.deleteHint"),
      confirmLabel: t("products.import.history.delete"),
      destructive: true,
      onConfirm: () => deleteImport(entry.id),
    })
    if (confirmed) toast.success(t("products.import.history.deleted"))
  }

  if (error && !imports) return <ErrorState error={error} onRetry={() => void mutate()} />
  if (isLoading && !imports) return <ListSkeleton rows={5} />

  if (imports?.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="size-5" />}
        title={t("products.import.history.emptyTitle")}
        description={t("products.import.history.emptyHint")}
        action={{ label: t("products.list.import"), onClick: onNew }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {(imports ?? []).map((entry) => (
          <li key={entry.id} className="flex items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => onOpen(entry)}
              className="min-w-0 flex-1 rounded-md px-1 py-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {entry.filename ?? t("products.import.history.noName")}
                </span>
                <ImportStatusBadge entry={entry} />
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                <RelativeTime value={entry.createdAt} />
                {entry.status === "completed"
                  ? ` · ${t("products.import.history.counts", {
                      created: formatNumber(entry.createdCount, language),
                      updated: formatNumber(entry.updatedCount, language),
                      errors: formatNumber(entry.errorCount, language),
                    })}`
                  : null}
              </span>
            </button>
            <ActionsMenu
              label={t("products.import.history.actionsOf", { name: entry.filename ?? "" })}
              actions={[
                {
                  label: t("products.import.history.delete"),
                  icon: <Trash2 />,
                  destructive: true,
                  // A API recusa enquanto processa: a opção nem aparece. Na fila pode: o job que
                  // chegar depois não acha nada, e é a única saída se ele nunca chegar.
                  hidden: entry.status === "processing",
                  onSelect: () => void remove(entry),
                },
              ]}
            />
          </li>
        ))}
      </ul>
      {meta && meta.totalPages > 1 ? (
        <TablePagination
          page={meta.page}
          totalPages={meta.totalPages}
          total={meta.total}
          perPage={meta.perPage}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  )
}
