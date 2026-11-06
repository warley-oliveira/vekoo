import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { History } from "lucide-react"

import {
  EmptyState,
  ErrorState,
  FileTypeIcon,
  ListSkeleton,
  RelativeTime,
  StatusBadge,
  type StatusTone,
} from "@/components/shared"
import { Progress } from "@/components/ui/progress"
import {
  groupImports,
  useContactImports,
  type ImportGroup,
} from "@/hooks/contacts/use-contact-imports"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

const STATUS_TONES: Record<ImportGroup["status"], StatusTone> = {
  running: "info",
  completed: "success",
  failed: "danger",
}

export type ImportHistoryProps = {
  /** O nome do canal, quando a tela conhece. */
  connectorName: (connectorId: string) => string | null
  onNew: () => void
}

/** As importações recentes, de quem quer que tenha feito. Os lotes de um arquivo viram uma linha. */
export function ImportHistory({ connectorName, onNew }: ImportHistoryProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { imports, error, isLoading, reload } = useContactImports()
  const groups = useMemo(() => groupImports(imports ?? []), [imports])
  const number = (value: number) => formatNumber(value, language)

  if (isLoading) return <ListSkeleton rows={5} avatar />
  if (error && !imports) return <ErrorState error={error} onRetry={() => void reload()} />

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title={t("contacts.import.history.emptyTitle")}
        description={t("contacts.import.history.emptyHint")}
        action={{ label: t("contacts.import.action"), onClick: onNew }}
      />
    )
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {groups.map((group) => {
        const channel = connectorName(group.connectorId)
        const percentage = Math.round((group.finishedBatches / group.batches) * 100)

        return (
          <li key={group.key} className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-3">
              <FileTypeIcon
                fileName={group.fileName ?? "contatos.csv"}
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-medium">
                  {group.fileName ?? t("contacts.import.history.noFileName")}
                </p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {channel ? (
                    <>
                      <span>{channel}</span>
                      <span aria-hidden>·</span>
                    </>
                  ) : null}
                  <RelativeTime value={group.createdAt} />
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("contacts.import.history.counts", {
                    imported: number(group.imported),
                    total: number(group.total),
                  })}
                </p>
              </div>
              <StatusBadge tone={STATUS_TONES[group.status]}>
                {t(`contacts.import.history.status.${group.status}`)}
              </StatusBadge>
            </div>
            {group.status === "running" && group.batches > 1 ? (
              <Progress
                value={percentage}
                aria-label={t("contacts.import.tracking.progressLabel")}
                className="gap-0"
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
