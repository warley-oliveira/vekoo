import { useMemo } from "react"
import { useController, useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CalendarClock, ChevronDown, TriangleAlert } from "lucide-react"

import {
  Callout,
  DateTimeField,
  NumberField,
  RadioField,
  SelectInput,
} from "@/components/shared"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useRecipientSummary } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import {
  INTERVAL_STOPS,
  PACE_PRESETS,
  TIMEZONES,
  estimateCampaign,
  hourOf,
  nearestStop,
  paceOf,
  perDayFor,
  timezoneLabel,
  type PacePreset,
} from "@/lib/campaigns-wizard/estimate"
import { formatRange, isFullDay, weekdayName } from "@/lib/campaigns-wizard/format"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import { formatFullDateTime } from "@/lib/date-format"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { channelCount } from "./wizard-summary"
import { StepHeading } from "./wizard-nav"

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const LARGE_VOLUME = 1000

const asHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`

function DaysField() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { control } = useFormContext<WizardValues>()
  const { field } = useController({ control, name: "sendDays" })
  const { errors } = useFormState<WizardValues>({ name: "sendDays" })
  const days = field.value

  function toggle(day: number) {
    const next = days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort((a, b) => a - b)
    // Como na origem: a semana nunca fica vazia, para a pessoa não ver um erro que ela nem pediu.
    if (next.length > 0) field.onChange(next)
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{t("campaignsWizard.schedule.days")}</legend>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((day) => {
          const active = days.includes(day)
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              aria-label={weekdayName(day, language, "long")}
              onClick={() => toggle(day)}
              className={cn(
                "flex h-10 min-w-11 items-center justify-center rounded-lg border px-2 text-sm capitalize transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {weekdayName(day, language)}
            </button>
          )
        })}
      </div>
      {errors.sendDays?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.sendDays.message}
        </p>
      ) : null}
    </fieldset>
  )
}

function HoursField() {
  const { t } = useTranslation()
  const { control, setValue } = useFormContext<WizardValues>()
  const start = useWatch({ control, name: "sendWindowStart" })
  const end = useWatch({ control, name: "sendWindowEnd" })
  const { errors } = useFormState<WizardValues>({ name: "sendWindowEnd" })
  const fullDay = hourOf(start) === 0 && hourOf(end) === 0

  const startOptions = useMemo(
    () => Array.from({ length: 24 }, (_, hour) => ({ value: asHour(hour), label: asHour(hour) })),
    []
  )
  const endOptions = useMemo(
    () => Array.from({ length: 24 }, (_, hour) => ({ value: asHour(hour + 1), label: asHour(hour + 1) })),
    []
  )

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-center justify-between gap-4 pointer-coarse:min-h-10">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{t("campaignsWizard.schedule.allDay")}</span>
          <span className="block text-xs text-pretty text-muted-foreground">
            {t("campaignsWizard.schedule.allDayHint")}
          </span>
        </span>
        <Switch
          checked={fullDay}
          onCheckedChange={(checked) => {
            setValue("sendWindowStart", checked ? "00:00" : "09:00", { shouldDirty: true })
            setValue("sendWindowEnd", checked ? "00:00" : "18:00", { shouldDirty: true, shouldValidate: true })
          }}
        />
      </label>

      {fullDay ? null : (
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("campaignsWizard.schedule.from")}</span>
            <SelectInput
              aria-label={t("campaignsWizard.schedule.from")}
              options={startOptions}
              value={start}
              onChange={(value) => {
                if (value) setValue("sendWindowStart", value, { shouldDirty: true, shouldValidate: true })
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("campaignsWizard.schedule.to")}</span>
            <SelectInput
              aria-label={t("campaignsWizard.schedule.to")}
              options={endOptions}
              value={end}
              onChange={(value) => {
                if (value) setValue("sendWindowEnd", value, { shouldDirty: true, shouldValidate: true })
              }}
            />
          </div>
        </div>
      )}

      {errors.sendWindowEnd?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.sendWindowEnd.message}
        </p>
      ) : null}
    </div>
  )
}

function PaceField() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { control, setValue } = useFormContext<WizardValues>()
  const intervalMin = useWatch({ control, name: "intervalMin" })
  const intervalMax = useWatch({ control, name: "intervalMax" })
  const start = useWatch({ control, name: "sendWindowStart" })
  const end = useWatch({ control, name: "sendWindowEnd" })
  const limit = useWatch({ control, name: "dailyLimitPerConnector" })
  const pace = paceOf(intervalMin, intervalMax)

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{t("campaignsWizard.schedule.pace")}</legend>
      <RadioGroup
        value={pace === "custom" ? null : pace}
        onValueChange={(value) => {
          const preset = PACE_PRESETS[value as PacePreset]
          setValue("intervalMin", preset.intervalMin, { shouldDirty: true })
          setValue("intervalMax", preset.intervalMax, { shouldDirty: true, shouldValidate: true })
        }}
        aria-label={t("campaignsWizard.schedule.pace")}
        className="grid gap-2 sm:grid-cols-3"
      >
        {(Object.keys(PACE_PRESETS) as PacePreset[]).map((option) => {
          const range = PACE_PRESETS[option]
          const perChannel = perDayFor({
            channels: 1,
            sendWindowStart: start,
            sendWindowEnd: end,
            intervalMin: range.intervalMin,
            intervalMax: range.intervalMax,
            dailyLimitPerConnector: limit || 1,
          })

          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                pace === option && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem value={option} className="mt-px" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(`campaignsWizard.schedule.paces.${option}`)}</span>
                <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
                  {t("campaignsWizard.schedule.paceDetail", {
                    range: formatRange(range.intervalMin, range.intervalMax, t, language),
                    perDay: formatNumber(perChannel, language),
                  })}
                </span>
              </span>
            </label>
          )
        })}
      </RadioGroup>
      <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.schedule.paceHint")}</p>
    </fieldset>
  )
}

function AdvancedPace() {
  const { t } = useTranslation()
  const language = useLanguage()
  const { control, setValue } = useFormContext<WizardValues>()
  const intervalMin = useWatch({ control, name: "intervalMin" })
  const intervalMax = useWatch({ control, name: "intervalMax" })
  const timezone = useWatch({ control, name: "timezone" })
  const { errors } = useFormState<WizardValues>({ name: "intervalMax" })

  const timezoneOptions = useMemo(
    () => TIMEZONES.map((value) => ({ value, label: timezoneLabel(value, language) })),
    [language]
  )

  return (
    <Collapsible defaultOpen={paceOf(intervalMin, intervalMax) === "custom"} className="rounded-xl border">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="group flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <span className="min-w-0 flex-1 text-sm font-medium">{t("campaignsWizard.schedule.advanced")}</span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-5 border-t p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{t("campaignsWizard.schedule.interval")}</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatRange(intervalMin, intervalMax, t, language)}
              </span>
            </div>
            <Slider
              aria-label={t("campaignsWizard.schedule.interval")}
              value={[nearestStop(intervalMin), nearestStop(intervalMax)]}
              min={0}
              max={INTERVAL_STOPS.length - 1}
              step={1}
              minStepsBetweenValues={1}
              onValueChange={(value) => {
                const [low, high] = value as number[]
                setValue("intervalMin", INTERVAL_STOPS[low], { shouldDirty: true })
                setValue("intervalMax", INTERVAL_STOPS[high], { shouldDirty: true, shouldValidate: true })
              }}
            />
            <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.schedule.intervalHint")}</p>
            {errors.intervalMax?.message ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.intervalMax.message}
              </p>
            ) : null}
          </div>

          <NumberField
            control={control}
            name="dailyLimitPerConnector"
            label={t("campaignsWizard.schedule.dailyLimit")}
            hint={t("campaignsWizard.schedule.dailyLimitHint")}
            min={1}
            className="max-w-xs"
          />

          <div className="flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-medium">{t("campaignsWizard.schedule.timezone")}</span>
            <SelectInput
              aria-label={t("campaignsWizard.schedule.timezone")}
              options={timezoneOptions}
              value={timezone}
              onChange={(value) => {
                if (value) setValue("timezone", value, { shouldDirty: true })
              }}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A conta em palavras: quando começa, quantos por dia e quando termina. Muda enquanto a pessoa mexe. */
export function ScheduleEstimate({ className }: { className?: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { control } = useFormContext<WizardValues>()
  const { campaignId } = useDraft()
  const { summary } = useRecipientSummary(campaignId)

  const values = useWatch({ control }) as WizardValues
  const channels = channelCount(values)
  const startAt = values.sendMode === "later" && values.scheduledAt ? values.scheduledAt.getTime() : Date.now()

  const estimate = estimateCampaign({
    total: summary.total,
    channels: Math.max(channels, 1),
    sendWindowStart: values.sendWindowStart,
    sendWindowEnd: values.sendWindowEnd,
    sendDays: values.sendDays,
    intervalMin: values.intervalMin,
    intervalMax: values.intervalMax,
    dailyLimitPerConnector: values.dailyLimitPerConnector || 1,
    timezone: values.timezone,
    startAt,
  })

  const finishes =
    estimate.days === null
      ? null
      : estimate.hours !== null && estimate.hours < 1
        ? t("campaignsWizard.estimate.lessThanHour")
        : estimate.hours !== null
          ? t("campaignsWizard.estimate.hours", { count: Math.ceil(estimate.hours) })
          : t("campaignsWizard.estimate.days", { count: estimate.days })

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
        {t("campaignsWizard.estimate.title")}
      </p>
      {summary.total === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">{t("campaignsWizard.estimate.noAudience")}</p>
      ) : (
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{t("campaignsWizard.estimate.starts")}</dt>
            <dd className="text-pretty">
              {values.sendMode === "later" && !values.scheduledAt
                ? t("campaignsWizard.estimate.pickDate")
                : estimate.waitsForWindow
                  ? t("campaignsWizard.estimate.waits", {
                      date: formatFullDateTime(estimate.firstSendAt, language),
                    })
                  : values.sendMode === "later"
                    ? formatFullDateTime(estimate.firstSendAt, language)
                    : t("campaignsWizard.estimate.rightAway")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("campaignsWizard.estimate.perDay")}</dt>
            <dd>{t("campaignsWizard.estimate.perDayValue", { formatted: formatNumber(estimate.perDay, language) })}</dd>
          </div>
          {finishes ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t("campaignsWizard.estimate.finishes")}</dt>
              <dd>{finishes}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </div>
  )
}

function VolumeWarning() {
  const { t } = useTranslation()
  const { control } = useFormContext<WizardValues>()
  const { campaignId } = useDraft()
  const { summary } = useRecipientSummary(campaignId)
  const mode = useWatch({ control, name: "campaignMode" })

  // O risco de bloqueio é do WhatsApp conectado. A conta oficial tem o limite da Meta.
  if (mode !== "text" || summary.total < LARGE_VOLUME) return null

  return (
    <Callout tone="warning" icon={<TriangleAlert />}>
      {t("campaignsWizard.schedule.volumeWarning")}
    </Callout>
  )
}

/** Quando: agora ou numa data, em que dias e horários, e em que ritmo. O avançado fica recolhido. */
export function StepSchedule() {
  const { t } = useTranslation()
  const { control } = useFormContext<WizardValues>()
  const sendMode = useWatch({ control, name: "sendMode" })
  const start = useWatch({ control, name: "sendWindowStart" })
  const end = useWatch({ control, name: "sendWindowEnd" })

  return (
    <section aria-labelledby="wizard-step-schedule" className="flex flex-col gap-6">
      <StepHeading
        id="wizard-step-schedule"
        title={t("campaignsWizard.steps.schedule.title")}
        hint={t("campaignsWizard.steps.schedule.hint")}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <RadioField
            control={control}
            name="sendMode"
            label={t("campaignsWizard.schedule.whenLabel")}
            variant="cards"
            orientation="horizontal"
            options={[
              {
                value: "now",
                label: t("campaignsWizard.schedule.now"),
                description: t("campaignsWizard.schedule.nowHint"),
              },
              {
                value: "later",
                label: t("campaignsWizard.schedule.later"),
                description: t("campaignsWizard.schedule.laterHint"),
              },
            ]}
          />

          {sendMode === "later" ? (
            <DateTimeField
              control={control}
              name="scheduledAt"
              label={t("campaignsWizard.schedule.dateTime")}
              min={new Date()}
              defaultTime={isFullDay(start, end) ? "09:00" : start}
              className="max-w-sm"
            />
          ) : null}

          <DaysField />
          <HoursField />

          {/* No celular a conta fica logo depois do que muda ela. */}
          <ScheduleEstimate className="lg:hidden" />

          <PaceField />
          <VolumeWarning />
          <AdvancedPace />
        </div>

        <aside className="sticky top-6 hidden lg:block">
          <ScheduleEstimate />
        </aside>
      </div>
    </section>
  )
}
