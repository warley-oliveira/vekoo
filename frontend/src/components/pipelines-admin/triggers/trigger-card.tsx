import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { CircleAlert, CircleCheck, Clock3, Code2, History, Pencil, Trash2 } from "lucide-react"

import { ActionsMenu, RelativeTime, StatusBadge } from "@/components/shared"
import { Switch } from "@/components/ui/switch"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import { isEnqueuedOnly, runsCode, triggerToDraft } from "@/lib/pipelines-admin/trigger-form"
import { sentenceParts } from "@/lib/pipelines-admin/trigger-sentence"
import type { Trigger, TriggerExecution } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"
import { TriggerSentence } from "./trigger-sentence"

type TriggerCardProps = {
  trigger: Trigger
  /** A execução mais recente que já terminou, e a última de todas. */
  lastFinished?: TriggerExecution
  lastAny?: TriggerExecution
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onHistory: () => void
}

/** Um gatilho é lido como uma frase, com o interruptor ao lado e o que aconteceu da última vez. */
export function TriggerCard({
  trigger,
  lastFinished,
  lastAny,
  onEdit,
  onToggle,
  onDelete,
  onHistory,
}: TriggerCardProps) {
  const { t } = useTranslation()
  const { lookups, canUseCode } = useTriggerContext()

  const parts = useMemo(() => {
    const draft = triggerToDraft(trigger)
    return sentenceParts(draft, lookups)
  }, [lookups, trigger])

  const hasCode = runsCode(trigger)
  // A API recusa gravar gatilho com código sem a permissão `flows`. Ligar, desligar e apagar, não.
  const canEdit = !hasCode || canUseCode
  const failed = lastFinished?.status === "failure"
  const waiting = lastAny && isEnqueuedOnly(lastAny)

  return (
    <article
      className={cn(
        "relative flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors",
        canEdit && "hover:bg-muted/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-heading text-base leading-snug font-medium">
            {canEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className={cn(
                  "rounded text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
                  !trigger.active && "text-muted-foreground"
                )}
              >
                {trigger.name}
              </button>
            ) : (
              <span className={cn(!trigger.active && "text-muted-foreground")}>{trigger.name}</span>
            )}
          </h2>
          <TriggerSentence parts={parts} />
        </div>
        <label className="relative z-10 flex shrink-0 items-center gap-2 pointer-coarse:min-h-10">
          <span className="sr-only">
            {t("pipelinesAdmin.triggers.toggleLabel", { name: trigger.name })}
          </span>
          <Switch checked={trigger.active} onCheckedChange={onToggle} />
        </label>
        <ActionsMenu
          label={t("pipelinesAdmin.triggers.actionsOf", { name: trigger.name })}
          className="relative z-10 -my-1 -mr-1.5 shrink-0"
          actions={[
            {
              label: t("pipelinesAdmin.triggers.edit"),
              icon: <Pencil />,
              hidden: !canEdit,
              onSelect: onEdit,
            },
            {
              label: t("pipelinesAdmin.triggers.seeHistory"),
              icon: <History />,
              onSelect: onHistory,
            },
            {
              label: t("pipelinesAdmin.triggers.delete.action"),
              icon: <Trash2 />,
              destructive: true,
              separatorBefore: true,
              onSelect: onDelete,
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {!trigger.active ? (
          <StatusBadge tone="neutral">{t("pipelinesAdmin.triggers.status.off")}</StatusBadge>
        ) : null}
        {hasCode ? (
          <span className="inline-flex items-center gap-1">
            <Code2 aria-hidden className="size-3.5" />
            {canUseCode ? t("pipelinesAdmin.triggers.runsCode") : t("pipelinesAdmin.triggers.runsCodeLocked")}
          </span>
        ) : null}
        {failed ? (
          <StatusBadge tone="danger" icon={<CircleAlert />}>
            {t("pipelinesAdmin.triggers.status.lastFailed")}
          </StatusBadge>
        ) : null}
        {waiting ? (
          <StatusBadge tone="warning" icon={<Clock3 />}>
            {t("pipelinesAdmin.triggers.status.waiting")}
          </StatusBadge>
        ) : null}
        {lastFinished && !failed ? (
          <span className="inline-flex items-center gap-1">
            <CircleCheck aria-hidden className="size-3.5 text-status-success" />
            {t("pipelinesAdmin.triggers.lastRun")} <RelativeTime value={lastFinished.executedAt} />
          </span>
        ) : null}
        {lastFinished && failed ? <RelativeTime value={lastFinished.executedAt} /> : null}
        {!lastAny ? <span>{t("pipelinesAdmin.triggers.neverRun")}</span> : null}
      </div>
    </article>
  )
}
