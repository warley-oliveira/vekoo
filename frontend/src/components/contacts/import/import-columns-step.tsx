import { useTranslation } from "react-i18next"
import { CircleCheck, CircleX } from "lucide-react"

import { SelectInput } from "@/components/shared"
import { Switch } from "@/components/ui/switch"
import type { ImportMapping, ImportPreviewRow, ImportSummary } from "@/lib/contacts/import-parser"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"

const SAMPLE_ROWS = 3

export type ImportColumnsStepProps = {
  fileName: string
  headers: string[]
  mapping: ImportMapping
  onMappingChange: (next: ImportMapping) => void
  includeCountryCode: boolean
  onIncludeCountryCodeChange: (next: boolean) => void
  preview: ImportPreviewRow[]
  summary: ImportSummary
}

function ColumnSelect({
  label,
  hint,
  headers,
  value,
  onChange,
  clearLabel,
}: {
  label: string
  hint?: string
  headers: string[]
  value: string | null
  onChange: (next: string | null) => void
  clearLabel?: string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <SelectInput
        aria-label={label}
        options={headers.map((header) => ({ value: header, label: header }))}
        value={value}
        onChange={onChange}
        placeholder={t("contacts.import.columns.pick")}
        clearLabel={clearLabel}
      />
      {hint ? <span className="text-xs text-pretty text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

/** Dizer qual coluna é o quê. Já vem preenchido pelo nome das colunas, quando dá para adivinhar. */
export function ImportColumnsStep({
  fileName,
  headers,
  mapping,
  onMappingChange,
  includeCountryCode,
  onIncludeCountryCodeChange,
  preview,
  summary,
}: ImportColumnsStepProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const mapped = Boolean(mapping.name && mapping.phone)
  const sameColumn = mapped && mapping.name === mapping.phone
  const sample = mapped && !sameColumn ? preview.slice(0, SAMPLE_ROWS) : []

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-pretty text-muted-foreground">
        {t("contacts.import.columns.found", {
          name: fileName,
          count: summary.total,
          formatted: formatNumber(summary.total, language),
        })}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          label={t("contacts.import.columns.name")}
          headers={headers}
          value={mapping.name}
          onChange={(name) => onMappingChange({ ...mapping, name })}
        />
        <ColumnSelect
          label={t("contacts.import.columns.phone")}
          headers={headers}
          value={mapping.phone}
          onChange={(phone) => onMappingChange({ ...mapping, phone })}
        />
      </div>

      {sameColumn ? (
        <p role="alert" className="text-sm text-destructive">
          {t("contacts.import.columns.sameColumn")}
        </p>
      ) : mapped && summary.ready === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {t("contacts.import.columns.noneReady")}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-xs font-medium text-muted-foreground">
          {t("contacts.import.columns.optional")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColumnSelect
            label={t("contacts.import.columns.assignee")}
            headers={headers}
            value={mapping.assignee}
            onChange={(assignee) => onMappingChange({ ...mapping, assignee })}
            clearLabel={t("contacts.import.columns.none")}
          />
          <ColumnSelect
            label={t("contacts.import.columns.department")}
            headers={headers}
            value={mapping.department}
            onChange={(department) => onMappingChange({ ...mapping, department })}
            clearLabel={t("contacts.import.columns.none")}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 border-t pt-4 pointer-coarse:min-h-10">
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-medium">
            {t("contacts.import.columns.countryCode")}
          </span>
          <span className="block text-xs text-pretty text-muted-foreground">
            {t("contacts.import.columns.countryCodeHint")}
          </span>
        </span>
        <Switch checked={includeCountryCode} onCheckedChange={onIncludeCountryCodeChange} />
      </label>

      {sample.length > 0 ? (
        <section aria-labelledby="import-sample-title" className="flex flex-col gap-2 border-t pt-4">
          <h3 id="import-sample-title" className="text-sm font-medium">
            {t("contacts.import.columns.sample")}
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {sample.map((row) => (
              <li key={row.line} className="flex items-center gap-2.5 px-3 py-2">
                {row.issue ? (
                  <CircleX aria-hidden className="size-4 shrink-0 text-status-danger" />
                ) : (
                  <CircleCheck aria-hidden className="size-4 shrink-0 text-status-success" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {row.name || t("contacts.import.review.emptyCell")}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {row.finalPhone ? formatPhone(row.finalPhone) : row.phone || t("contacts.import.review.emptyCell")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
