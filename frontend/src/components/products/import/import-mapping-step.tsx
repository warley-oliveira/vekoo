import { useId, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRight, Info, TriangleAlert } from "lucide-react"

import { SearchableSelect, type SelectOption } from "@/components/shared"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import {
  SKU_TARGET,
  TITLE_TARGET,
  assignColumn,
  isTargetMapped,
  mappedTarget,
  sampleValue,
  uniqueHeaders,
  type ImportMapping,
} from "@/lib/products/import-mapping"
import type { ProductImportPreview, ProductImportTarget } from "@/lib/products/types"
import { cn } from "@/lib/utils"

/** A origem mostrava as cinco primeiras: o bastante para conferir, sem virar a planilha. */
const PREVIEW_ROWS = 5

const DELIMITER_NAMES: Record<string, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
}

type ImportMappingStepProps = {
  preview: ProductImportPreview
  mapping: ImportMapping
  onMappingChange: (mapping: ImportMapping) => void
}

/**
 * Segunda fase: a que campo do catálogo cada coluna corresponde. Tudo o que aparece aqui é
 * o que o servidor leu do arquivo. As opções da importação ficam no painel, porque são
 * parte do formulário de enviar.
 */
export function ImportMappingStep({ preview, mapping, onMappingChange }: ImportMappingStepProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const headers = useMemo(() => uniqueHeaders(preview), [preview])

  const options = useMemo<SelectOption[]>(
    () =>
      preview.targets.map((target) => ({
        value: target.value,
        label: target.label,
        description:
          target.kind === "custom" ? t("products.import.mapping.customField") : undefined,
      })),
    [preview.targets, t]
  )

  const titleMapped = isTargetMapped(mapping, TITLE_TARGET)
  const skuMapped = isTargetMapped(mapping, SKU_TARGET)
  const mappedCount = headers.filter((header) => mappedTarget(mapping, header)).length
  const delimiter = preview.delimiter ? DELIMITER_NAMES[preview.delimiter] : undefined

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-pretty text-muted-foreground">
        {t("products.import.mapping.summary", {
          name: preview.filename,
          count: headers.length,
          formatted: formatNumber(headers.length, language),
        })}{" "}
        {delimiter ? t(`products.import.mapping.delimiter.${delimiter}`) : null}
      </p>

      <ul className="flex flex-col divide-y">
        {headers.map((header) => (
          <MappingRow
            key={header}
            header={header}
            sample={sampleValue(preview, header)}
            options={options}
            value={mappedTarget(mapping, header)}
            onChange={(target) => onMappingChange(assignColumn(mapping, header, target))}
          />
        ))}
      </ul>

      {!titleMapped ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-status-warning-soft px-3 py-2.5 text-sm text-status-warning"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("products.import.mapping.titleRequired")}
        </p>
      ) : null}
      {titleMapped && !skuMapped ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-pretty text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("products.import.mapping.noSku")}
        </p>
      ) : null}

      <section aria-labelledby="import-preview-title" className="flex flex-col gap-2">
        <h3 id="import-preview-title" className="text-sm font-medium">
          {t("products.import.mapping.previewTitle", {
            mapped: formatNumber(mappedCount, language),
            count: headers.length,
            formatted: formatNumber(headers.length, language),
          })}
        </h3>
        <SampleTable
          preview={preview}
          headers={headers}
          mapping={mapping}
          targets={preview.targets}
        />
      </section>
    </div>
  )
}

function MappingRow({
  header,
  sample,
  options,
  value,
  onChange,
}: {
  header: string
  sample: string | null
  options: SelectOption[]
  value: string
  onChange: (target: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()

  return (
    <li className="grid gap-x-3 gap-y-1.5 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={id} className="block truncate text-sm font-medium">
          {header || t("products.import.mapping.unnamedColumn")}
        </label>
        <p className="truncate text-xs text-muted-foreground">
          {sample ?? t("products.import.mapping.noSample")}
        </p>
      </div>
      <ArrowRight aria-hidden className="hidden size-4 text-muted-foreground/60 sm:block" />
      <SearchableSelect
        id={id}
        options={options}
        value={value || null}
        onChange={(next) => onChange(next ?? "")}
        clearable
        placeholder={t("products.import.mapping.ignore")}
        emptyLabel={t("products.import.mapping.noTarget")}
        className={cn(!value && "text-muted-foreground")}
      />
    </li>
  )
}

/** Uma planilha é tabela por natureza: rola sozinha para o lado, sem esticar o painel. */
function SampleTable({
  preview,
  headers,
  mapping,
  targets,
}: {
  preview: ProductImportPreview
  headers: readonly string[]
  mapping: ImportMapping
  targets: readonly ProductImportTarget[]
}) {
  const { t } = useTranslation()
  const rows = preview.sampleRows.slice(0, PREVIEW_ROWS)

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("products.import.mapping.noRows")}</p>
  }

  return (
    <div className="max-w-full overflow-x-auto rounded-lg border" tabIndex={0}>
      <table className="w-full min-w-max text-left text-xs">
        <thead className="bg-muted/50">
          <tr>
            {headers.map((header) => {
              const target = mappedTarget(mapping, header)
              const label = targets.find((candidate) => candidate.value === target)?.label
              return (
                <th
                  key={header}
                  scope="col"
                  className={cn("px-2.5 py-1.5 align-top font-medium", !target && "opacity-50")}
                >
                  <span className="block max-w-48 truncate">{header}</span>
                  <span className="block max-w-48 truncate font-normal text-muted-foreground">
                    {label ?? t("products.import.mapping.ignored")}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={index}>
              {headers.map((header) => (
                <td
                  key={header}
                  className={cn(
                    "max-w-48 truncate px-2.5 py-1.5 text-muted-foreground",
                    !mappedTarget(mapping, header) && "opacity-50"
                  )}
                >
                  {Object.hasOwn(row, header) ? row[header] : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
