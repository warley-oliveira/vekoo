import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, History, Loader2 } from "lucide-react"

import { Callout, FileDropzone, type DropzoneFile } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  readImportFile,
  type ImportIssue,
  type ParsedImport,
} from "@/lib/contacts/import-parser"
import { triggerBlobDownload } from "@/lib/file-utils"

const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_SHOWN_ISSUES = 3

// O Mac e o Windows reportam tipos diferentes para o mesmo CSV: a extensão é o que vale.
const ACCEPT = {
  "text/csv": [".csv", ".tsv", ".txt", ".json"],
  "text/plain": [".csv", ".tsv", ".txt"],
  "text/tab-separated-values": [".tsv"],
  "application/json": [".json"],
  "application/vnd.ms-excel": [".csv"],
  "application/csv": [".csv"],
  "text/x-csv": [".csv"],
}

export type ImportFileStepProps = {
  /** Voltou de uma etapa à frente: este arquivo continua valendo, até escolher outro. */
  loadedFile: string | null
  onParsed: (fileName: string, parsed: ParsedImport) => void
  onHistory: () => void
}

/**
 * Primeira fase: o arquivo é lido aqui mesmo, sem subir para lugar nenhum. É o que deixa mapear
 * as colunas e conferir linha a linha antes de enviar.
 */
export function ImportFileStep({ loadedFile, onParsed, onHistory }: ImportFileStepProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<DropzoneFile[]>([])
  const [reading, setReading] = useState(false)
  const [issues, setIssues] = useState<ImportIssue[]>([])

  function issueText(issue: ImportIssue) {
    return t(`contacts.import.issues.${issue.code}`, { line: issue.line })
  }

  async function read(file: File) {
    setReading(true)
    setIssues([])
    try {
      const parsed = await readImportFile(file)
      if (parsed.rows.length > 0) onParsed(file.name, parsed)
      else setIssues(parsed.issues.length > 0 ? parsed.issues : [{ code: "noData" }])
    } catch {
      setIssues([{ code: "unknownFormat" }])
    } finally {
      setReading(false)
    }
  }

  function downloadTemplate() {
    const lines = [
      [
        t("contacts.import.template.name"),
        t("contacts.import.template.phone"),
        t("contacts.import.template.assignee"),
        t("contacts.import.template.department"),
      ],
      [t("contacts.import.template.exampleName"), "5531999990000", "", ""],
    ]
    const content = lines.map((line) => line.join(",")).join("\n")
    // Com BOM, para o Excel não errar os acentos.
    triggerBlobDownload(
      new Blob([`﻿${content}\n`], { type: "text/csv;charset=utf-8" }),
      t("contacts.import.template.fileName")
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {loadedFile && files.length === 0 ? (
        <Callout>{t("contacts.import.file.loaded", { name: loadedFile })}</Callout>
      ) : null}

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
        hint={t("contacts.import.file.hint")}
      />

      {reading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          {t("contacts.import.file.reading")}
        </p>
      ) : null}

      {issues.length > 0 ? (
        <Callout tone="danger" role="alert" title={t("contacts.import.file.errorTitle")}>
          <ul className="flex flex-col gap-0.5">
            {issues.slice(0, MAX_SHOWN_ISSUES).map((issue, index) => (
              <li key={index}>{issueText(issue)}</li>
            ))}
            {issues.length > MAX_SHOWN_ISSUES ? (
              <li>
                {t("contacts.import.file.moreIssues", {
                  count: issues.length - MAX_SHOWN_ISSUES,
                })}
              </li>
            ) : null}
          </ul>
        </Callout>
      ) : null}

      <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-pretty text-muted-foreground">
        <p className="font-medium text-foreground">{t("contacts.import.file.helpTitle")}</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>{t("contacts.import.file.helpCsv")}</li>
          <li>{t("contacts.import.file.helpJson")}</li>
          <li>{t("contacts.import.file.helpRequired")}</li>
        </ul>
        <p className="mt-2 font-medium text-foreground">{t("contacts.import.file.noteTitle")}</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          <li>{t("contacts.import.file.notePlatform")}</li>
          <li>{t("contacts.import.file.noteHistory")}</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={downloadTemplate}
        >
          <Download />
          {t("contacts.import.file.template")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={onHistory}
        >
          <History />
          {t("contacts.import.history.title")}
        </Button>
      </div>
    </div>
  )
}
