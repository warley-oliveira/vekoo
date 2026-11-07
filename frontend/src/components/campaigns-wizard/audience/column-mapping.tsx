import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, CircleCheck, CircleX } from "lucide-react"

import { Callout, SelectInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import type { RecipientImportState } from "@/hooks/campaigns-wizard/use-recipient-import"
import { ApiError } from "@/lib/api"
import type { ColumnChoice, MappedSummary } from "@/lib/campaigns-wizard/import-protocol"
import { asToken } from "@/lib/campaigns-wizard/variables"
import { formatNumber } from "@/lib/format-number"
import { formatPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"

export type ColumnMappingProps = {
  headers: string[]
  columns: ColumnChoice
  onColumnsChange: (next: ColumnChoice) => void
  includeCountryCode: boolean
  onIncludeCountryCodeChange: (next: boolean) => void
  mapped: MappedSummary | null
  disabled?: boolean
}

function ColumnSelect({
  label,
  headers,
  value,
  onChange,
  disabled,
}: {
  label: string
  headers: string[]
  value: string | null
  onChange: (next: string | null) => void
  disabled?: boolean
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
        placeholder={t("campaignsWizard.mapping.pick")}
        disabled={disabled}
      />
    </div>
  )
}

/**
 * Dizer qual coluna é o nome e qual é o telefone, já adivinhado pelo nome delas. O resto do arquivo vira
 * variável, e quem fica de fora aparece com o motivo: uma linha ruim não impede as outras de entrar. A
 * origem travava a importação inteira por causa de uma.
 */
export function ColumnMapping({
  headers,
  columns,
  onColumnsChange,
  includeCountryCode,
  onIncludeCountryCodeChange,
  mapped,
  disabled,
}: ColumnMappingProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const ready = Boolean(columns.name && columns.phone)
  const same = ready && columns.name === columns.phone
  const summary = ready && !same ? mapped?.summary : null
  const ignored = mapped?.ignored ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnSelect
          label={t("campaignsWizard.mapping.name")}
          headers={headers}
          value={columns.name}
          onChange={(name) => onColumnsChange({ ...columns, name })}
          disabled={disabled}
        />
        <ColumnSelect
          label={t("campaignsWizard.mapping.phone")}
          headers={headers}
          value={columns.phone}
          onChange={(phone) => onColumnsChange({ ...columns, phone })}
          disabled={disabled}
        />
      </div>

      {same ? (
        <p role="alert" className="text-sm text-destructive">
          {t("campaignsWizard.mapping.same")}
        </p>
      ) : null}

      <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t("campaignsWizard.mapping.countryCode")}</span>
          <span className="block text-xs text-pretty text-muted-foreground">
            {t("campaignsWizard.mapping.countryCodeHint")}
          </span>
        </span>
        <Switch
          checked={includeCountryCode}
          onCheckedChange={onIncludeCountryCodeChange}
          disabled={disabled}
        />
      </label>

      {summary ? (
        <section aria-labelledby="mapping-result" className="flex flex-col gap-3 border-t pt-4">
          <h3 id="mapping-result" className="text-sm font-medium" aria-live="polite">
            {t("campaignsWizard.mapping.ready", {
              count: summary.ready,
              formatted: formatNumber(summary.ready, language),
            })}
          </h3>

          {mapped && mapped.sample.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-lg border text-sm">
              {mapped.sample.map((row) => (
                <li key={row.line} className="flex items-center gap-2.5 px-3 py-2">
                  {row.issue ? (
                    <CircleX aria-hidden className="size-4 shrink-0 text-status-danger" />
                  ) : (
                    <CircleCheck aria-hidden className="size-4 shrink-0 text-status-success" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {row.name || t("campaignsWizard.mapping.emptyCell")}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {row.finalPhone
                      ? formatPhone(row.finalPhone)
                      : row.phone || t("campaignsWizard.mapping.emptyCell")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {summary.ignored > 0 ? (
            <Collapsible className="rounded-lg bg-muted/60">
              <CollapsibleTrigger
                render={
                  <button
                    type="button"
                    className="group flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                }
              >
                <span className="min-w-0 flex-1">
                  {t("campaignsWizard.mapping.ignored", {
                    count: summary.ignored,
                    formatted: formatNumber(summary.ignored, language),
                  })}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="flex flex-col gap-0.5 px-3 pb-3 text-xs text-muted-foreground">
                  {summary.duplicate > 0 ? (
                    <li>
                      {t("campaignsWizard.mapping.reasons.duplicate", { count: summary.duplicate })}
                    </li>
                  ) : null}
                  {summary.missingPhone > 0 ? (
                    <li>
                      {t("campaignsWizard.mapping.reasons.missingPhone", { count: summary.missingPhone })}
                    </li>
                  ) : null}
                  {summary.invalidPhone > 0 ? (
                    <li>
                      {t("campaignsWizard.mapping.reasons.invalidPhone", { count: summary.invalidPhone })}
                    </li>
                  ) : null}
                  {summary.missingName > 0 ? (
                    <li>
                      {t("campaignsWizard.mapping.reasons.missingName", { count: summary.missingName })}
                    </li>
                  ) : null}
                </ul>
                <ul className="max-h-48 divide-y overflow-y-auto border-t text-xs">
                  {ignored.map((row) => (
                    <li key={row.line} className="flex gap-3 px-3 py-1.5">
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {t("campaignsWizard.mapping.line", { line: row.line })}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{row.original}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {row.issue ? t(`campaignsWizard.mapping.issue.${row.issue}`) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {mapped && mapped.variables.length > 0 ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {t("campaignsWizard.mapping.variables", {
                list: mapped.variables
                  .slice(0, 8)
                  .map((variable) => asToken(variable.key))
                  .join(", "),
              })}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

/** Mandando em lotes: quanto já foi, parar, e o que fazer se a conexão cair no meio. */
export function SendingProgress({
  state,
  onStop,
  onResume,
}: {
  state: RecipientImportState
  onStop: () => void
  onResume: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const percent = state.total > 0 ? Math.round((state.sent / state.total) * 100) : 0
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    focusRef.current?.focus()
  }, [])

  return (
    <div ref={focusRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <p className="text-sm font-medium" role="status">
        {state.phase === "stopped"
          ? t("campaignsWizard.import.stopped", {
              sent: formatNumber(state.sent, language),
              total: formatNumber(state.total, language),
            })
          : t("campaignsWizard.import.sending", {
              sent: formatNumber(state.sent, language),
              total: formatNumber(state.total, language),
            })}
      </p>
      <Progress value={percent} aria-label={t("campaignsWizard.import.progress")} />

      {state.phase === "failed" ? (
        <Callout
          tone="danger"
          role="alert"
          title={t("campaignsWizard.import.failedTitle")}
          action={
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={onResume}>
              {t("campaignsWizard.import.resume")}
            </Button>
          }
        >
          {state.error instanceof ApiError && state.error.serverMessage
            ? state.error.serverMessage
            : t("campaignsWizard.import.failedHint")}
        </Callout>
      ) : null}

      {state.phase === "stopped" ? (
        <Button type="button" variant="outline" className="self-start pointer-coarse:h-10" onClick={onResume}>
          {t("campaignsWizard.import.resume")}
        </Button>
      ) : null}

      {state.phase === "sending" ? (
        <Button type="button" variant="ghost" className="self-start pointer-coarse:h-10" onClick={onStop}>
          {t("campaignsWizard.import.stop")}
        </Button>
      ) : null}

      <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.import.keepOpen")}</p>
    </div>
  )
}
