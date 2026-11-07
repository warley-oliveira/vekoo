import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ListChecks } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import { EmptyState, ErrorState, FormActions, ListSkeleton, ResponsiveDialog, StatusBadge } from "@/components/shared"
import { useAttendanceSequences } from "@/hooks/calendar/use-attendance-sequences"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import { useRetained } from "@/hooks/use-panel-session"
import { eventErrorMessage } from "@/lib/calendar/event-error"
import type { AttendanceSequence, ReminderPeriod } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const UNIT: Record<ReminderPeriod, "minute" | "hour" | "day"> = {
  minutes: "minute",
  hours: "hour",
  days: "day",
}

function formatDelay(value: number, unit: ReminderPeriod, language: string): string {
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: UNIT[unit],
    unitDisplay: "short",
  }).format(value)
}

/**
 * Inscrever o contato numa sequência. A tela oferece sozinha depois de marcar o comparecimento,
 * quando há sequência que depende de alguém escolher.
 */
export function EnrollSequenceDialog({ actions }: { actions: BookingActions }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const open = Boolean(actions.enrollTarget)
  const target = useRetained(actions.enrollTarget)

  const { sequences, error, isLoading, reload } = useAttendanceSequences(
    open ? target?.event.calendarId : null
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!target) return null

  const available = (sequences ?? []).filter(
    (sequence) => sequence.trigger === target.trigger && sequence.enabled && sequence.id
  )

  // Uma opção só já vem escolhida: o botão "Inscrever" não fica apagado esperando um clique óbvio.
  const chosen = selected ?? (available.length === 1 ? (available[0].id ?? null) : null)

  function close() {
    actions.closeEnroll()
    setSelected(null)
  }

  async function enroll() {
    if (!chosen || !target || busy) return
    setBusy(true)
    try {
      await actions.mutations.enrollSequence(target.event, chosen)
      toast.success(t("calendar.sequence.enroll.done"))
      close()
    } catch (cause) {
      toast.error(eventErrorMessage(t, cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title={t("calendar.sequence.enroll.title")}
      description={t(
        target.trigger === "show"
          ? "calendar.sequence.enroll.descriptionShow"
          : "calendar.sequence.enroll.descriptionNoShow"
      )}
      onSubmit={(formEvent) => {
        formEvent.preventDefault()
        void enroll()
      }}
      footer={
        <FormActions
          loading={busy}
          disabled={!chosen}
          submitLabel={t("calendar.sequence.enroll.submit")}
          cancelLabel={t("calendar.sequence.enroll.notNow")}
          onCancel={close}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {error && !sequences ? (
          <ErrorState error={error} onRetry={() => void reload()} />
        ) : isLoading && !sequences ? (
          <ListSkeleton rows={2} />
        ) : available.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-5" />}
            title={t("calendar.sequence.enroll.empty.title")}
            description={t("calendar.sequence.enroll.empty.description")}
          />
        ) : (
          <div
            role="radiogroup"
            aria-label={t("calendar.sequence.enroll.choose")}
            className="flex flex-col gap-2"
          >
            {available.map((sequence) => (
              <SequenceOption
                key={sequence.id}
                sequence={sequence}
                selected={chosen === sequence.id}
                current={target.event.enrolledSequenceId === sequence.id}
                language={language}
                onSelect={() => setSelected(sequence.id ?? null)}
              />
            ))}
          </div>
        )}

        {available.length === 0 && !isLoading ? (
          <p className="text-center text-sm">
            <Link
              to={`/calendar/${target.event.calendarId}/sequences`}
              className="text-primary underline-offset-4 hover:underline"
              onClick={close}
            >
              {t("calendar.sequence.enroll.empty.action")}
            </Link>
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}

function SequenceOption({
  sequence,
  selected,
  current,
  language,
  onSelect,
}: {
  sequence: AttendanceSequence
  selected: boolean
  current: boolean
  language: string
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const firstStep = sequence.steps[0]

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 flex-col gap-1 rounded-lg p-3 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "bg-accent/60 ring-2 ring-primary hover:bg-accent/60"
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{sequence.name}</span>
        {sequence.autoEnroll ? (
          <StatusBadge tone="info">{t("calendar.sequence.enroll.automatic")}</StatusBadge>
        ) : null}
        {current ? (
          <StatusBadge tone="accent">{t("calendar.sequence.enroll.current")}</StatusBadge>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {t("calendar.sequence.steps", { count: sequence.steps.length })}
        {firstStep
          ? ` · ${t("calendar.sequence.firstIn", {
              delay: formatDelay(firstStep.runAfter, firstStep.runAfterUnit, language),
            })}`
          : ""}
      </span>
    </button>
  )
}
