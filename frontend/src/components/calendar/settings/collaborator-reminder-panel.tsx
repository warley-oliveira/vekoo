import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  FormActions,
  NumberField,
  SelectField,
  SidePanel,
  SwitchField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { calendarKey, useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { apiGet } from "@/lib/api"
import type { AgendaCalendar, ProfessionalReminderRule, ReminderPeriod } from "@/lib/calendar/types"
import { InstantSwitch } from "./instant-switch"
import { MESSAGE_TOKENS } from "./message-rule"
import { beforeLabel, COLLABORATOR_INTERVAL_MAX, periodOptions, replaceRule } from "./rule-helpers"
import { VariableTextarea } from "./variable-textarea"

export const NOTICE_MESSAGE_MAX = 300

function buildSchema(t: TFunction) {
  return z
    .object({
      timeBefore: z.number().nullable(),
      period: z.enum(["minutes", "hours", "days"]),
      push: z.boolean(),
      whatsapp: z.boolean(),
      message: z
        .string()
        .trim()
        .min(1, t("calendar.settings.notices.reminder.messageRequired"))
        .max(NOTICE_MESSAGE_MAX, t("calendar.settings.notices.messageTooLong", { max: NOTICE_MESSAGE_MAX })),
    })
    .superRefine((values, ctx) => {
      const max = COLLABORATOR_INTERVAL_MAX[values.period]
      if (values.timeBefore === null) {
        ctx.addIssue({ code: "custom", path: ["timeBefore"], message: t("calendar.reminders.panel.intervalRequired") })
      } else if (!Number.isInteger(values.timeBefore) || values.timeBefore < 1) {
        ctx.addIssue({ code: "custom", path: ["timeBefore"], message: t("calendar.reminders.panel.intervalInvalid") })
      } else if (values.timeBefore > max) {
        ctx.addIssue({ code: "custom", path: ["timeBefore"], message: t("calendar.reminders.panel.intervalTooBig", { max }) })
      }
    })
}

type CollaboratorReminderValues = z.infer<ReturnType<typeof buildSchema>>

type CollaboratorReminderPanelProps = {
  calendar: AgendaCalendar
  /** Sem regra, o painel cria. */
  rule: ProfessionalReminderRule | null
  /** Sem canal que entregue, o WhatsApp fica desligado e explicado na seção. */
  whatsappAvailable: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (rule: ProfessionalReminderRule) => void
}

export function CollaboratorReminderPanel({
  calendar,
  rule,
  whatsappAvailable,
  open,
  onOpenChange,
  onDelete,
}: CollaboratorReminderPanelProps) {
  const { t } = useTranslation()
  const { updateCalendar } = useCalendarMutations()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<CollaboratorReminderValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      timeBefore: rule?.timeBefore ?? 1,
      period: rule?.period ?? "hours",
      // Regra salva sem as chaves: ausente vale ligado.
      push: rule?.push !== false,
      whatsapp: rule?.whatsapp !== false,
      message: rule?.message ?? t("calendar.settings.notices.reminder.defaultMessage", MESSAGE_TOKENS),
    },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  const submit = useFormSubmit(form, async (values) => {
    const next: ProfessionalReminderRule = {
      timeBefore: values.timeBefore as number,
      period: values.period,
      message: values.message,
      push: values.push,
      whatsapp: values.whatsapp,
    }
    const fresh = await apiGet<AgendaCalendar>(calendarKey(calendar.id))
    await updateCalendar(calendar.id, {
      professionalNotificationsSettings: replaceRule(fresh.professionalNotificationsSettings, rule, next),
    })
    form.reset(values)
    toast.success(
      t(rule ? "calendar.settings.notices.reminder.saved" : "calendar.settings.notices.reminder.created")
    )
    close()
  })

  const timeBefore = form.watch("timeBefore")
  const period = form.watch("period") as ReminderPeriod
  const push = form.watch("push")
  const whatsapp = form.watch("whatsapp")
  const silent = !push && (!whatsapp || !whatsappAvailable)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={
        rule
          ? beforeLabel(t, rule.timeBefore, rule.period)
          : t("calendar.settings.notices.reminder.createTitle")
      }
      description={t("calendar.settings.notices.reminder.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(
            rule ? "calendar.settings.notices.reminder.submit" : "calendar.settings.notices.reminder.create"
          )}
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
            name="timeBefore"
            label={t("calendar.reminders.panel.interval")}
            min={1}
            max={COLLABORATOR_INTERVAL_MAX[period]}
          />
          <SelectField
            control={form.control}
            name="period"
            label={t("calendar.reminders.panel.period")}
            options={periodOptions(t, timeBefore)}
          />
        </div>
        <div className="flex flex-col gap-3">
          <SwitchField
            control={form.control}
            name="push"
            label={t("calendar.settings.notices.channels.push")}
            hint={t("calendar.settings.notices.channels.pushHint")}
          />
          {whatsappAvailable ? (
            <SwitchField
              control={form.control}
              name="whatsapp"
              label={t("calendar.settings.notices.channels.whatsapp")}
              hint={t("calendar.settings.notices.channels.whatsappHint")}
            />
          ) : (
            // Sem canal, aparece desligado, e a escolha guardada volta a valer quando houver um.
            <InstantSwitch
              label={t("calendar.settings.notices.channels.whatsapp")}
              hint={t("calendar.settings.notices.channels.whatsappUnavailable")}
              checked={false}
              disabled
              onCheckedChange={() => undefined}
            />
          )}
        </div>
        {silent ? <Callout tone="warning">{t("calendar.settings.notices.reminder.silent")}</Callout> : null}
        <VariableTextarea
          control={form.control}
          name="message"
          label={t("calendar.settings.notices.reminder.message")}
          hint={t("calendar.settings.notices.reminder.messageHint")}
          maxLength={NOTICE_MESSAGE_MAX}
          showCount
        />

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
              {t("calendar.settings.notices.reminder.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
