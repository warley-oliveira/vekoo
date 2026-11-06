import { useCallback, useMemo, useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"

import {
  ColorField,
  FormField,
  SearchableSelect,
  SelectInput,
  TextareaField,
  TextField,
  type LoadOptions,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { chatDisplayName, lookupChats } from "@/hooks/calendar/use-class-groups"
import { useProfessionals, useServices } from "@/hooks/calendar/use-professionals"
import type { AgendaCalendar, BookingEvent, ChatLookupItem } from "@/lib/calendar/types"
import { formatPhone } from "@/lib/format-phone"
import { TimeZoneNote } from "../calendar-toolbar"
import type { BookingFormValues } from "./booking-form"
import { BookingWhen } from "./booking-when"

/** Mais de 7 opções pedem busca. Poucas ficam num seletor simples, melhor no toque. */
const SEARCH_THRESHOLD = 7

export function contactLine(externalId: string | null | undefined): string | undefined {
  if (!externalId) return undefined
  return /^\d{10,15}$/.test(externalId) ? formatPhone(externalId) : externalId
}

function chatOption(chat: ChatLookupItem): SelectOption {
  return {
    value: chat.id,
    label: chatDisplayName(chat) || chat.externalId || chat.id,
    description: contactLine(chat.externalId),
  }
}

/** Poucas opções num seletor simples, melhor no toque; muitas, com busca. */
function PickField({
  form,
  name,
  label,
  options,
  placeholder,
  clearLabel,
  optional = true,
  disabled,
  onPicked,
}: {
  form: UseFormReturn<BookingFormValues>
  name: "calendarId" | "serviceId" | "professionalId"
  label: string
  options: SelectOption[]
  placeholder: string
  clearLabel?: string
  optional?: boolean
  disabled?: boolean
  onPicked?: (value: string | null) => void
}) {
  return (
    <FormField control={form.control} name={name} label={label} optional={optional} disabled={disabled}>
      {({ field, controlProps }) =>
        options.length > SEARCH_THRESHOLD ? (
          <SearchableSelect
            {...controlProps}
            inputRef={field.ref}
            value={field.value}
            options={options}
            placeholder={placeholder}
            clearable={Boolean(clearLabel)}
            onBlur={field.onBlur}
            onChange={(value) => {
              field.onChange(value)
              onPicked?.(value)
            }}
          />
        ) : (
          <SelectInput
            {...controlProps}
            triggerRef={field.ref}
            value={field.value}
            options={options}
            placeholder={placeholder}
            clearLabel={clearLabel}
            onBlur={field.onBlur}
            onChange={(value) => {
              field.onChange(value)
              onPicked?.(value)
            }}
          />
        )
      }
    </FormField>
  )
}

/** Contato, serviço e colaborador vêm primeiro: é o que muda a cada agendamento. */
export function BookingFields({
  form,
  calendars,
  event,
  resolvedProfessional,
}: {
  form: UseFormReturn<BookingFormValues>
  calendars: AgendaCalendar[]
  event: BookingEvent | null
  resolvedProfessional: { current: string | null }
}) {
  const { t } = useTranslation()
  const calendarId = useWatch({ control: form.control, name: "calendarId" })
  const serviceId = useWatch({ control: form.control, name: "serviceId" })
  const professionalId = useWatch({ control: form.control, name: "professionalId" })
  const calendar = calendars.find((item) => item.id === calendarId) ?? null

  const { services, isLoading: loadingServices } = useServices(calendarId)
  const { professionals, isLoading: loadingProfessionals } = useProfessionals(calendarId)

  const service = services?.find((item) => item.id === serviceId) ?? null
  const professional = professionals?.find((item) => item.id === professionalId) ?? null

  /* ---------- opções ---------- */

  const calendarOptions = useMemo<SelectOption[]>(
    () => calendars.map((item) => ({ value: item.id, label: item.name })),
    [calendars]
  )
  const serviceOptions = useMemo<SelectOption[]>(
    () => (services ?? []).map((item) => ({ value: item.id, label: item.name })),
    [services]
  )
  // Com serviço escolhido, só quem atende aquele serviço.
  const professionalOptions = useMemo<SelectOption[]>(() => {
    const list = professionals ?? []
    const attends = service
      ? list.filter((item) => (service.distribution[item.id] ?? 0) > 0)
      : list
    return attends.map((item) => ({ value: item.id, label: item.name }))
  }, [professionals, service])

  const contactOption = useMemo<SelectOption | null>(
    () =>
      event?.chatId
        ? {
            value: event.chatId,
            label: event.userName || event.contactExternalId || event.chatId,
            description: contactLine(event.contactExternalId),
          }
        : null,
    [event]
  )
  const [pickedContact, setPickedContact] = useState<SelectOption | null>(null)
  const loadContacts = useCallback<LoadOptions>(
    async (query, signal) => (await lookupChats(query, signal)).map(chatOption),
    []
  )

  const hasCustomExtras = Boolean(
    form.getValues("title") || form.getValues("description") || event?.color
  )
  const [showMore, setShowMore] = useState(hasCustomExtras)

  // Serviço e colaborador são de cada calendário. A hora de parede fica como está.
  function afterCalendarChange() {
    form.setValue("serviceId", null, { shouldDirty: true })
    form.setValue("professionalId", null, { shouldDirty: true })
  }

  // Trocar o serviço pode deixar de fora quem estava escolhido.
  function afterServiceChange(nextId: string | null) {
    const nextService = services?.find((item) => item.id === nextId)
    if (nextService && professionalId && !(nextService.distribution[professionalId] > 0)) {
      form.setValue("professionalId", null, { shouldDirty: true })
    }
  }

  const noServices = !loadingServices && services?.length === 0
  const noProfessionals = !loadingProfessionals && professionals?.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* A API não muda o calendário de um agendamento: na edição, ele só aparece. */}
      {event || calendars.length <= 1 ? null : (
        <PickField
          form={form}
          name="calendarId"
          label={t("calendar.booking.fields.calendar")}
          options={calendarOptions}
          optional={false}
          placeholder={t("calendar.booking.fields.calendarPlaceholder")}
          onPicked={afterCalendarChange}
        />
      )}

      <FormField
        control={form.control}
        name="chatId"
        label={t("calendar.booking.fields.contact")}
        optional
      >
        {({ field, controlProps }) => (
          <SearchableSelect
            {...controlProps}
            inputRef={field.ref}
            value={field.value}
            loadOptions={loadContacts}
            selectedOption={pickedContact ?? contactOption}
            placeholder={t("calendar.booking.fields.contactPlaceholder")}
            emptyLabel={t("calendar.booking.fields.contactEmpty")}
            clearable
            onBlur={field.onBlur}
            onChange={(value, option) => {
              field.onChange(value)
              setPickedContact(option)
            }}
          />
        )}
      </FormField>

      {loadingServices && !services ? (
        <div aria-hidden className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <PickField
          form={form}
          name="serviceId"
          label={t("calendar.booking.fields.service")}
          options={serviceOptions}
          clearLabel={t("calendar.booking.fields.noService")}
          placeholder={
            noServices
              ? t("calendar.booking.fields.noServicesYet")
              : t("calendar.booking.fields.servicePlaceholder")
          }
          disabled={noServices || !calendarId}
          onPicked={afterServiceChange}
        />
      )}

      {loadingProfessionals && !professionals ? (
        <div aria-hidden className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <PickField
          form={form}
          name="professionalId"
          label={t("calendar.booking.fields.professional")}
          options={professionalOptions}
          clearLabel={
            service
              ? t("calendar.booking.fields.professionalTurn")
              : t("calendar.booking.fields.noProfessional")
          }
          placeholder={
            noProfessionals
              ? t("calendar.booking.fields.noProfessionalsYet")
              : service
                ? t("calendar.booking.fields.professionalTurn")
                : t("calendar.booking.fields.professionalPlaceholder")
          }
          disabled={noProfessionals || !calendarId}
        />
      )}

      <BookingWhen
        form={form}
        calendar={calendar}
        service={service}
        professional={professional}
        event={event}
        resolvedProfessional={resolvedProfessional}
      />

      {calendar ? <TimeZoneNote zones={[calendar.timeZone]} /> : null}

      {showMore ? (
        <div className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="title"
            label={t("calendar.booking.fields.title")}
            optional
            placeholder={t("calendar.booking.fields.titlePlaceholder")}
            hint={t("calendar.booking.fields.titleHint")}
            autoComplete="off"
          />
          <ColorField
            control={form.control}
            name="color"
            label={t("calendar.booking.fields.color")}
            optional
            hint={t("calendar.booking.fields.colorHint")}
          />
          <TextareaField
            control={form.control}
            name="description"
            label={t("calendar.booking.fields.description")}
            optional
            placeholder={t("calendar.booking.fields.descriptionPlaceholder")}
            showCount
            maxLength={500}
            rows={3}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground pointer-coarse:h-10"
          onClick={() => setShowMore(true)}
        >
          <ChevronDown />
          {t("calendar.booking.fields.more")}
        </Button>
      )}
    </div>
  )
}
