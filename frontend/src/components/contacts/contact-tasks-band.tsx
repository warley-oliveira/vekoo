import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { CircleCheck, Download, Loader2, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { useContactsExport } from "@/hooks/contacts/use-contacts-export"
import type { ImportGroup } from "@/hooks/contacts/use-contact-imports"
import { formatTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"

export type ContactTasksBandProps = {
  tracker: ReturnType<typeof useContactsExport>
  /** A janela da exportação está aberta: a faixa só repetiria. */
  exportOpen: boolean
  onOpenExport: () => void
  /** O painel de importação está aberto. */
  importOpen: boolean
  runningImport: ImportGroup | undefined
  onOpenImports: () => void
}

function bandClass() {
  return "flex flex-col gap-2 rounded-lg bg-muted/50 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
}

/**
 * O que está andando por trás da lista: quem fechou a janela, saiu e voltou, ou recarregou no
 * meio continua vendo. É também onde o link pronto espera, e onde se descobre que ele venceu.
 */
export function ContactTasksBand({
  tracker,
  exportOpen,
  onOpenExport,
  importOpen,
  runningImport,
  onOpenImports,
}: ContactTasksBandProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const { state, download, checking, dismiss } = tracker
  const number = (value: number) => formatNumber(value, language)

  const exporting = state.phase === "requesting" || state.phase === "running"
  const exportPercentage = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0
  const showExport = !exportOpen && state.phase !== "idle"
  const showImport = !importOpen && Boolean(runningImport)
  const problemKey = {
    expired: "contacts.tasks.expired",
    failed: "contacts.tasks.failed",
    empty: "contacts.tasks.empty",
  }[state.phase as string]

  const dismissButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("contacts.tasks.dismiss")}
      className="shrink-0 self-end text-muted-foreground sm:self-auto"
      onClick={dismiss}
    >
      <X />
    </Button>
  )

  const importPercentage = runningImport
    ? Math.round((runningImport.finishedBatches / runningImport.batches) * 100)
    : 0

  return (
    <AnimatePresence initial={false}>
      {showImport && runningImport ? (
        <motion.div key="import" {...preset.slideUp} role="status" className={bandClass()}>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
            <span className="truncate">
              {t("contacts.tasks.importing", {
                count: runningImport.total,
                formatted: number(runningImport.total),
              })}
            </span>
          </div>
          {/* Com um lote só não há o que medir: o giro já diz que está andando. */}
          {runningImport.batches > 1 ? (
            <Progress
              value={importPercentage}
              aria-label={t("contacts.import.tracking.progressLabel")}
              className="gap-0 sm:w-40"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-end pointer-coarse:h-10 sm:self-auto"
            onClick={onOpenImports}
          >
            {t("contacts.tasks.view")}
          </Button>
        </motion.div>
      ) : null}

      {showExport && exporting ? (
        <motion.div key="exporting" {...preset.slideUp} role="status" className={bandClass()}>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm tabular-nums">
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
            <span className="truncate">
              {state.total > 0
                ? t("contacts.export.running", {
                    processed: number(state.processed),
                    total: number(state.total),
                  })
                : t("contacts.export.queued")}
            </span>
          </div>
          {state.total > 0 ? (
            <Progress
              value={exportPercentage}
              aria-label={t("contacts.export.progressLabel")}
              className="gap-0 sm:w-40"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-end pointer-coarse:h-10 sm:self-auto"
            onClick={onOpenExport}
          >
            {t("contacts.tasks.view")}
          </Button>
        </motion.div>
      ) : null}

      {showExport && state.phase === "ready" ? (
        <motion.div key="ready" {...preset.slideUp} role="status" className={bandClass()}>
          <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-status-success" />
            <span className="min-w-0 text-pretty">
              {t("contacts.tasks.ready", {
                count: state.total,
                formatted: number(state.total),
                time: state.expiresAt ? formatTime(state.expiresAt, language) : "",
              })}
            </span>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1">
            <Button
              type="button"
              size="sm"
              disabled={checking}
              className="pointer-coarse:h-10"
              onClick={() => void download()}
            >
              {checking ? <Loader2 className="animate-spin" /> : <Download />}
              {t("contacts.export.download")}
            </Button>
            {dismissButton}
          </div>
        </motion.div>
      ) : null}

      {showExport && problemKey ? (
        <motion.div key="problem" {...preset.slideUp} role="alert" className={bandClass()}>
          <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 text-pretty">{t(problemKey)}</span>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              onClick={() => {
                dismiss()
                onOpenExport()
              }}
            >
              {t("contacts.export.exportAgain")}
            </Button>
            {dismissButton}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
