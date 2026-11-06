import { useEffect, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CircleCheck, Download, Loader2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Callout, RadioField, ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { useContactsExport } from "@/hooks/contacts/use-contacts-export"
import { contactErrorMessage } from "@/lib/contacts/error-message"
import { MAX_NOW_EXPORT, canExportNow, exportNow } from "@/lib/contacts/export-download"
import type { ContactSelectionTarget } from "@/lib/contacts/filters"
import { formatTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

type ExportMode = "now" | "background"

export type ContactExportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tracker: ReturnType<typeof useContactsExport>
  /** O que exportar: os marcados, ou o filtro inteiro. */
  target: ContactSelectionTarget
  /** Quantos são, pelo que a tela sabe. */
  count: number
  /** A seleção vem da barra de lote, e não do filtro. */
  fromSelection: boolean
}

/**
 * Pedir, acompanhar e baixar, na mesma janela. A API tem dois caminhos e a diferença importa para
 * quem tem pressa: na hora, até 5000 linhas, com a tela esperando; em segundo plano, de qualquer
 * tamanho, com um link que vence em 1 hora. Fechar não cancela nada: a faixa da lista continua
 * mostrando o andamento.
 */
export function ContactExportDialog({
  open,
  onOpenChange,
  tracker,
  target,
  count,
  fromSelection,
}: ContactExportDialogProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { state, start, download, checking, dismiss } = tracker

  const nowAvailable = canExportNow(target, count)
  const form = useForm<{ mode: ExportMode }>({
    defaultValues: { mode: nowAvailable ? "now" : "background" },
  })
  const chosen = useWatch({ control: form.control, name: "mode" })
  const mode: ExportMode = nowAvailable ? chosen : "background"

  const [downloadingNow, setDownloadingNow] = useState(false)
  const [nowError, setNowError] = useState<string | null>(null)
  const nowRequest = useRef<AbortController | null>(null)

  // Cada abertura pergunta de novo, com o tamanho de agora.
  useEffect(() => {
    if (open) {
      form.reset({ mode: nowAvailable ? "now" : "background" })
      setNowError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const amount = { count, formatted: formatNumber(count, language) }
  const number = (value: number) => formatNumber(value, language)

  async function requestNow() {
    const controller = new AbortController()
    nowRequest.current = controller
    setDownloadingNow(true)
    setNowError(null)
    try {
      await exportNow(target, controller.signal)
      toast.success(t("contacts.export.nowDone", amount))
      onOpenChange(false)
    } catch (error) {
      if (!controller.signal.aborted) setNowError(contactErrorMessage(t, error))
    } finally {
      setDownloadingNow(false)
    }
  }

  function close() {
    nowRequest.current?.abort()
    onOpenChange(false)
  }

  const percentage = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0
  const active = state.phase === "requesting" || state.phase === "running"

  let body
  let footer

  if (state.phase === "idle") {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-pretty">
          {t(fromSelection ? "contacts.export.selectionSummary" : "contacts.export.filterSummary", amount)}
        </p>

        {nowAvailable ? (
          <RadioField
            control={form.control}
            name="mode"
            label={t("contacts.export.modeLabel")}
            variant="cards"
            options={[
              {
                value: "now",
                label: t("contacts.export.now"),
                description: t("contacts.export.nowHint", {
                  limit: formatNumber(MAX_NOW_EXPORT, language),
                }),
              },
              {
                value: "background",
                label: t("contacts.export.background"),
                description: t("contacts.export.backgroundHint"),
              },
            ]}
          />
        ) : (
          <Callout tone="neutral">
            {t("contacts.export.onlyBackground", {
              limit: formatNumber(MAX_NOW_EXPORT, language),
            })}
          </Callout>
        )}

        {nowError ? (
          <p role="alert" className="text-sm text-destructive">
            {nowError}
          </p>
        ) : null}
      </div>
    )
    footer = (
      <>
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
          {t("contacts.actions.cancel")}
        </Button>
        <Button
          type="button"
          disabled={downloadingNow || count === 0}
          className="pointer-coarse:h-10"
          onClick={() => {
            if (mode === "now") void requestNow()
            else start(target)
          }}
        >
          {downloadingNow ? <Loader2 className="animate-spin" /> : <Download />}
          {t(mode === "now" ? "contacts.export.submitNow" : "contacts.export.submitBackground")}
        </Button>
      </>
    )
  } else if (active) {
    body = (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm tabular-nums">
          {state.phase === "requesting" || state.total === 0
            ? t("contacts.export.queued")
            : t("contacts.export.running", {
                processed: number(state.processed),
                total: number(state.total),
              })}
        </p>
        <Progress
          value={state.phase === "requesting" || state.total === 0 ? null : percentage}
          aria-label={t("contacts.export.progressLabel")}
          className="gap-0"
        />
        <p className="text-xs text-pretty text-muted-foreground">
          {t(state.stalled ? "contacts.export.stalled" : "contacts.export.canClose")}
        </p>
      </div>
    )
    footer = (
      <>
        {state.stalled ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground pointer-coarse:h-10 sm:mr-auto"
            onClick={dismiss}
          >
            {t("contacts.export.startOver")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
          {t("contacts.export.keepGoing")}
        </Button>
      </>
    )
  } else if (state.phase === "ready") {
    body = (
      <div className="flex items-start gap-3">
        <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-status-success" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-medium">
            {t("contacts.export.readyTitle", {
              count: state.total,
              formatted: number(state.total),
            })}
          </p>
          <p className="text-pretty text-muted-foreground">
            {state.expiresAt
              ? t("contacts.export.readyHint", {
                  time: formatTime(state.expiresAt, language),
                })
              : null}
          </p>
          {state.fileName ? (
            <p className="truncate text-xs text-muted-foreground">{state.fileName}</p>
          ) : null}
        </div>
      </div>
    )
    footer = (
      <>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground pointer-coarse:h-10 sm:mr-auto"
          onClick={dismiss}
        >
          {t("contacts.export.newExport")}
        </Button>
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
          {t("contacts.actions.close")}
        </Button>
        <Button
          type="button"
          disabled={checking}
          className="pointer-coarse:h-10"
          onClick={() => void download()}
        >
          {checking ? <Loader2 className="animate-spin" /> : <Download />}
          {t("contacts.export.download")}
        </Button>
      </>
    )
  } else {
    // Vencido, sem nada para exportar ou com falha: a saída é sempre pedir de novo.
    const key =
      state.phase === "expired"
        ? { title: "contacts.export.expiredTitle", hint: "contacts.export.expiredHint" }
        : state.phase === "empty"
          ? { title: "contacts.export.emptyTitle", hint: "contacts.export.emptyHint" }
          : state.noConnection
            ? { title: "contacts.export.failedTitle", hint: "contacts.export.noConnection" }
            : { title: "contacts.export.failedTitle", hint: "contacts.export.failedHint" }

    body = (
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-medium">{t(key.title)}</p>
          <p className="text-pretty text-muted-foreground">{state.message ?? t(key.hint)}</p>
        </div>
      </div>
    )
    footer = (
      <>
        <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
          {t("contacts.actions.close")}
        </Button>
        <Button type="button" className="pointer-coarse:h-10" onClick={dismiss}>
          {t("contacts.export.exportAgain")}
        </Button>
      </>
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title={t("contacts.export.title")}
      size="md"
      footer={footer}
    >
      {body}
    </ResponsiveDialog>
  )
}
