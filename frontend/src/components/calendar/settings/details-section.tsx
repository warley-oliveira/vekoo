import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { GraduationCap, Users } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  ColorField,
  ComboboxField,
  Form,
  FormActions,
  FormField,
  SegmentedControl,
  SettingsSection,
  TextField,
  TextareaField,
  UnsavedChangesDialog,
} from "@/components/shared"
import { useCalendarMutations } from "@/hooks/calendar/use-calendars"
import type { AgendaCalendar, RebalancingPeriod } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { timezoneOptions } from "@/lib/people/timezones"

const NAME_MAX = 120
const DESCRIPTION_MAX = 2000
const REBALANCING_PERIODS: RebalancingPeriod[] = ["day", "week", "month"]

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("calendar.settings.details.nameTooShort"))
      .max(NAME_MAX, t("calendar.settings.details.nameTooLong")),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, t("calendar.settings.details.descriptionTooLong")),
    color: z.string().nullable(),
    timeZone: z.string().nullable().refine(Boolean, t("calendar.settings.details.timeZoneRequired")),
    rebalancingPeriod: z.enum(["day", "week", "month"]),
  })
}

type DetailsValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(calendar: AgendaCalendar): DetailsValues {
  return {
    name: calendar.name,
    description: calendar.description ?? "",
    color: calendar.color,
    timeZone: calendar.timeZone,
    rebalancingPeriod: calendar.rebalancingPeriod,
  }
}

/** Nome, descrição, cor, fuso e, no calendário de colaboradores, como o trabalho é distribuído. */
export function DetailsSection({ calendar }: { calendar: AgendaCalendar }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { updateCalendar } = useCalendarMutations()

  const isProfessional = calendar.calendarType === "professional"
  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<DetailsValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(calendar),
    mode: "onBlur",
  })

  // Outra pessoa mudou enquanto esta tela estava aberta: acompanha, sem atropelar uma edição.
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(valuesOf(calendar))
  }, [calendar, form])

  const savedZone = calendar.timeZone
  const zones = useMemo(() => timezoneOptions(language, savedZone), [language, savedZone])
  const chosenZone = form.watch("timeZone")
  const zoneChanged = Boolean(chosenZone) && chosenZone !== savedZone
  const typeLabelKey = `calendar.create.types.${calendar.calendarType}`

  return (
    <SettingsSection
      title={t("calendar.settings.details.title")}
      description={t("calendar.settings.details.description")}
    >
      <UnsavedChangesDialog when={form.formState.isDirty} />
      <Form
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (values) => {
          const saved = await updateCalendar(calendar.id, {
            name: values.name,
            description: values.description || null,
            color: values.color,
            timeZone: values.timeZone ?? undefined,
            ...(isProfessional ? { rebalancingPeriod: values.rebalancingPeriod } : {}),
          })
          form.reset(valuesOf(saved))
          toast.success(t("calendar.settings.details.saved"))
        }}
      >
        <TextField
          control={form.control}
          name="name"
          label={t("calendar.settings.details.name")}
          maxLength={NAME_MAX}
          autoComplete="off"
        />
        <TextareaField
          control={form.control}
          name="description"
          label={t("calendar.settings.details.descriptionField")}
          placeholder={t("calendar.settings.details.descriptionPlaceholder")}
          maxLength={DESCRIPTION_MAX}
          optional
        />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ColorField
            control={form.control}
            name="color"
            label={t("calendar.settings.details.color")}
          />
          <div className="space-y-1.5">
            <p className="text-sm leading-none font-medium">{t("calendar.settings.details.type")}</p>
            <p className="flex h-8 items-center gap-2 text-sm pointer-coarse:h-10">
              {isProfessional ? (
                <Users aria-hidden className="size-4 text-muted-foreground" />
              ) : (
                <GraduationCap aria-hidden className="size-4 text-muted-foreground" />
              )}
              {t(`${typeLabelKey}.label`)}
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              {t("calendar.settings.details.typeHint")}
            </p>
          </div>
        </div>
        <ComboboxField
          control={form.control}
          name="timeZone"
          label={t("calendar.settings.details.timeZone")}
          hint={t("calendar.settings.details.timeZoneHint")}
          options={zones}
          emptyLabel={t("calendar.settings.details.timeZoneEmpty")}
        />
        {zoneChanged ? (
          <Callout tone="warning">{t("calendar.settings.details.timeZoneChanged")}</Callout>
        ) : null}
        {isProfessional ? (
          <FormField
            control={form.control}
            name="rebalancingPeriod"
            label={t("calendar.settings.details.rebalancing")}
            hint={t(`calendar.settings.details.rebalancingHints.${form.watch("rebalancingPeriod")}`)}
          >
            {({ field }) => (
              <SegmentedControl
                aria-label={t("calendar.settings.details.rebalancing")}
                value={field.value}
                onChange={field.onChange}
                options={REBALANCING_PERIODS.map((period) => ({
                  value: period,
                  label: t(`calendar.settings.details.rebalancingOptions.${period}`),
                }))}
              />
            )}
          </FormField>
        ) : null}
        <FormActions submitLabel={t("calendar.settings.details.submit")} requireChanges />
      </Form>
    </SettingsSection>
  )
}
