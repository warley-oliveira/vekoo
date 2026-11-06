import { useState } from "react"
import { useTranslation } from "react-i18next"
import { BellOff, BellRing, FlaskConical, Pencil, Plus, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  Callout,
  EmptyState,
  SettingsSection,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { calendarKey, useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { apiGet } from "@/lib/api"
import type { AgendaCalendar, ContactReminderRule } from "@/lib/calendar/types"
import { InstantSwitch } from "./instant-switch"
import { MessageTestDialog, type MessageTestTarget } from "./message-test-dialog"
import { ReminderRulePanel } from "./reminder-rule-panel"
import { beforeLabel, MAX_RULES, removeRule } from "./rule-helpers"
import { RuleRow } from "./rule-row"
import { useCalendarFlags } from "./use-calendar-flags"

type PanelState = { rule: ContactReminderRule | null }

/** O que sai na conversa do contato antes de cada agendamento. */
export function ContactRemindersSection({ calendar }: { calendar: AgendaCalendar }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { updateCalendar } = useCalendarMutations()
  const flags = useCalendarFlags(calendar)

  const [panel, setPanel] = useState<PanelState | null>(null)
  const panelKey = useOpenCount(Boolean(panel))
  const shownPanel = useRetained(panel)
  const [testing, setTesting] = useState<MessageTestTarget | null>(null)

  const rules = calendar.schedulingNotificationConfig
  const enabled = flags.value("schedulingNotificationEnabled")
  const atLimit = rules.length >= MAX_RULES

  async function remove(rule: ContactReminderRule) {
    const confirmed = await confirm({
      title: t("calendar.reminders.delete.title", { when: beforeLabel(t, rule.interval, rule.period) }),
      description: t("calendar.reminders.delete.description"),
      confirmLabel: t("calendar.reminders.delete.confirm"),
      destructive: true,
      onConfirm: async () => {
        const fresh = await apiGet<AgendaCalendar>(calendarKey(calendar.id))
        await updateCalendar(calendar.id, {
          schedulingNotificationConfig: removeRule(fresh.schedulingNotificationConfig, rule),
        })
      },
    })
    if (confirmed) {
      setPanel(null)
      toast.success(t("calendar.reminders.delete.done"))
    }
  }

  const test = (rule: ContactReminderRule) =>
    setTesting({
      kind: "reminder",
      label: beforeLabel(t, rule.interval, rule.period),
      message: rule.message ?? "",
      aiPrompt: rule.aiPrompt ?? "",
    })

  return (
    <SettingsSection
      title={t("calendar.reminders.title")}
      description={t("calendar.reminders.description")}
    >
      <InstantSwitch
        label={t("calendar.reminders.enabled.label")}
        hint={t("calendar.reminders.enabled.hint")}
        checked={enabled}
        disabled={flags.isSaving("schedulingNotificationEnabled")}
        onCheckedChange={(checked) =>
          void flags.setFlag(
            "schedulingNotificationEnabled",
            checked,
            t(checked ? "calendar.reminders.enabled.on" : "calendar.reminders.enabled.off")
          )
        }
      />

      {calendar.calendarType === "class_group" ? (
        <Callout>{t("calendar.reminders.classGroupNote")}</Callout>
      ) : null}

      {!enabled && rules.length > 0 ? (
        <Callout icon={<BellOff />}>{t("calendar.reminders.paused")}</Callout>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-5" />}
          title={t("calendar.reminders.empty.title")}
          description={t("calendar.reminders.empty.description")}
          action={{ label: t("calendar.reminders.create"), onClick: () => setPanel({ rule: null }) }}
        />
      ) : (
        <div className="space-y-2">
          <ul className="flex flex-col">
            {rules.map((rule, index) => {
              const when = beforeLabel(t, rule.interval, rule.period)
              const usesAi = Boolean(rule.aiPrompt?.trim())
              return (
                <RuleRow
                  key={index}
                  title={when}
                  badges={
                    usesAi ? (
                      <StatusBadge tone="accent" dot={false} icon={<Sparkles />}>
                        {t("calendar.reminders.badges.ai")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral" dot={false}>
                        {t("calendar.reminders.badges.text")}
                      </StatusBadge>
                    )
                  }
                  text={usesAi ? rule.aiPrompt : rule.message}
                  onOpen={() => setPanel({ rule })}
                  actionsLabel={t("calendar.reminders.actionsOf", { when })}
                  actions={[
                    {
                      label: t("calendar.reminders.edit"),
                      icon: <Pencil />,
                      onSelect: () => setPanel({ rule }),
                    },
                    {
                      label: t("calendar.reminders.test.trigger.reminder"),
                      icon: <FlaskConical />,
                      onSelect: () => test(rule),
                    },
                    {
                      label: t("calendar.reminders.delete.action"),
                      icon: <Trash2 />,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => void remove(rule),
                    },
                  ]}
                />
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={atLimit}
              className="pointer-coarse:h-10"
              onClick={() => setPanel({ rule: null })}
            >
              <Plus />
              {t("calendar.reminders.create")}
            </Button>
            {atLimit ? (
              <p className="text-xs text-muted-foreground">
                {t("calendar.reminders.limit", { max: MAX_RULES })}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t pt-4">
        <div className="space-y-0.5">
          <h3 className="text-sm leading-snug font-medium">{t("calendar.reminders.automation.title")}</h3>
          <p className="text-xs leading-snug text-pretty text-muted-foreground">
            {t("calendar.reminders.automation.description")}
          </p>
        </div>
        <InstantSwitch
          label={t("calendar.reminders.automation.reactivate.label")}
          hint={t("calendar.reminders.automation.reactivate.hint")}
          checked={flags.value("schedulingNotificationReactivateAutomation")}
          disabled={flags.isSaving("schedulingNotificationReactivateAutomation")}
          onCheckedChange={(checked) =>
            void flags.setFlag(
              "schedulingNotificationReactivateAutomation",
              checked,
              t("calendar.reminders.automation.saved")
            )
          }
        />
        <InstantSwitch
          label={t("calendar.reminders.automation.ignore.label")}
          hint={t("calendar.reminders.automation.ignore.hint")}
          checked={flags.value("schedulingNotificationIgnoreAutomationPaused")}
          disabled={flags.isSaving("schedulingNotificationIgnoreAutomationPaused")}
          onCheckedChange={(checked) =>
            void flags.setFlag(
              "schedulingNotificationIgnoreAutomationPaused",
              checked,
              t("calendar.reminders.automation.saved")
            )
          }
        />
      </div>

      {shownPanel ? (
        <ReminderRulePanel
          key={panelKey}
          calendar={calendar}
          rule={shownPanel.rule}
          open={Boolean(panel)}
          onOpenChange={(next) => {
            if (!next) setPanel(null)
          }}
          onDelete={(rule) => void remove(rule)}
        />
      ) : null}

      <MessageTestDialog
        calendar={calendar}
        target={testing}
        open={Boolean(testing)}
        onOpenChange={(next) => {
          if (!next) setTesting(null)
        }}
      />
    </SettingsSection>
  )
}
