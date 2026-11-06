import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  BellOff,
  BellRing,
  Hand,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  Send,
  Trash2,
  WifiOff,
} from "lucide-react"
import { toast } from "sonner"

import { AccountAreaNav } from "@/components/people/area-nav"
import { Callout } from "@/components/shared/callout"
import {
  ErrorState,
  InlineError,
  ListSkeleton,
  PageBody,
  RelativeTime,
  SettingsSection,
  StatusBadge,
  useConfirm,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usePushSettings } from "@/hooks/people/use-push-settings"
import {
  browserFamily,
  describeUserAgent,
  isIosBrowser,
} from "@/lib/people/device-label"
import { errorMessage } from "@/lib/people/error-message"
import type { PushDevice } from "@/lib/people/types"

export default function NotificationsPage() {
  const { t } = useTranslation()
  const push = usePushSettings()

  return (
    <PageBody>
      <AccountAreaNav />

      <div className="flex flex-col gap-6">
        <SettingsSection
          title={t("people.notifications.device.title")}
          description={t("people.notifications.device.description")}
        >
          <DeviceStatus push={push} />
        </SettingsSection>

        <SettingsSection
          title={t("people.notifications.devices.title")}
          description={t("people.notifications.devices.description")}
        >
          <DeviceList push={push} />
        </SettingsSection>

        <SettingsSection
          title={t("people.notifications.about.title")}
          description={t("people.notifications.about.description")}
        >
          <ul className="flex flex-col gap-2 text-sm text-pretty text-muted-foreground">
            {(["closed", "click", "signOut", "pwa"] as const).map((point) => (
              <li key={point} className="flex gap-2.5">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                {t(`people.notifications.about.${point}`)}
              </li>
            ))}
          </ul>
        </SettingsSection>
      </div>
    </PageBody>
  )
}

type PushSettings = ReturnType<typeof usePushSettings>

/** O estado deste aparelho: suporte, permissão do navegador e inscrição, nesta ordem. */
function DeviceStatus({ push }: { push: PushSettings }) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const userAgent = navigator.userAgent

  if (push.isChecking) {
    return (
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-full max-w-sm" />
        <Skeleton className="h-8 w-32" />
      </div>
    )
  }

  if (!push.isSupported) {
    return (
      <Callout
        tone="neutral"
        role="status"
        icon={<BellOff />}
        title={t("people.notifications.unsupported.title")}
      >
        {isIosBrowser(userAgent)
          ? t("people.notifications.unsupported.ios")
          : t("people.notifications.unsupported.description")}
      </Callout>
    )
  }

  if (push.keyError) {
    return <ErrorState error={push.keyError} onRetry={push.reloadKey} />
  }

  if (!push.isAvailable) {
    return (
      <Callout
        tone="neutral"
        role="status"
        icon={<WifiOff />}
        title={t("people.notifications.unavailable.title")}
      >
        {t("people.notifications.unavailable.description")}
      </Callout>
    )
  }

  if (push.permission === "denied") {
    return (
      <div className="flex flex-col gap-3">
        <Callout
          tone="warning"
          role="status"
          icon={<Hand />}
          title={t("people.notifications.blocked.title")}
        >
          {t("people.notifications.blocked.description")}
        </Callout>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("people.notifications.blocked.howTo")}</p>
          <p className="text-sm text-pretty text-muted-foreground">
            {t(`people.notifications.blocked.steps.${browserFamily(userAgent)}`)}
          </p>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:h-10"
            aria-busy={rechecking}
            onClick={async () => {
              if (rechecking) return
              setRechecking(true)
              const answer = await push.recheckPermission()
              setRechecking(false)
              if (answer === "denied") toast(t("people.notifications.blocked.stillBlocked"))
            }}
          >
            {rechecking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("people.notifications.blocked.recheck")}
          </Button>
        </div>
      </div>
    )
  }

  async function enable() {
    const done = await push.subscribe()
    if (done) toast.success(t("people.notifications.enabled"))
  }

  async function disable() {
    const done = await push.unsubscribe()
    if (done) toast.success(t("people.notifications.disabled"))
  }

  async function sendTest() {
    if (testing) return
    setTesting(true)
    try {
      await push.sendTest()
      toast.success(t("people.notifications.testSent"))
    } catch (error) {
      toast.error(errorMessage(t, error))
    } finally {
      setTesting(false)
    }
  }

  const failure =
    push.error === "denied"
      ? t("people.notifications.failure.dismissed")
      : push.error
        ? t(`people.notifications.failure.${push.error}`)
        : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={
            push.isSubscribed
              ? "flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
              : "flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          }
        >
          {push.isSubscribed ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {push.isSubscribed
              ? t("people.notifications.state.on")
              : t("people.notifications.state.off")}
          </p>
          <p className="text-xs text-pretty text-muted-foreground">
            {push.isSubscribed
              ? t("people.notifications.state.onHint")
              : push.permission === "default"
                ? t("people.notifications.state.offAskHint")
                : t("people.notifications.state.offHint")}
          </p>
        </div>
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {push.isSubscribed ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              aria-busy={testing}
              onClick={() => void sendTest()}
            >
              {testing ? <Loader2 className="animate-spin" /> : <Send />}
              {t("people.notifications.test")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground pointer-coarse:h-10"
              aria-busy={push.isLoading}
              onClick={push.isLoading ? undefined : () => void disable()}
            >
              {push.isLoading ? <Loader2 className="animate-spin" /> : <BellOff />}
              {t("people.notifications.disable")}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            className="pointer-coarse:h-10"
            aria-busy={push.isLoading}
            onClick={push.isLoading ? undefined : () => void enable()}
          >
            {push.isLoading ? <Loader2 className="animate-spin" /> : <BellRing />}
            {t("people.notifications.enable")}
          </Button>
        )}
      </div>
    </div>
  )
}

