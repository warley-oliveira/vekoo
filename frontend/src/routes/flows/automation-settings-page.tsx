import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"

import {
  Callout,
  ErrorState,
  NumberInput,
  PageBody,
  PageHeader,
  SelectInput,
  SettingsSection,
  DetailSkeleton,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useAutomationSettings } from "@/hooks/flows/use-automation-settings"
import { useCan } from "@/hooks/use-can"
import { ApiError } from "@/lib/api"
import type { AutomationSettings, BusinessDay } from "@/lib/flows/types"

// Como a automação se comporta nas conversas. É pequena de propósito: o interruptor vale na hora, e o que é mais de um
// campo tem o próprio "Salvar". Ler é aberto a quem vê fluxos; mudar pede `core_settings`, como a API.

const WEEK = [1, 2, 3, 4, 5, 6, 0]

export default function AutomationSettingsPage() {
  const { t } = useTranslation()
  const { settings, error, isLoading, reload, update } = useAutomationSettings()
  const canEdit = useCan("core_settings")

  const apply = async (patch: Partial<AutomationSettings>) => {
    try {
      await update(patch)
      toast.success(t("flows.settings.saved"))
      return true
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : t("flows.settings.failed"))
      return false
    }
  }

  return (
    <PageBody>
      <PageHeader backTo="/flows" parentTitle={t("navigation.flows")} description={t("flows.settings.description")} />
      {error && !settings ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !settings ? (
        <DetailSkeleton rows={6} />
      ) : (
        <div className="flex flex-col gap-6 md:gap-8">
          {!canEdit ? <Callout className="mb-4">{t("flows.settings.readOnly")}</Callout> : null}

          <SettingsSection title={t("flows.settings.mainTitle")} description={t("flows.settings.mainHint")}>
            <div className="flex flex-col gap-4">
              <ToggleRow
                id="automation-enabled"
                label={t("flows.settings.enabled")}
                hint={t("flows.settings.enabledHint")}
                checked={settings.automationEnabled}
                disabled={!canEdit}
                onChange={(automationEnabled) => void apply({ automationEnabled })}
              />
              <ToggleRow
                id="automation-default"
                label={t("flows.settings.defaultEnabled")}
                hint={t("flows.settings.defaultEnabledHint")}
                checked={settings.defaultAutomationEnabled}
                disabled={!canEdit}
                onChange={(defaultAutomationEnabled) => void apply({ defaultAutomationEnabled })}
              />
            </div>
          </SettingsSection>

          <DebounceSection settings={settings} disabled={!canEdit} onSave={apply} />
          <PauseSection settings={settings} disabled={!canEdit} onSave={apply} />
          <BusinessHoursSection settings={settings} disabled={!canEdit} onSave={apply} />
          <ClearContextSection settings={settings} disabled={!canEdit} onSave={apply} />
        </div>
      )}
    </PageBody>
  )
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="mt-1 text-sm text-pretty text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

type SectionProps = {
  settings: AutomationSettings
  disabled: boolean
  onSave: (patch: Partial<AutomationSettings>) => Promise<boolean>
}

function SaveRow({ dirty, busy, disabled, onSave }: { dirty: boolean; busy: boolean; disabled: boolean; onSave: () => void }) {
  const { t } = useTranslation()
  if (disabled || !dirty) return null
  return (
    <div className="flex justify-end">
      <Button type="button" size="sm" disabled={!dirty || busy} onClick={onSave}>
        {t("flows.settings.save")}
      </Button>
    </div>
  )
}

/** A mesma trava do disparo no servidor. */
const MAX_DEBOUNCE_SECONDS = 60

