import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, CalendarSync, Loader2, ServerOff, Unlink } from "lucide-react"
import { toast } from "sonner"

import { Callout, SettingsSection, StatusBadge, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCalendarMutations } from "@/hooks/calendar/use-calendars"
import { ApiError } from "@/lib/api"
import { formatInZone, safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { calendarErrorMessage } from "./error-message"

/**
 * A conexão com o Google Agenda. Sem credencial no servidor, a seção explica e não oferece botão:
 * o resto do calendário funciona igual, e um botão que só leva a erro não ajuda ninguém.
 */
export function GoogleSection({ calendar }: { calendar: AgendaCalendar }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { connectGoogle, disconnectGoogle } = useCalendarMutations()

  const [connecting, setConnecting] = useState(false)
  // O servidor pode perder a credencial depois de a página abrir: vale o que ele respondeu.
  const [refused, setRefused] = useState(false)

  const connector = calendar.googleCalendarConnector
  const available = calendar.googleCalendarAvailable && !refused
  const connected = calendar.googleCalendarConnected
  const failed = !connected && connector?.status === "failed"

  async function connect() {
    if (connecting) return
    setConnecting(true)
    try {
      const { authorizationUrl } = await connectGoogle(calendar.id)
      // A tela vai embora: o botão continua "carregando" até a página do Google abrir.
      window.location.assign(authorizationUrl)
    } catch (cause) {
      setConnecting(false)
      if (cause instanceof ApiError && cause.code === "googleNotConfigured") setRefused(true)
      else toast.error(calendarErrorMessage(t, cause))
    }
  }

  async function disconnect() {
    const confirmed = await confirm({
      title: t("calendar.google.disconnect.title"),
      description: t("calendar.google.disconnect.description"),
      confirmLabel: t("calendar.google.disconnect.confirm"),
      destructive: true,
      onConfirm: () => disconnectGoogle(calendar.id),
    })
    if (confirmed) toast.success(t("calendar.google.disconnect.done"))
  }

  const connectButton = (
    <Button
      type="button"
      variant={failed ? "outline" : "default"}
      aria-busy={connecting}
      className={connecting ? "pointer-events-none opacity-80 pointer-coarse:h-10" : "pointer-coarse:h-10"}
      onClick={() => void connect()}
    >
      {connecting ? <Loader2 className="animate-spin" /> : <CalendarSync />}
      {t(failed ? "calendar.google.reconnect" : "calendar.google.connect")}
    </Button>
  )

  const disconnectButton = (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive pointer-coarse:h-10"
      onClick={() => void disconnect()}
    >
      <Unlink />
      {t("calendar.google.disconnect.action")}
    </Button>
  )

  return (
    <SettingsSection title={t("calendar.google.title")} description={t("calendar.google.description")}>
      {connected ? (
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <StatusBadge tone="success">{t("calendar.google.connected")}</StatusBadge>
            <p className="text-sm break-words">
              {connector?.googleEmail ?? t("calendar.google.unknownAccount")}
            </p>
            {connector?.connectedAt ? (
              <p className="text-xs text-muted-foreground">
                {t("calendar.google.connectedAt", {
                  date: formatInZone(connector.connectedAt, safeTimeZone(calendar.timeZone), language, {
                    dateStyle: "long",
                  }),
                })}
              </p>
            ) : null}
          </div>
          <div className="-ml-2.5">{disconnectButton}</div>
        </div>
      ) : failed ? (
        <div className="flex flex-col gap-3">
          <Callout
            tone="danger"
            role="alert"
            icon={<AlertTriangle />}
            title={t("calendar.google.failed")}
            action={available ? connectButton : undefined}
          >
            {connector?.errorMessage || t("calendar.google.failedHint")}
          </Callout>
          {!available ? (
            <p className="text-xs text-muted-foreground">{t("calendar.google.failedUnavailable")}</p>
          ) : null}
          <div className="-ml-2.5">{disconnectButton}</div>
        </div>
      ) : available ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-pretty text-muted-foreground">{t("calendar.google.notConnected")}</p>
          {connectButton}
        </div>
      ) : (
        <Callout
          icon={<ServerOff />}
          title={t("calendar.google.unavailable.title")}
        >
          {t("calendar.google.unavailable.description")}
        </Callout>
      )}

      {connected || failed || available ? (
        <ul className="space-y-1.5 text-xs leading-snug text-pretty text-muted-foreground">
          <li>{t("calendar.google.sync.toGoogle")}</li>
          <li>{t("calendar.google.sync.fromGoogle")}</li>
          <li>{t("calendar.google.sync.scope")}</li>
        </ul>
      ) : null}
    </SettingsSection>
  )
}
