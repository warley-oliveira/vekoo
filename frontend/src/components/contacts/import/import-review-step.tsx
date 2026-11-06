import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useTranslation } from "react-i18next"
import { CircleCheck, CircleX } from "lucide-react"

import {
  Callout,
  DataTable,
  SearchInput,
  SegmentedControl,
  StatusBadge,
} from "@/components/shared"
import type {
  ImportMapping,
  ImportPreviewRow,
  ImportRowIssue,
  ImportSummary,
} from "@/lib/contacts/import-parser"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"

type RowFilter = "all" | "ready" | "ignored"

const PREVIEW_PAGE_SIZE = 10
const PREVIEW_PAGE_OPTIONS = [10, 25, 50]
const ISSUE_KEYS: ImportRowIssue[] = ["missingPhone", "invalidPhone", "missingName", "duplicate"]

export type ImportReviewStepProps = {
  preview: ImportPreviewRow[]
  summary: ImportSummary
  mapping: ImportMapping
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-medium tabular-nums">{value}</dd>
    </div>
  )
}

/** Conferir antes de enviar: o que entra, o que fica de fora e por quê, linha a linha. */
export function ImportReviewStep({ preview, summary, mapping }: ImportReviewStepProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [rowFilter, setRowFilter] = useState<RowFilter>("all")
  const [query, setQuery] = useState("")
  const number = (value: number) => formatNumber(value, language)

  const rows = useMemo(
    () =>
      rowFilter === "all"
        ? preview
        : preview.filter((row) => (rowFilter === "ready" ? !row.issue : Boolean(row.issue))),
    [preview, rowFilter]
  )

  const columns = useMemo<ColumnDef<ImportPreviewRow, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("contacts.import.review.name"),
        enableSorting: false,
        meta: { mobile: "primary", className: "min-w-40" },
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            {row.original.issue ? (
              <CircleX aria-hidden className="size-4 shrink-0 text-status-danger" />
            ) : (
              <CircleCheck aria-hidden className="size-4 shrink-0 text-status-success" />
            )}
            <span className="truncate">
              {row.original.name || (
                <span className="text-muted-foreground">
                  {t("contacts.import.review.emptyCell")}
                </span>
              )}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "phone",
        header: t("contacts.import.review.phone"),
        enableSorting: false,
        meta: { mobile: "secondary" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.finalPhone
              ? formatPhone(row.original.finalPhone)
              : row.original.phone || t("contacts.import.review.emptyCell")}
          </span>
        ),
      },
      ...(mapping.assignee
        ? [
            {
              accessorKey: "assignee",
              header: t("contacts.import.review.assignee"),
              enableSorting: false,
            } satisfies ColumnDef<ImportPreviewRow, any>,
          ]
        : []),
      ...(mapping.department
        ? [
            {
              accessorKey: "department",
              header: t("contacts.import.review.department"),
              enableSorting: false,
            } satisfies ColumnDef<ImportPreviewRow, any>,
          ]
        : []),
      {
        id: "result",
        accessorFn: (row) => row.issue ?? "",
        header: t("contacts.import.review.result"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.issue ? (
            <StatusBadge tone="danger">
              {t(`contacts.import.review.issue.${row.original.issue}`)}
            </StatusBadge>
          ) : (
            <StatusBadge tone="success">{t("contacts.import.review.ok")}</StatusBadge>
          ),
      },
      {
        accessorKey: "line",
        header: t("contacts.import.review.line"),
        enableSorting: false,
        meta: { align: "right", className: "w-16" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{number(row.original.line)}</span>
        ),
      },
      {
        accessorKey: "original",
        header: t("contacts.import.review.original"),
        enableSorting: false,
        meta: { mobile: "hidden", className: "max-w-64" },
        cell: ({ row }) => (
          <span title={row.original.original} className="block truncate text-xs text-muted-foreground">
            {row.original.original}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, mapping.assignee, mapping.department, t]
  )

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2">
        <Stat label={t("contacts.import.review.total")} value={number(summary.total)} />
        <Stat label={t("contacts.import.review.ready")} value={number(summary.ready)} />
        <Stat label={t("contacts.import.review.ignored")} value={number(summary.ignored)} />
      </dl>

      {summary.ignored > 0 ? (
        <Callout tone="warning" title={t("contacts.import.review.ignoredTitle")}>
          <ul className="flex flex-col gap-0.5">
            {ISSUE_KEYS.filter((key) => summary[key] > 0).map((key) => (
              <li key={key}>
                {t(`contacts.import.review.ignoredReason.${key}`, {
                  count: summary[key],
                  formatted: number(summary[key]),
                })}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {mapping.assignee || mapping.department ? (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("contacts.import.review.attributionNote")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          shortcut={false}
          debounce={0}
          value={query}
          onChange={setQuery}
          placeholder={t("contacts.import.review.search")}
          className="sm:w-56"
        />
        <SegmentedControl
          aria-label={t("contacts.import.review.filter")}
          value={rowFilter}
          onChange={setRowFilter}
          options={[
            { value: "all" as const, label: t("contacts.import.review.filterAll") },
            { value: "ready" as const, label: t("contacts.import.review.filterReady") },
            { value: "ignored" as const, label: t("contacts.import.review.filterIgnored") },
          ]}
        />
      </div>

      <DataTable
        aria-label={t("contacts.import.review.tableLabel")}
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.line)}
        globalFilter={query}
        pageSize={PREVIEW_PAGE_SIZE}
        perPageOptions={PREVIEW_PAGE_OPTIONS}
        density="compact"
        maxHeight="24rem"
        empty={{ title: t("contacts.import.review.noneInFilter") }}
      />
    </div>
  )
}
