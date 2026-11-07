import { useEffect, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import { useFormSubmit } from "@/components/shared"
import { useEventMutations } from "@/hooks/calendar/use-calendar-events"
import { hasCustomTitle } from "@/lib/calendar/event-status"
import {
  fieldDateOf,
  instantFromField,
  safeTimeZone,
} from "@/lib/calendar/timezone"
import type {
  AgendaCalendar,
  BookingEvent,
  BookingInput,
} from "@/lib/calendar/types"

/** Os horários do formulário são datas de campo: a hora de parede no fuso do calendário. */
export type BookingDraft = {
  calendarId?: string | null
  start: Date
  end: Date
  /** Quem já vem escolhido: agendar a partir da conversa não pede para achar o contato de novo. */
  chat?: { id: string; name: string; externalId?: string | null } | null
}

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      calendarId: z.string().nullable().refine(Boolean, t("calendar.booking.errors.calendarRequired")),
      title: z.string().max(255, t("calendar.booking.errors.titleTooLong")),
      chatId: z.string().nullable(),
      serviceId: z.string().nullable(),
      professionalId: z.string().nullable(),
      start: z.date({ error: t("calendar.booking.errors.startRequired") }).nullable(),
      end: z.date({ error: t("calendar.booking.errors.endRequired") }).nullable(),
      color: z.string().nullable(),
      description: z.string().max(500, t("calendar.booking.errors.descriptionTooLong")),
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
      if (values.start && values.end && values.end < values.start) {
        context.addIssue({
          code: "custom",
          path: ["end"],
          message: t("calendar.booking.errors.endBeforeStart"),
        })
      }
      // Sem nada disso, o evento nasceria sem nome nenhum na grade.
      if (!values.title.trim() && !values.chatId && !values.serviceId) {
        context.addIssue({
          code: "custom",
          path: ["chatId"],
          message: t("calendar.booking.errors.needsSomething"),
        })
      }
    })
}

export type BookingFormValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(event: BookingEvent, zone: string): BookingFormValues {
  return {
    calendarId: event.calendarId,
    // Título padrão vem da API e acompanha serviço e contato: o campo só guarda o que é da pessoa.
    title: hasCustomTitle(event) ? event.title : "",
    chatId: event.chatId,
    serviceId: event.serviceId,
    professionalId: event.professionalId,
    start: fieldDateOf(event.start, zone),
    end: fieldDateOf(Math.max(event.end, event.start), zone),
    color: event.color,
    description: event.description ?? "",
  }
}

function valuesOfDraft(draft: BookingDraft | null): BookingFormValues {
  return {
    calendarId: draft?.calendarId ?? null,
    title: "",
    chatId: draft?.chat?.id ?? null,
    serviceId: null,
    professionalId: null,
    start: draft?.start ?? null,
    end: draft?.end ?? null,
    color: null,
    description: "",
  }
}

/**
 * O formulário de criar e de editar um agendamento. `resolvedProfessional` guarda quem a API
 * escolheu pela distribuição, para criar o agendamento com ele quando a pessoa não escolheu.
 */
export function useBookingForm({
  event,
  draft,
  calendars,
  active,
  onDone,
}: {
  event: BookingEvent | null
  draft: BookingDraft | null
  calendars: AgendaCalendar[]
  /** O painel está aberto, com este formulário na tela: é quando o atalho de salvar vale. */
  active: boolean
  onDone: (saved: BookingEvent) => void
}) {
  const { t } = useTranslation()
  const { createBooking, updateBooking } = useEventMutations()
  const resolvedProfessional = useRef<string | null>(null)

  const zoneOf = (calendarId: string | null | undefined) =>
    safeTimeZone(calendars.find((calendar) => calendar.id === calendarId)?.timeZone)

  const schema = useMemo(() => buildSchema(t), [t])
  const defaultValues = useMemo(
    () => (event ? valuesOf(event, zoneOf(event.calendarId)) : valuesOfDraft(draft)),
    // O formulário nasce uma vez por abertura: o painel é remontado com `key` a cada uma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    const zone = zoneOf(values.calendarId)
    const start = instantFromField(values.start as Date, zone)
    const end = instantFromField(values.end as Date, zone)

    if (event) {
      const before = valuesOf(event, zone)
      const changes: BookingInput = {}
      if (start !== event.start) changes.start = start
      if (end !== event.end) changes.end = end
      if (values.title !== before.title) changes.title = values.title.trim() || null
      if (values.chatId !== before.chatId) changes.chatId = values.chatId
      if (values.serviceId !== before.serviceId) changes.serviceId = values.serviceId
      if (values.professionalId !== before.professionalId) {
        changes.professionalId = values.professionalId
      }
      if (values.color !== before.color) changes.color = values.color
      if (values.description !== before.description) {
        changes.description = values.description.trim() || null
      }
      const saved = await updateBooking(event.id, changes)
      form.reset(valuesOf(saved, zone))
      toast.success(t("calendar.booking.saved"))
      onDone(saved)
      return
    }

    const created = await createBooking({
      calendarId: values.calendarId as string,
      start,
      end,
      title: values.title.trim() || null,
      description: values.description.trim() || null,
      color: values.color,
      serviceId: values.serviceId,
      chatId: values.chatId,
      professionalId: values.professionalId ?? (values.serviceId ? resolvedProfessional.current : null),
    })
    form.reset(values)
    toast.success(t("calendar.booking.created"))
    onDone(created)
  })

  // Ctrl+S ou ⌘+S salva de qualquer ponto do painel. O envio já ignora o segundo pedido.
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  useEffect(() => {
    if (!active) return
    function onKeyDown(keyEvent: KeyboardEvent) {
      if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === "s") {
        keyEvent.preventDefault()
        void submitRef.current()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active])

  return { form, submit, resolvedProfessional }
}
