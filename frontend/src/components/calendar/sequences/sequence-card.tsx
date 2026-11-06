import { useTranslation } from "react-i18next"
import { Pencil, Sparkles, Trash2 } from "lucide-react"

import { ActionsMenu, StatusBadge } from "@/components/shared"
import { Switch } from "@/components/ui/switch"
import type { AttendanceSequence } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

type SequenceCardProps = {
  sequence: AttendanceSequence
  /** O estado que a tela está mostrando: pode estar à frente da API, enquanto ela responde. */
  enabled: boolean
  togglePending: boolean
  onOpen: () => void
  onToggle: (enabled: boolean) => void
  onDelete: () => void
}

/** Uma sequência na lista: o que ela faz em uma olhada, o interruptor e o caminho para editar. */
export function SequenceCard({
  sequence,
  enabled,
  togglePending,
  onOpen,
  onToggle,
  onDelete,
}: SequenceCardProps) {
  const { t } = useTranslation()

  const first = sequence.steps[0]
  const aiSteps = sequence.steps.filter((step) => step.aiPrompt?.trim()).length
  const summary = [
    t("calendar.sequences.stepsCount", { count: sequence.steps.length }),
    first
      ? t("calendar.sequences.card.firstMessage", {
          delay: t(`calendar.sequences.delay.long.${first.runAfterUnit}`, { count: first.runAfter }),
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <article className="relative flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 font-heading text-base leading-snug font-medium">
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "rounded text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
              !enabled && "text-muted-foreground"
            )}
          >
            {sequence.name}
          </button>
        </h3>
        <div className="relative z-10 -my-1 flex shrink-0 items-center gap-1.5 pointer-coarse:my-0">
          <Switch
            aria-label={t(
              enabled ? "calendar.sequences.card.turnOff" : "calendar.sequences.card.turnOn",
              { name: sequence.name }
            )}
            checked={enabled}
            disabled={togglePending}
            onCheckedChange={onToggle}
          />
          <ActionsMenu
            label={t("calendar.sequences.card.actionsOf", { name: sequence.name })}
            actions={[
              { label: t("calendar.sequences.card.edit"), icon: <Pencil />, onSelect: onOpen },
              {
                label: t("calendar.sequences.delete.action"),
                icon: <Trash2 />,
                destructive: true,
                separatorBefore: true,
                onSelect: onDelete,
              },
            ]}
          />
        </div>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{summary}</p>
      <div className="flex flex-wrap gap-1.5 empty:hidden">
        {!enabled ? (
          <StatusBadge tone="neutral">{t("calendar.sequences.badges.off")}</StatusBadge>
        ) : null}
        {sequence.autoEnroll ? (
          <StatusBadge tone="info" dot={false}>
            {t("calendar.sequences.badges.autoEnroll")}
          </StatusBadge>
        ) : null}
        {sequence.stopOnReply ? (
          <StatusBadge tone="neutral" dot={false}>
            {t("calendar.sequences.badges.stopOnReply")}
          </StatusBadge>
        ) : null}
        {aiSteps > 0 ? (
          <StatusBadge tone="accent" dot={false} icon={<Sparkles />}>
            {t("calendar.sequences.badges.ai", { count: aiSteps })}
          </StatusBadge>
        ) : null}
      </div>
    </article>
  )
}