function DebounceSection({ settings, disabled, onSave }: SectionProps) {
  const { t } = useTranslation()
  const [seconds, setSeconds] = useState<number | null>(settings.flowDebounceSeconds)
  const [busy, setBusy] = useState(false)
  const dirty = seconds !== null && seconds !== settings.flowDebounceSeconds

  return (
    <SettingsSection title={t("flows.settings.debounceTitle")} description={t("flows.settings.debounceHint")}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="debounce-seconds">{t("flows.settings.debounceLabel")}</Label>
          <NumberInput
            id="debounce-seconds"
            aria-describedby="debounce-seconds-hint"
            className="max-w-48"
            steppers
            disabled={disabled}
            min={0}
            max={MAX_DEBOUNCE_SECONDS}
            value={seconds}
            onChange={setSeconds}
          />
          <p id="debounce-seconds-hint" className="text-xs text-muted-foreground">
            {t("flows.settings.debounceRange", { max: MAX_DEBOUNCE_SECONDS })}
          </p>
        </div>
        <SaveRow
          dirty={dirty}
          busy={busy}
          disabled={disabled}
          onSave={() => {
            setBusy(true)
            void onSave({ flowDebounceSeconds: seconds ?? 0 }).finally(() => setBusy(false))
          }}
        />
      </div>
    </SettingsSection>
  )
}

function PauseSection({ settings, disabled, onSave }: SectionProps) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState(settings.automationPausePeriod)
  const [amount, setAmount] = useState<number | null>(settings.automationPauseTimeTo)
  const [busy, setBusy] = useState(false)
  const dirty = period !== settings.automationPausePeriod || amount !== settings.automationPauseTimeTo

  return (
    <SettingsSection title={t("flows.settings.pauseTitle")} description={t("flows.settings.pauseHint")}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pause-period">{t("flows.settings.pausePeriod")}</Label>
            <SelectInput
              id="pause-period"
              disabled={disabled}
              value={period}
              onChange={(next) => setPeriod((next ?? "disabled") as AutomationSettings["automationPausePeriod"])}
              options={[
                { value: "disabled", label: t("flows.settings.pauseForever") },
                { value: "minutes", label: t("flows.units.minutes") },
                { value: "hours", label: t("flows.units.hours") },
                { value: "days", label: t("flows.units.days") },
              ]}
            />
          </div>
          {period !== "disabled" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pause-amount">{t("flows.settings.pauseAmount")}</Label>
              <NumberInput id="pause-amount" disabled={disabled} min={1} value={amount} onChange={setAmount} />
            </div>
          ) : null}
        </div>
        <SaveRow
          dirty={dirty}
          busy={busy}
          disabled={disabled}
          onSave={() => {
            setBusy(true)
            void onSave({ automationPausePeriod: period, automationPauseTimeTo: amount ?? 1 }).finally(() => setBusy(false))
          }}
        />
      </div>
    </SettingsSection>
  )
}

type DayDraft = { dayOfWeek: number; enabled: boolean; windows: { start: string; end: string }[] }

function draftDays(days: BusinessDay[] | undefined): DayDraft[] {
  return WEEK.map((dayOfWeek) => {
    const day = days?.find((item) => Number(item.dayOfWeek) === dayOfWeek)
    return {
      dayOfWeek,
      enabled: String(day?.enabled) === "true",
      windows: day?.windows?.length ? day.windows : [{ start: "09:00", end: "18:00" }],
    }
  })
}

