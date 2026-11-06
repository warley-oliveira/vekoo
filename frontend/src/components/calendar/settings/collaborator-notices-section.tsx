import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { AlertTriangle, BellRing, MessageCircleWarning, Pencil, Plus, Trash2 } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"

import {
  Callout,
  EmptyState,
  InlineError,
  SelectInput,
  SettingsSection,
  StatusBadge,
  useConfirm,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useCan } from "@/hooks/use-can"
import { calendarKey, useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { useProfessionals } from "@/hooks/calendar/use-professionals"
import { useConnectors } from "@/hooks/connectors/use-connectors"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { apiGet } from "@/lib/api"
import type {
  AgendaCalendar,
  ProfessionalEventName,
  ProfessionalEventRule,
  ProfessionalReminderRule,
} from "@/lib/calendar/types"
import { connectorHandle, hasRealName } from "@/lib/connectors/channels"
import type { Connector } from "@/lib/connectors/types"
import { CollaboratorReminderPanel } from "./collaborator-reminder-panel"
import { calendarErrorMessage } from "./error-message"
import { EventMessagePanel } from "./event-message-panel"
import { beforeLabel, MAX_RULES, removeRule } from "./rule-helpers"
import { RuleRow } from "./rule-row"

/** Só canal não oficial entrega: a API oficial recusa texto livre fora da janela de 24 horas. */
function isDeliverable(connector: Connector): boolean {
  return (connector.type === "whatsapp_web" || connector.type === "zapi") && connector.status === "active"
}

function channelLabel(connector: Connector, t: TFunction): string {
  const handle = connectorHandle(connector)
  const profile = "profileName" in connector ? connector.profileName : null
  const name = profile || (hasRealName(connector) ? connector.name : null) || handle
  if (!name) return t("calendar.settings.notices.channel.unnamed")
  return handle && handle !== name ? `${name} · ${handle}` : name
}

type ReminderPanelState = { rule: ProfessionalReminderRule | null }

/** O que o colaborador recebe: canal, avisos por evento e lembretes antes do agendamento. */
export function CollaboratorNoticesSection({ calendar }: { calendar: AgendaCalendar }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const canManageChannels = useCan("core_settings")
  const { updateCalendar } = useCalendarMutations()
  const { professionals } = useProfessionals(calendar.id)
  const { data: connectorsData, error: connectorsError, isLoading: connectorsLoading, mutate: reloadConnectors } = useConnectors()

  const connectors = connectorsData?.connectors
  const channels = useMemo(() => (connectors ?? []).filter(isDeliverable), [connectors])
  // Enquanto a lista não chega, não dá para dizer que não há canal.
  const whatsappAvailable = connectors ? channels.length > 0 : true
  const withoutPhone = (professionals ?? []).filter((professional) => !professional.phone).length

  /* ---------- canal ---------- */

  const [pendingChannel, setPendingChannel] = useState<{ id: string | null } | null>(null)
  const selectedChannel = pendingChannel ? pendingChannel.id : calendar.professionalWhatsappConnectorId
  const chosen = connectors?.find((connector) => connector.id === selectedChannel) ?? null
  const chosenIsGone = Boolean(selectedChannel && connectors && (!chosen || !isDeliverable(chosen)))

  const channelOptions = useMemo<SelectOption[]>(() => {
    const options = channels.map((connector) => ({ value: connector.id, label: channelLabel(connector, t) }))
    if (chosen && !isDeliverable(chosen)) {
      options.push({
        value: chosen.id,
        label: t("calendar.settings.notices.channel.disconnected", { name: channelLabel(chosen, t) }),
      })
    }
    return options
  }, [channels, chosen, t])

  async function chooseChannel(id: string | null) {
    setPendingChannel({ id })
    try {
      await updateCalendar(calendar.id, { professionalWhatsappConnectorId: id })
      toast.success(t("calendar.settings.notices.channel.saved"))
    } catch (cause) {
      toast.error(calendarErrorMessage(t, cause))
    } finally {
      setPendingChannel(null)
    }
  }

  /* ---------- avisos por evento ---------- */

  type Change = Partial<Pick<ProfessionalEventRule, "push" | "whatsapp">> & { message?: string | null }
  const [pendingEvents, setPendingEvents] = useState<Partial<Record<ProfessionalEventName, Change>>>({})

  // Só o que mudou vai para a lista: um evento nunca editado continua seguindo o texto padrão.
  async function saveEvent(event: ProfessionalEventName, change: Change) {
    const fresh = await apiGet<AgendaCalendar>(calendarKey(calendar.id))
    const stored = fresh.professionalEventNotifications.find((rule) => rule.event === event)
    const resolved = fresh.professionalEventRules.find((rule) => rule.event === event)
    const next = {
      push: resolved?.push ?? true,
      whatsapp: resolved?.whatsapp ?? true,
      ...stored,
      ...change,
      event,
    } as ProfessionalEventRule
    await updateCalendar(calendar.id, {
      professionalEventNotifications: [
        ...fresh.professionalEventNotifications.filter((rule) => rule.event !== event),
        next,
      ],
    })
  }

  async function toggleEvent(rule: ProfessionalEventRule, channel: "push" | "whatsapp", value: boolean) {
    setPendingEvents((current) => ({ ...current, [rule.event]: { ...current[rule.event], [channel]: value } }))
    try {
      await saveEvent(rule.event, { [channel]: value })
      toast.success(t(`calendar.settings.notices.events.${rule.event}.saved`))
    } catch (cause) {
      toast.error(calendarErrorMessage(t, cause))
    } finally {
      setPendingEvents((current) => {
        const next = { ...current }
        delete next[rule.event]
        return next
      })
    }
  }

  const [eventPanel, setEventPanel] = useState<ProfessionalEventRule | null>(null)
  const eventPanelKey = useOpenCount(Boolean(eventPanel))
  const shownEventPanel = useRetained(eventPanel)

  /* ---------- lembretes ---------- */

  const rules = calendar.professionalNotificationsSettings
  const atLimit = rules.length >= MAX_RULES
  const [reminderPanel, setReminderPanel] = useState<ReminderPanelState | null>(null)
  const reminderPanelKey = useOpenCount(Boolean(reminderPanel))
  const shownReminderPanel = useRetained(reminderPanel)

  async function removeReminder(rule: ProfessionalReminderRule) {
    const confirmed = await confirm({
      title: t("calendar.settings.notices.reminder.delete.title", {
        when: beforeLabel(t, rule.timeBefore, rule.period),
      }),
      description: t("calendar.settings.notices.reminder.delete.description"),
      confirmLabel: t("calendar.settings.notices.reminder.delete.confirm"),
      destructive: true,
      onConfirm: async () => {
        const fresh = await apiGet<AgendaCalendar>(calendarKey(calendar.id))
        await updateCalendar(calendar.id, {
          professionalNotificationsSettings: removeRule(fresh.professionalNotificationsSettings, rule),
        })
      },
    })
    if (confirmed) {
      setReminderPanel(null)
      toast.success(t("calendar.settings.notices.reminder.delete.done"))
    }
  }

  return (
    <SettingsSection
      title={t("calendar.settings.notices.title")}
      description={t("calendar.settings.notices.description")}
    >
      {connectorsError && !connectors ? (
        <div className="rounded-lg border border-dashed">
          <InlineError onRetry={() => void reloadConnectors()} />
        </div>
      ) : connectors && channels.length === 0 ? (
        <Callout
          tone="warning"
          icon={<MessageCircleWarning />}
          title={t("calendar.settings.notices.noChannel.title")}
          action={
            canManageChannels ? (
              <Button
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
                nativeButton={false}
                render={<Link to="/settings/integrations" />}
              >
                {t("calendar.settings.notices.noChannel.action")}
              </Button>
            ) : undefined
          }
        >
          {t("calendar.settings.notices.noChannel.description")}
        </Callout>
      ) : null}

      {withoutPhone > 0 && whatsappAvailable ? (
        <Callout
          tone="warning"
          icon={<AlertTriangle />}
          action={
            <Button
              variant="outline"
              size="sm"
              className="pointer-coarse:h-10"
              nativeButton={false}
              render={<Link to={`/calendar/${calendar.id}/collaborators`} />}
            >
              {t("calendar.settings.notices.missingPhoneAction")}
            </Button>
          }
        >
          {t("calendar.settings.notices.missingPhone", { count: withoutPhone })}
        </Callout>
      ) : null}

      {connectorsLoading && !connectors ? (
        <div aria-hidden className="space-y-1.5">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-8 w-full pointer-coarse:h-10" />
        </div>
      ) : channelOptions.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="collaborator-channel">{t("calendar.settings.notices.channel.label")}</Label>
          <SelectInput
            id="collaborator-channel"
            options={channelOptions}
            value={selectedChannel}
            onChange={(id) => void chooseChannel(id)}
            clearLabel={t("calendar.settings.notices.channel.inherit")}
            placeholder={t("calendar.settings.notices.channel.inherit")}
            disabled={Boolean(pendingChannel)}
          />
          <p className="text-xs leading-snug text-pretty text-muted-foreground">
            {chosenIsGone
              ? t("calendar.settings.notices.channel.goneHint")
              : t("calendar.settings.notices.channel.hint")}
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="space-y-0.5">
          <h3 className="text-sm leading-snug font-medium">{t("calendar.settings.notices.events.title")}</h3>
          <p className="text-xs leading-snug text-pretty text-muted-foreground">
            {t("calendar.settings.notices.events.hint")}
          </p>
        </div>
        <ul className="flex flex-col divide-y">
          {calendar.professionalEventRules.map((rule) => {
            const pending = pendingEvents[rule.event]
            const push = pending?.push ?? rule.push
            const whatsapp = pending?.whatsapp ?? rule.whatsapp
            return (
              <li key={rule.event} className="space-y-2 py-3 first:pt-1">
                <div className="space-y-0.5">
                  <p className="text-sm leading-snug">{t(`calendar.settings.notices.events.${rule.event}.title`)}</p>
                  <p className="text-xs leading-snug text-pretty text-muted-foreground">
                    {t(`calendar.settings.notices.events.${rule.event}.description`)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <label className="flex cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-10">
                    <Switch
                      checked={push}
                      disabled={Boolean(pending)}
                      onCheckedChange={(checked) => void toggleEvent(rule, "push", checked)}
                    />
                    {t("calendar.settings.notices.channels.push")}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-10">
                    <Switch
                      checked={whatsapp && whatsappAvailable}
                      disabled={Boolean(pending) || !whatsappAvailable}
                      onCheckedChange={(checked) => void toggleEvent(rule, "whatsapp", checked)}
                    />
                    {t("calendar.settings.notices.channels.whatsapp")}
                  </label>
                </div>
                {whatsapp && whatsappAvailable ? (
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 min-w-0 text-sm text-pretty break-words text-muted-foreground">
                      {rule.message}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("calendar.settings.notices.eventMessage.editOf", {
                        event: t(`calendar.settings.notices.events.${rule.event}.title`),
                      })}
                      className="-my-0.5 shrink-0 pointer-coarse:h-10"
                      onClick={() => setEventPanel(rule)}
                    >
                      <Pencil />
                      {t("calendar.settings.notices.eventMessage.edit")}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>

      <div className="space-y-2 border-t pt-4">
        <div className="space-y-0.5">
          <h3 className="text-sm leading-snug font-medium">{t("calendar.settings.notices.reminder.title")}</h3>
          <p className="text-xs leading-snug text-pretty text-muted-foreground">
            {t("calendar.settings.notices.reminder.hint")}
          </p>
        </div>

        {rules.length === 0 ? (
          <EmptyState
            icon={<BellRing className="size-5" />}
            title={t("calendar.settings.notices.reminder.empty.title")}
            description={t("calendar.settings.notices.reminder.empty.description")}
            action={{
              label: t("calendar.settings.notices.reminder.add"),
              onClick: () => setReminderPanel({ rule: null }),
            }}
          />
        ) : (
          <>
            <ul className="flex flex-col">
              {rules.map((rule, index) => {
                const when = beforeLabel(t, rule.timeBefore, rule.period)
                return (
                  <RuleRow
                    key={index}
                    title={when}
                    badges={
                      <>
                        {rule.push !== false ? (
                          <StatusBadge tone="neutral" dot={false}>
                            {t("calendar.settings.notices.channels.pushShort")}
                          </StatusBadge>
                        ) : null}
                        {rule.whatsapp !== false && whatsappAvailable ? (
                          <StatusBadge tone="neutral" dot={false}>
                            {t("calendar.settings.notices.channels.whatsappShort")}
                          </StatusBadge>
                        ) : null}
                      </>
                    }
                    text={rule.message}
                    onOpen={() => setReminderPanel({ rule })}
                    actionsLabel={t("calendar.settings.notices.reminder.actionsOf", { when })}
                    actions={[
                      {
                        label: t("calendar.settings.notices.reminder.edit"),
                        icon: <Pencil />,
                        onSelect: () => setReminderPanel({ rule }),
                      },
                      {
                        label: t("calendar.settings.notices.reminder.delete.action"),
                        icon: <Trash2 />,
                        destructive: true,
                        separatorBefore: true,
                        onSelect: () => void removeReminder(rule),
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
                onClick={() => setReminderPanel({ rule: null })}
              >
                <Plus />
                {t("calendar.settings.notices.reminder.add")}
              </Button>
              {atLimit ? (
                <p className="text-xs text-muted-foreground">
                  {t("calendar.settings.notices.reminder.limit", { max: MAX_RULES })}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {shownEventPanel ? (
        <EventMessagePanel
          key={eventPanelKey}
          rule={shownEventPanel}
          open={Boolean(eventPanel)}
          onOpenChange={(next) => {
            if (!next) setEventPanel(null)
          }}
          onSave={async (message) => {
            await saveEvent(shownEventPanel.event, { message })
            toast.success(t(`calendar.settings.notices.events.${shownEventPanel.event}.saved`))
          }}
        />
      ) : null}

      {shownReminderPanel ? (
        <CollaboratorReminderPanel
          key={reminderPanelKey}
          calendar={calendar}
          rule={shownReminderPanel.rule}
          whatsappAvailable={whatsappAvailable}
          open={Boolean(reminderPanel)}
          onOpenChange={(next) => {
            if (!next) setReminderPanel(null)
          }}
          onDelete={(rule) => void removeReminder(rule)}
        />
      ) : null}
    </SettingsSection>
  )
}
