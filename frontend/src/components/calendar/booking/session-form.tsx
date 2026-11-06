import { useEffect, useMemo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { GraduationCap } from "lucide-react"
import { Link } from "react-router"

import {
  Callout,
  DateTimeField,
  SelectField,
  TextareaField,
  TextField,
  type SelectOption,
} from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { useClassGroups } from "@/hooks/calendar/use-class-groups"
import type { AgendaCalendar } from "@/lib/calendar/types"
import { TimeZoneNote } from "../calendar-toolbar"
import type { SessionFormValues } from "./new-session-form"

const DEFAULT_LENGTH = 60

export function NewSessionFields({
  form,
  calendars,
}: {
  form: UseFormReturn<SessionFormValues>
  calendars: AgendaCalendar[]
}) {
  const { t } = useTranslation()
  const calendarId = useWatch({ control: form.control, name: "calendarId" })
  const classGroupId = useWatch({ control: form.control, name: "classGroupId" })
  const start = useWatch({ control: form.control, name: "start" })
  const calendar = calendars.find((item) => item.id === calendarId) ?? null
  const { classGroups, isLoading } = useClassGroups(calendarId)

  const groups = useMemo(
    () => (classGroups ?? []).filter((group) => group.active),
    [classGroups]
  )
  const groupOptions = useMemo<SelectOption[]>(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups]
  )
  const calendarOptions = useMemo<SelectOption[]>(
    () => calendars.map((item) => ({ value: item.id, label: item.name })),
    [calendars]
  )
  const group = groups.find((item) => item.id === classGroupId)

  // Escolheu a turma: a aula nasce com a duração dela.
  useEffect(() => {
    if (!group) return
    const current = form.getValues("start")
    if (current) {
      const minutes = group.defaultDurationMinutes ?? DEFAULT_LENGTH
      form.setValue("end", new Date(current.getTime() + minutes * 60_000), { shouldDirty: true })
    }
    // Só quando troca a turma: a pessoa pode ter ajustado o fim depois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id])

  const noGroups = !isLoading && classGroups && groups.length === 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-pretty text-muted-foreground">
        {t("calendar.session.new.description")}
      </p>

      {calendars.length > 1 ? (
        <SelectField
          control={form.control}
          name="calendarId"
          label={t("calendar.booking.fields.calendar")}
          options={calendarOptions}
          placeholder={t("calendar.booking.fields.calendarPlaceholder")}
        />
      ) : null}

      {isLoading && !classGroups ? (
        <div aria-hidden className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : noGroups ? (
        <Callout
          icon={<GraduationCap aria-hidden className="size-4" />}
          title={t("calendar.session.new.noGroups.title")}
          action={
            <Link
              to={`/calendar/${calendarId}/class-groups`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("calendar.session.new.noGroups.action")}
            </Link>
          }
        >
          {t("calendar.session.new.noGroups.description")}
        </Callout>
      ) : (
        <SelectField
          control={form.control}
          name="classGroupId"
          label={t("calendar.session.new.group")}
          options={groupOptions}
          placeholder={t("calendar.session.new.groupPlaceholder")}
        />
      )}

      <DateTimeField control={form.control} name="start" label={t("calendar.booking.fields.start")} />
      <DateTimeField
        control={form.control}
        name="end"
        label={t("calendar.booking.fields.end")}
        min={start ?? undefined}
      />
      {calendar ? <TimeZoneNote zones={[calendar.timeZone]} /> : null}

      <TextField
        control={form.control}
        name="title"
        label={t("calendar.session.new.title")}
        optional
        placeholder={group?.name ?? t("calendar.session.new.titlePlaceholder")}
        autoComplete="off"
      />
      <TextareaField
        control={form.control}
        name="notes"
        label={t("calendar.session.new.notes")}
        optional
        placeholder={t("calendar.session.new.notesPlaceholder")}
        rows={2}
      />
    </div>
  )
}