function BusinessHoursSection({ settings, disabled, onSave }: SectionProps) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(settings.businessWorkEnabled)
  const [days, setDays] = useState(() => draftDays(settings.businessWork.days))
  const [busy, setBusy] = useState(false)
  const initial = useMemo(() => JSON.stringify(draftDays(settings.businessWork.days)), [settings.businessWork.days])
  const dirty = enabled !== settings.businessWorkEnabled || JSON.stringify(days) !== initial

  useEffect(() => {
    setDays(draftDays(settings.businessWork.days))
    setEnabled(settings.businessWorkEnabled)
  }, [settings.businessWork.days, settings.businessWorkEnabled])

  const patchDay = (dayOfWeek: number, change: (day: DayDraft) => DayDraft) =>
    setDays((current) => current.map((day) => (day.dayOfWeek === dayOfWeek ? change(day) : day)))

  // O dia da semana pelo `Intl`, na língua da tela: 4 de janeiro de 1970 foi um domingo.
  const dayName = (dayOfWeek: number) =>
    new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 4 + dayOfWeek)))

  return (
    <SettingsSection
      title={t("flows.settings.hoursTitle")}
      description={t("flows.settings.hoursHint", { timezone: settings.timezone })}
    >
      <div className="flex flex-col gap-3">
        <ToggleRow
          id="business-enabled"
          label={t("flows.settings.hoursEnabled")}
          checked={enabled}
          disabled={disabled}
          onChange={setEnabled}
        />
        {enabled ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {days.map((day) => (
              <li key={day.dayOfWeek} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-start sm:gap-3">
                <div className="flex w-full items-center justify-between gap-2 sm:w-44">
                  <Label htmlFor={`day-${day.dayOfWeek}`} className="capitalize">
                    {dayName(day.dayOfWeek)}
                  </Label>
                  <Switch
                    id={`day-${day.dayOfWeek}`}
                    checked={day.enabled}
                    disabled={disabled}
                    onCheckedChange={(next) => patchDay(day.dayOfWeek, (current) => ({ ...current, enabled: next }))}
                  />
                </div>
                {day.enabled ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {day.windows.map((window, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <Input
                          type="time"
                          disabled={disabled}
                          aria-label={t("flows.settings.hoursStart")}
                          value={window.start}
                          className="w-28"
                          onChange={(event) =>
                            patchDay(day.dayOfWeek, (current) => ({
                              ...current,
                              windows: current.windows.map((item, position) =>
                                position === index ? { ...item, start: event.target.value } : item
                              ),
                            }))
                          }
                        />
                        <span className="text-xs text-muted-foreground">{t("flows.settings.hoursTo")}</span>
                        <Input
                          type="time"
                          disabled={disabled}
                          aria-label={t("flows.settings.hoursEnd")}
                          value={window.end}
                          className="w-28"
                          onChange={(event) =>
                            patchDay(day.dayOfWeek, (current) => ({
                              ...current,
                              windows: current.windows.map((item, position) =>
                                position === index ? { ...item, end: event.target.value } : item
                              ),
                            }))
                          }
                        />
                        {day.windows.length > 1 && !disabled ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("flows.settings.hoursRemove")}
                            onClick={() =>
                              patchDay(day.dayOfWeek, (current) => ({
                                ...current,
                                windows: current.windows.filter((_, position) => position !== index),
                              }))
                            }
                          >
                            <X />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    {!disabled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          patchDay(day.dayOfWeek, (current) => ({
                            ...current,
                            windows: [...current.windows, { start: "13:00", end: "18:00" }],
                          }))
                        }
                      >
                        <Plus />
                        {t("flows.settings.hoursAdd")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground sm:pt-0.5">{t("flows.settings.hoursClosed")}</p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <SaveRow
          dirty={dirty}
          busy={busy}
          disabled={disabled}
          onSave={() => {
            setBusy(true)
            void onSave({
              businessWorkEnabled: enabled,
              businessWork: {
                days: days.map((day) => ({
                  dayOfWeek: String(day.dayOfWeek),
                  enabled: String(day.enabled),
                  windows: day.windows,
                })),
              },
            }).finally(() => setBusy(false))
          }}
        />
      </div>
    </SettingsSection>
  )
}

function ClearContextSection({ settings, disabled, onSave }: SectionProps) {
  const { t } = useTranslation()
  const [interval, setInterval] = useState<number | null>(settings.autoClearContextInterval)
  const [busy, setBusy] = useState(false)
  const dirty = interval !== settings.autoClearContextInterval

  return (
    <SettingsSection title={t("flows.settings.clearTitle")} description={t("flows.settings.clearHint")}>
      <div className="flex flex-col gap-3">
        <ToggleRow
          id="clear-enabled"
          label={t("flows.settings.clearEnabled")}
          checked={settings.autoClearContextEnabled}
          disabled={disabled}
          onChange={(autoClearContextEnabled) => void onSave({ autoClearContextEnabled })}
        />
        {settings.autoClearContextEnabled ? (
          <>
            <div className="flex max-w-48 flex-col gap-1.5">
              <Label htmlFor="clear-interval">{t("flows.settings.clearInterval")}</Label>
              <NumberInput id="clear-interval" disabled={disabled} min={1} value={interval} onChange={setInterval} />
            </div>
            <SaveRow
              dirty={dirty}
              busy={busy}
              disabled={disabled}
              onSave={() => {
                setBusy(true)
                void onSave({ autoClearContextInterval: interval ?? 48 }).finally(() => setBusy(false))
              }}
            />
          </>
        ) : null}
      </div>
    </SettingsSection>
  )
}
