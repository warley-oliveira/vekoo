import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  NumberField,
  SelectField,
  ResponsiveDialog,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { calendarKey, useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { apiGet } from "@/lib/api"
import type { AgendaCalendar, ContactReminderRule, ReminderPeriod } from "@/lib/calendar/types"
import {
  checkMessageRule,
  messageRulePayload,
  messageRuleShape,
  messageRuleValues,
} from "./message-rule"
import { MessageRuleField } from "./message-rule-field"
import { MessageTestDialog, type MessageTestTarget } from "./message-test-dialog"
import { beforeLabel, CONTACT_INTERVAL_MAX, periodOptions, replaceRule } from "./rule-helpers"

function buildSchema(t: TFunction) {
  return z
    .object({
      interval: z.number().nullable(),
      period: z.enum(["minutes", "hours", "days"]),
      ...messageRuleShape(t),
    })
    .superRefine((values, ctx) => {
      checkMessageRule(values, ctx, t)

      const max = CONTACT_INTERVAL_MAX[values.period]
      if (values.interval === null) {
        ctx.addIssue({ code: "custom", path: ["interval"], message: t("calendar.reminders.panel.intervalRequired") })
      } else if (!Number.isInteger(values.interval) || values.interval < 1) {
        ctx.addIssue({ code: "custom", path: ["interval"], message: t("calendar.reminders.panel.intervalInvalid") })
      } else if (values.interval > max) {
        ctx.addIssue({ code: "custom", path: ["interval"], message: t("calendar.reminders.panel.intervalTooBig", { max }) })
      }
    })
}

type ReminderValues = z.infer<ReturnType<typeof buildSchema>>

type ReminderRulePanelProps = {
  calendar: AgendaCalendar
  /** Sem regra, o painel cria. */
  rule: ContactReminderRule | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (rule: ContactReminderRule) => void
}

/** Criar e editar um lembrete ao contato. Testar usa o que está na tela, sem precisar salvar. */
export function ReminderRulePanel({ calendar, rule, open, onOpenChange, onDelete }: ReminderRulePanelProps) {
  const { t } = useTranslation()
  const { updateCalendar } = useCalendarMutations()
  const [testing, setTesting] = useState<MessageTestTarget | null>(null)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<ReminderValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      interval: rule?.interval ?? 1,
      period: rule?.period ?? "days",
      ...messageRuleValues(rule ?? {}),
    },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const submit = useFormSubmit(form, async (values) => {
    const next: ContactReminderRule = {
      interval: values.interval as number,
      period: values.period,
      ...messageRulePayload(values),
    }
    const fresh = await apiGet<AgendaCalendar>(calendarKey(calendar.id))
    await updateCalendar(calendar.id, {
      schedulingNotificationConfig: replaceRule(fresh.schedulingNotificationConfig, rule, next),
    })
    form.reset(values)
    toast.success(t(rule ? "calendar.reminders.panel.saved" : "calendar.reminders.panel.created"))
    close()
  })

  const interval = form.watch("interval")
  const period = form.watch("period") as ReminderPeriod

  function test() {
    const values = form.getValues()
    setTesting({
      kind: "reminder",
      label: values.interval ? beforeLabel(t, values.interval, values.period) : t("calendar.reminders.panel.createTitle"),
      message: values.message,
      aiPrompt: values.mode === "ai" ? values.aiPrompt : "",
    })
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="lg"
      title={rule ? beforeLabel(t, rule.interval, rule.period) : t("calendar.reminders.panel.createTitle")}
      description={t("calendar.reminders.panel.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(rule ? "calendar.reminders.panel.submit" : "calendar.reminders.panel.create")}
          onCancel={close}
          requireChanges={Boolean(rule)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
          <NumberField
            control={form.control}
            name="interval"
            label={t("calendar.reminders.panel.interval")}
            min={1}
            max={CONTACT_INTERVAL_MAX[period]}
          />
          <SelectField
            control={form.control}
            name="period"
            label={t("calendar.reminders.panel.period")}
            options={periodOptions(t, interval)}
          />
        </div>

        <MessageRuleField control={form.control} kind="reminder" onTest={test} />

        {rule ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(rule)}
            >
              <Trash2 />
              {t("calendar.reminders.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>

      <MessageTestDialog
        calendar={calendar}
        target={testing}
        open={Boolean(testing)}
        onOpenChange={(next) => {
          if (!next) setTesting(null)
        }}
      />
    </ResponsiveDialog>
  )
}
