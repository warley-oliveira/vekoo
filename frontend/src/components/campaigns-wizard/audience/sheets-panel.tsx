import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileSpreadsheet, Loader2 } from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"

import { Callout, SidePanel, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useGoogleSheetPicker } from "@/hooks/campaigns-wizard/use-google-sheet-picker"
import { useImportWorker } from "@/hooks/campaigns-wizard/use-import-worker"
import { useRecipientImport } from "@/hooks/campaigns-wizard/use-recipient-import"
import { useCan } from "@/hooks/use-can"
import { ApiError, apiPost } from "@/lib/api"
import type { ParsedSummary } from "@/lib/campaigns-wizard/import-protocol"
import type { Capabilities } from "@/lib/campaigns-wizard/types"
import type { ImportRow } from "@/lib/contacts/import-parser"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { ColumnMapping, SendingProgress, useColumnMapping } from "./column-mapping"

/**
 * Google Sheets: entrar na conta, escolher a planilha e a aba, dizer as colunas. O acesso é da própria
 * pessoa. Sem a configuração no servidor, explica o que falta e aponta o caminho do arquivo, que resolve
 * o mesmo problema.
 */
export default function SheetsPanel({
  capabilities,
  onClose,
  onUseFile,
}: {
  capabilities: Capabilities["googleSheets"] | null
  onClose: () => void
  onUseFile: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const canConfigure = useCan("core_settings")
  const picker = useGoogleSheetPicker(capabilities)
  const { loadRows, mapColumns, nextBatch } = useImportWorker()
  const sender = useRecipientImport()

  const [open, setOpen] = useState(true)
  const [gid, setGid] = useState<number | null>(null)
  const [parsed, setParsed] = useState<ParsedSummary | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const mapping = useColumnMapping(mapColumns, parsed !== null)
  const sending = sender.state.phase !== "idle" && sender.state.phase !== "done"
  const available = capabilities?.available ?? false

  // Uma aba só: não há o que escolher.
  const selectedGid = picker.tabs.length === 1 ? picker.tabs[0].gid : gid

  useEffect(() => {
    if (sender.state.phase !== "done") return

    const { imported, skipped, invalid } = sender.state
    toast.success(
      t("campaignsWizard.import.done", { count: imported, formatted: formatNumber(imported, language) }),
      skipped + invalid > 0
        ? {
            description: t("campaignsWizard.import.doneDetail", {
              skipped: formatNumber(skipped, language),
              invalid: formatNumber(invalid, language),
            }),
          }
        : undefined
    )
    setOpen(false)
    onClose()
  }, [language, onClose, sender.state, t])

  async function download() {
    if (!picker.file || selectedGid === null || !picker.accessToken) return

    setDownloading(true)
    setDownloadError(null)
    try {
      const result = await apiPost<{ headers: string[]; data: ImportRow[]; rowCount: number }>(
        "/campaigns/import-google-sheet",
        { fileId: picker.file.id, sheetGid: selectedGid, accessToken: picker.accessToken }
      )
      const summary = await loadRows(result.headers, result.data)
      setParsed(summary)
      mapping.setColumns(summary.suggested)
    } catch (error) {
      setDownloadError(
        error instanceof ApiError && error.serverMessage
          ? error.serverMessage
          : t("campaignsWizard.sheets.downloadFailed")
      )
    } finally {
      setDownloading(false)
    }
  }

  async function close() {
    if (sender.state.phase === "sending") {
      const stop = await confirm({
        title: t("campaignsWizard.import.stopTitle"),
        description: t("campaignsWizard.import.stopHint", {
          sent: formatNumber(sender.state.sent, language),
        }),
        confirmLabel: t("campaignsWizard.import.stop"),
        cancelLabel: t("campaignsWizard.import.keepGoing"),
        destructive: true,
      })
      if (!stop) return
      sender.stop()
    }
    setOpen(false)
    onClose()
  }

  const readyCount = mapping.mapped?.summary.ready ?? 0

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      size="xl"
      title={t("campaignsWizard.sheets.title")}
      description={parsed ? undefined : t("campaignsWizard.sheets.description")}
      disablePointerDismissal={Boolean(parsed) || sending}
      footer={
        parsed && !sending ? (
          <Button
            type="button"
            disabled={!mapping.ready || mapping.mapping || readyCount === 0}
            className="pointer-coarse:h-10"
            onClick={() => void sender.start(readyCount, nextBatch)}
          >
            {mapping.mapping ? <Loader2 className="animate-spin" /> : null}
            {t("campaignsWizard.import.submit", {
              count: readyCount,
              formatted: formatNumber(readyCount, language),
            })}
          </Button>
        ) : picker.file && picker.tabs.length > 0 && !sending ? (
          <Button
            type="button"
            disabled={selectedGid === null || downloading}
            className="pointer-coarse:h-10"
            onClick={() => void download()}
          >
            {downloading ? <Loader2 className="animate-spin" /> : null}
            {downloading ? t("campaignsWizard.sheets.downloading") : t("campaignsWizard.sheets.useTab")}
          </Button>
        ) : undefined
      }
    >
      {!available ? (
        <div className="flex flex-col gap-4">
          <Callout tone="neutral" title={t("campaignsWizard.sheets.unavailableTitle")}>
            {t("campaignsWizard.sheets.unavailableHint")}
          </Callout>
          {canConfigure ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {t("campaignsWizard.sheets.unavailableAdmin", {
                variables: "GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_API_KEY, GOOGLE_SHEETS_APP_ID",
              })}
            </p>
          ) : null}
          <Button type="button" variant="outline" className="self-start pointer-coarse:h-10" onClick={onUseFile}>
            {t("campaignsWizard.sheets.useFile")}
          </Button>
        </div>
      ) : sending ? (
        <SendingProgress state={sender.state} onStop={sender.stop} onResume={() => void sender.resume()} />
      ) : parsed ? (
        <div className="flex flex-col gap-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileSpreadsheet aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              {t("campaignsWizard.import.found", {
                name: picker.file?.name ?? "",
                count: parsed.rowCount,
                formatted: formatNumber(parsed.rowCount, language),
              })}
            </span>
          </p>
          <ColumnMapping
            headers={parsed.headers}
            columns={mapping.columns}
            onColumnsChange={mapping.setColumns}
            includeCountryCode={mapping.includeCountryCode}
            onIncludeCountryCodeChange={mapping.setIncludeCountryCode}
            mapped={mapping.mapped}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {picker.file ? (
            <p className="flex items-center gap-2 text-sm font-medium">
              <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate">{picker.file.name}</span>
            </p>
          ) : null}

          {picker.tabs.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t("campaignsWizard.sheets.pickTab")}</legend>
              <RadioGroup
                value={selectedGid === null ? null : String(selectedGid)}
                onValueChange={(value) => setGid(Number(value))}
              >
                {picker.tabs.map((tab) => (
                  <label
                    key={tab.gid}
                    className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-data-[checked]:border-primary"
                  >
                    <RadioGroupItem value={String(tab.gid)} />
                    <span className="truncate">{tab.name}</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          ) : null}

          {picker.tabs.length === 1 ? (
            <p className="text-sm text-muted-foreground">
              {t("campaignsWizard.sheets.singleTab", { name: picker.tabs[0].name })}
            </p>
          ) : null}

          {picker.tabs.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={picker.busy}
              className="self-start pointer-coarse:h-10"
              onClick={() => void picker.open()}
            >
              {picker.busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              {t("campaignsWizard.sheets.pick")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground pointer-coarse:h-10"
              onClick={() => void picker.open()}
            >
              {t("campaignsWizard.sheets.pickAnother")}
            </Button>
          )}

          {picker.error ? (
            <Callout tone="danger" role="alert">
              {t(`campaignsWizard.sheets.errors.${picker.error}`)}
            </Callout>
          ) : null}
          {downloadError ? (
            <Callout tone="danger" role="alert">
              {downloadError}
            </Callout>
          ) : null}

          <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.sheets.privacy")}</p>
        </div>
      )}
    </SidePanel>
  )
}
