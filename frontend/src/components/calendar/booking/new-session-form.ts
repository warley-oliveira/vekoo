import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { useFormSubmit } from "@/components/shared"
import { useEventMutations } from "@/hooks/calendar/use-calendar-events"
import { instantFromField, safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar, ClassSessionEvent } from "@/lib/calendar/types"
import type { BookingDraft } from "./booking-form"

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      calendarId: z.string().nullable().refine(Boolean, t("calendar.booking.errors.calendarRequired")),
      classGroupId: z.string().nullable().refine(Boolean, t("calendar.session.new.groupRequired")),
      start: z.date({ error: t("calendar.booking.errors.startRequired") }).nullable(),
      end: z.date({ error: t("calendar.booking.errors.endRequired") }).nullable(),
      title: z.string().max(255, t("calendar.booking.errors.titleTooLong")),
      notes: z.string().max(500, t("calendar.booking.errors.descriptionTooLong")),
    })
    .superRefine((values, context) => {
      if (!values.start) {
        context.addIssue({
          code: "custom",
          path: ["start"],
          message: t("calendar.booking.errors.startRequired"),
        })
      }
      if (!values.end) {
        context.addIssue({
          code: "custom",
          path: ["end"],
          message: t("calendar.booking.errors.endRequired"),
        })
      }
      if (values.start && values.end && values.end <= values.start) {
        context.addIssue({
          code: "custom",
          path: ["end"],
          message: t("calendar.booking.errors.endBeforeStart"),
        })
      }
    })
}

export type SessionFormValues = z.infer<ReturnType<typeof buildSchema>>

/** Aula avulsa ou reposição, fora da grade da turma. */
export function useNewSessionForm({
  calendars,
  draft,
  onDone,
}: {
  calendars: AgendaCalendar[]
  draft: BookingDraft | null
  onDone: (saved: ClassSessionEvent) => void
}) {
  const { t } = useTranslation()
  const { createSession } = useEventMutations()
  const schema = useMemo(() => buildSchema(t), [t])

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      calendarId:
        calendars.find((calendar) => calendar.id === draft?.calendarId)?.id ??
        calendars[0]?.id ??
        null,
      classGroupId: null,
      start: draft?.start ?? null,
      end: draft?.end ?? null,
      title: "",
      notes: "",
    },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    const zone = safeTimeZone(calendars.find((item) => item.id === values.calendarId)?.timeZone)
    const saved = await createSession(values.calendarId as string, values.classGroupId as string, {
      start: instantFromField(values.start as Date, zone),
      end: instantFromField(values.end as Date, zone),
      title: values.title.trim() || null,
      notes: values.notes.trim() || null,
    })
    form.reset(values)
    toast.success(t("calendar.session.new.created"))
    onDone(saved)
  })

  return { form, submit }
}