function DeviceList({ push }: { push: PushSettings }) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  if (push.devicesError && !push.devices) {
    return (
      <div className="rounded-lg border border-dashed">
        <InlineError onRetry={() => void push.reloadDevices()} />
      </div>
    )
  }

  if (push.devicesLoading) {
    return (
      <div className="rounded-lg border px-3">
        <ListSkeleton rows={2} twoLines />
      </div>
    )
  }

  if (!push.devices || push.devices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
        {t("people.notifications.devices.empty")}
      </p>
    )
  }

  const label = (device: PushDevice) => {
    const { browser, system } = describeUserAgent(device.userAgent)
    if (browser && system) return t("people.notifications.devices.label", { browser, system })
    return browser ?? system ?? t("people.notifications.devices.unknown")
  }

  async function remove(device: PushDevice) {
    const name = label(device)
    const confirmed = await confirm({
      title: t("people.notifications.devices.removeTitle", { name }),
      description: t("people.notifications.devices.removeDescription"),
      confirmLabel: t("people.notifications.devices.remove"),
      destructive: true,
      onConfirm: () => push.removeDevice(device),
    })
    if (confirmed) toast.success(t("people.notifications.devices.removed", { name }))
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {push.devices.map((device) => (
        <li key={device.id} className="flex items-center gap-3 py-2 pr-1.5 pl-3">
          <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
              <span className="truncate">{label(device)}</span>
              {device.endpoint === push.endpoint ? (
                <StatusBadge tone="accent" dot={false} className="font-normal">
                  {t("people.notifications.devices.thisOne")}
                </StatusBadge>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("people.notifications.devices.since")}{" "}
              <RelativeTime value={device.createdAt} />
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("people.notifications.devices.removeAria", { name: label(device) })}
            className="text-muted-foreground"
            onClick={() => void remove(device)}
          >
            <Trash2 />
          </Button>
        </li>
      ))}
    </ul>
  )
}
