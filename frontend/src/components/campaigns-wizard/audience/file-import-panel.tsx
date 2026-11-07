import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, FileText, Loader2 } from "lucide-react"
import { toast } from "@/lib/campaigns-wizard/notify"

import { Callout, FileDropzone, SidePanel, useConfirm, type DropzoneFile } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useColumnMapping } from "@/hooks/campaigns-wizard/use-column-mapping"
import { useImportWorker } from "@/hooks/campaigns-wizard/use-import-worker"
import { useRecipientImport } from "@/hooks/campaigns-wizard/use-recipient-import"
import type { ParsedSummary } from "@/lib/campaigns-wizard/import-protocol"
import { asToken } from "@/lib/campaigns-wizard/variables"
import type { ImportIssue } from "@/lib/contacts/import-parser"
import { triggerBlobDownload } from "@/lib/file-utils"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { ColumnMapping, SendingProgress } from "./column-mapping"

const MAX_FILE_BYTES = 200 * 1024 * 1024

// O Mac e o Windows reportam tipos diferentes para o mesmo CSV: a extensão é o que vale.
const ACCEPT = {
  "text/csv": [".csv", ".tsv", ".txt", ".json"],
  "text/plain": [".csv", ".tsv", ".txt"],
  "text/tab-separated-values": [".tsv"],
  "application/json": [".json"],
  "application/vnd.ms-excel": [".csv"],
}

/** Arquivo: escolher, dizer as colunas e mandar, tudo lido no navegador antes de subir qualquer coisa. */
export default function FileImportPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { progress, readFile, mapColumns, nextBatch } = useImportWorker()
  const sender = useRecipientImport()

  const [open, setOpen] = useState(true)
  const [files, setFiles] = useState<DropzoneFile[]>([])
  const [fileName, setFileName] = useState("")
  const [parsed, setParsed] = useState<ParsedSummary | null>(null)
  const [issues, setIssues] = useState<ImportIssue[]>([])
  const [reading, setReading] = useState(false)

  const mapping = useColumnMapping(mapColumns, parsed !== null)
  const sending = sender.state.phase !== "idle" && sender.state.phase !== "done"

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

  async function read(file: File) {
    setReading(true)
    setIssues([])
    setParsed(null)
    try {
      const result = await readFile(file)
      if (result.rowCount > 0) {
        setFileName(file.name)
        setParsed(result)
        mapping.setColumns(result.suggested)
      } else {
        setIssues(result.issues.length > 0 ? result.issues : [{ code: "noData" }])
      }
    } catch {
      setIssues([{ code: "unknownFormat" }])
    } finally {
      setReading(false)
    }
  }

  function chooseAnother() {
    setParsed(null)
    setFiles([])
    setIssues([])
    mapping.setColumns({ name: null, phone: null })
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
    } else if (parsed && !sending) {
      const leave = await confirm({
        title: t("campaignsWizard.import.discardTitle"),
        description: t("campaignsWizard.import.discardHint"),
        confirmLabel: t("campaignsWizard.import.discard"),
        cancelLabel: t("campaignsWizard.import.keep"),
        destructive: true,
      })
      if (!leave) return
    }
    setOpen(false)
    onClose()
  }

  function downloadExample() {
    const lines = [
      [
        t("campaignsWizard.import.example.name"),
        t("campaignsWizard.import.example.phone"),
        t("campaignsWizard.import.example.city"),
        t("campaignsWizard.import.example.coupon"),
      ],
      [
        t("campaignsWizard.import.example.rowName"),
        "5541999990001",
        t("campaignsWizard.import.example.rowCity"),
        t("campaignsWizard.import.example.rowCoupon"),
      ],
    ]
    // Com BOM, para o Excel não errar os acentos.
    triggerBlobDownload(
      new Blob([`﻿${lines.map((line) => line.join(",")).join("\n")}\n`], {
        type: "text/csv;charset=utf-8",
      }),
      t("campaignsWizard.import.example.fileName")
    )
  }

  const readyCount = mapping.mapped?.summary.ready ?? 0
  const percent = progress?.fraction !== null && progress ? Math.round(progress.fraction! * 100) : null

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      size="xl"
      title={t("campaignsWizard.import.title")}
      description={parsed ? undefined : t("campaignsWizard.import.description")}
      disablePointerDismissal={Boolean(parsed) || sending}
      footer={
        parsed && !sending ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="sm:mr-auto pointer-coarse:h-10"
              onClick={chooseAnother}
            >
              {t("campaignsWizard.import.another")}
            </Button>
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
          </>
        ) : undefined
      }
    >
      {sending ? (
        <SendingProgress state={sender.state} onStop={sender.stop} onResume={() => void sender.resume()} />
      ) : parsed ? (
        <div className="flex flex-col gap-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              {t("campaignsWizard.import.found", {
                name: fileName,
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
          <FileDropzone
            value={files}
            onChange={(next) => {
              setFiles(next)
              const file = next[0]?.file
              if (file) void read(file)
              else setIssues([])
            }}
            accept={ACCEPT}
            maxSize={MAX_FILE_BYTES}
            maxFiles={1}
            disabled={reading}
            hint={t("campaignsWizard.import.hint")}
          />

          {reading ? (
            <div role="status" className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {progress?.phase === "organizing" || percent === null
                  ? t("campaignsWizard.import.organizing")
                  : t("campaignsWizard.import.reading", { percent })}
              </p>
              {percent === null || progress?.phase === "organizing" ? (
                <div className="h-1 w-full animate-pulse rounded-full bg-primary/60" />
              ) : (
                <Progress value={percent} aria-label={t("campaignsWizard.import.progress")} />
              )}
            </div>
          ) : null}

          {issues.length > 0 ? (
            <Callout tone="danger" role="alert" title={t("campaignsWizard.import.errorTitle")}>
              <ul className="flex flex-col gap-0.5">
                {issues.slice(0, 3).map((issue, index) => (
                  <li key={index}>{t(`contacts.import.issues.${issue.code}`, { line: issue.line })}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-pretty text-muted-foreground">
            <p className="font-medium text-foreground">{t("campaignsWizard.import.helpTitle")}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              <li>{t("campaignsWizard.import.helpColumns")}</li>
              <li>{t("campaignsWizard.import.helpVariables", { token: asToken("cupom") })}</li>
              <li>{t("campaignsWizard.import.helpPrivate")}</li>
            </ul>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground pointer-coarse:h-10"
            onClick={downloadExample}
          >
            <Download />
            {t("campaignsWizard.import.downloadExample")}
          </Button>
        </div>
      )}
    </SidePanel>
  )
}
