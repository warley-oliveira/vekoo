import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Ban, Check, ChevronDown, Pencil, Plus, UserMinus, X } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import {
  ActionsMenu,
  Callout,
  DateTimeField,
  EmptyState,
  ErrorState,
  FormError,
  KeyValueList,
  ListSkeleton,
  SidePanel,
  StatusBadge,
  TextareaField,
  TextField,
  useConfirm,
  useFormSubmit,
  UserAvatar,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useRevalidateEvents } from "@/hooks/calendar/use-calendar-events"
import type { BookingActions } from "@/hooks/calendar/use-booking-actions"
import {
  useAttendanceMutations,
  useClassAttendances,
  useEnrollmentMutations,
} from "@/hooks/calendar/use-class-groups"
import { apiAssetUrl } from "@/lib/api"
import { isVirtualId } from "@/lib/calendar/event-cache"
import { eventErrorMessage } from "@/lib/calendar/event-error"
import { isCanceled } from "@/lib/calendar/event-status"
import {
  fieldDateOf,
  formatEventWhen,
  instantFromField,
  safeTimeZone,
} from "@/lib/calendar/timezone"
import type {
  AgendaCalendar,
  AttendanceStatus,
  ClassAttendance,
  ClassSessionEvent,
} from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { contactLine } from "../booking/booking-fields"
import { EventSituationBadge, SessionOccupancy } from "../event-badges"
import { TimeZoneNote } from "../calendar-toolbar"
import { AddParticipantDialog } from "./add-participant-dialog"

/**
 * A aula aberta: quem vem, quem veio, quem faltou. A aula calculada vira documento na primeira
 * marcação e ganha outro id, mas este painel continua falando com o id com que abriu, que a API
 * aceita para sempre: a lista não pisca no meio da chamada.
 */
export function ClassSessionPanel({
  open,
  onOpenChange,
  session,
  calendar,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: ClassSessionEvent
  calendar: AgendaCalendar | null
  actions: BookingActions
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const zone = safeTimeZone(calendar?.timeZone)
  const [routeId] = useState(session.id)
  const { attendances, error, isLoading, reload } = useClassAttendances(routeId)
  const { setStatus, setAll, removeAttendance } = useAttendanceMutations(routeId)
  const { unenroll } = useEnrollmentMutations(session.calendarId, session.classGroupId)
  const revalidateEvents = useRevalidateEvents()

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const canceled = isCanceled(session)
  const list = useMemo(() => attendances ?? [], [attendances])
  const title = session.title || session.classGroupName || t("calendar.session.fallbackTitle")

  const counts = useMemo(() => {
    const show = list.filter((item) => item.attendanceStatus === "show").length
    const noShow = list.filter((item) => item.attendanceStatus === "no_show").length
    return { show, noShow, pending: list.length - show - noShow }
  }, [list])
  // A lista traz também os convidados, então vale mais que a conta do evento, quando já chegou.
  const occupied = list.length > 0 ? list.length : session.enrollmentCount

  /** Sem o canal, a calculada só vira gravada relendo o período. Com ele, isto não faz nada de mais. */
  const afterMarking = () => {
    if (isVirtualId(session.id)) void revalidateEvents()
  }

  async function toggleStatus(attendance: ClassAttendance, status: AttendanceStatus) {
    try {
      await setStatus(attendance, attendance.attendanceStatus === status ? null : status)
      afterMarking()
    } catch (cause) {
      toast.error(eventErrorMessage(t, cause))
    }
  }

  async function markAll(status: AttendanceStatus) {
    setBulkBusy(true)
    try {
      await setAll(status)
      if (status === "show") toast.success(t("calendar.session.bulk.markedShow"))
      else toast.warning(t("calendar.session.bulk.markedNoShow"))
      void revalidateEvents()
    } catch (cause) {
      toast.error(eventErrorMessage(t, cause))
    } finally {
      setBulkBusy(false)
    }
  }

  async function removeParticipant(attendance: ClassAttendance) {
    const name = attendance.userName ?? t("calendar.session.participants.noName")
    if (attendance.guest) {
      const confirmed = await confirm({
        title: t("calendar.session.remove.guestTitle", { name }),
        confirmLabel: t("calendar.session.remove.guestConfirm"),
        destructive: true,
        onConfirm: () => removeAttendance(attendance.id),
      })
      if (confirmed) toast.success(t("calendar.session.remove.guestDone", { name }))
      return
    }
    if (!attendance.classEnrollmentId) return
    const enrollmentId = attendance.classEnrollmentId
    const confirmed = await confirm({
      title: t("calendar.session.remove.enrolledTitle", { name }),
      description: t("calendar.session.remove.enrolledDescription"),
      confirmLabel: t("calendar.session.remove.enrolledConfirm"),
      destructive: true,
      onConfirm: () => unenroll(enrollmentId),
    })
    if (confirmed) {
      await reload()
      toast.success(t("calendar.session.remove.enrolledDone", { name }))
    }
  }

  async function cancelClass() {
    const confirmed = await confirm({
      title: t("calendar.session.cancel.title"),
      description: t("calendar.session.cancel.description"),
      confirmLabel: t("calendar.session.cancel.confirm"),
      cancelLabel: t("calendar.common.back"),
      destructive: true,
      onConfirm: async () => {
        await actions.mutations.cancelSession(session)
      },
    })
    if (confirmed) {
      toast.success(t("calendar.session.cancel.done"))
      onOpenChange(false)
    }
  }

  const metadata = [
    { label: t("calendar.session.fields.instructor"), value: session.instructorName },
    { label: t("calendar.session.fields.room"), value: session.room },
    { label: t("calendar.session.fields.location"), value: session.location },
  ].filter((item) => item.value)

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={title}
      description={formatEventWhen(session.start, session.end, zone, language)}
      footer={
        !canceled && list.length > 0 ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="ghost"
              className="pointer-coarse:h-10 sm:mr-auto"
              onClick={() => onOpenChange(false)}
            >
              {t("calendar.common.close")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              disabled={bulkBusy}
              onClick={() => void markAll("no_show")}
            >
              <X />
              {t("calendar.session.bulk.allNoShow")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              disabled={bulkBusy}
              onClick={() => void markAll("show")}
            >
              <Check />
              {t("calendar.session.bulk.allShow")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2 empty:hidden">
          <EventSituationBadge event={session} />
          <TimeZoneNote zones={[zone]} />
          {session.notes ? <p className="text-sm text-pretty">{session.notes}</p> : null}
        </div>

        {canceled ? (
          <Callout tone="neutral" icon={<Ban aria-hidden className="size-4" />}>
            {t("calendar.session.canceledNotice")}
          </Callout>
        ) : null}

        {metadata.length > 0 ? <KeyValueList items={metadata} /> : null}

        {session.maxStudents ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("calendar.session.occupancy")}</span>
            <SessionOccupancy
              count={occupied}
              max={session.maxStudents}
              className="[&>[role=progressbar]]:max-w-none"
            />
          </div>
        ) : null}

        <section aria-labelledby="participants-title" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 id="participants-title" className="min-w-0 flex-1 text-sm font-medium">
              {t("calendar.session.participants.title", { count: list.length })}
            </h3>
            {canceled ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 pointer-coarse:h-10"
                onClick={() => setAdding(true)}
              >
                <Plus />
                {t("calendar.session.participants.add")}
              </Button>
            )}
          </div>

          {list.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone="success">
                {t("calendar.session.counts.show", { count: counts.show })}
              </StatusBadge>
              <StatusBadge tone="danger">
                {t("calendar.session.counts.noShow", { count: counts.noShow })}
              </StatusBadge>
              <StatusBadge tone="neutral">
                {t("calendar.session.counts.pending", { count: counts.pending })}
              </StatusBadge>
            </div>
          ) : null}

          {error && !attendances ? (
            <ErrorState error={error} onRetry={() => void reload()} />
          ) : isLoading && !attendances ? (
            <ListSkeleton rows={4} avatar />
          ) : list.length === 0 ? (
            <EmptyState
              title={t("calendar.session.participants.empty.title")}
              description={
                canceled ? undefined : t("calendar.session.participants.empty.description")
              }
              action={
                canceled
                  ? undefined
                  : { label: t("calendar.session.participants.add"), onClick: () => setAdding(true) }
              }
            />
          ) : (
            <ul className="flex flex-col">
              {list.map((attendance) => (
                <ParticipantRow
                  key={attendance.id}
                  attendance={attendance}
                  readOnly={canceled}
                  disabled={bulkBusy}
                  onToggle={(status) => void toggleStatus(attendance, status)}
                  onRemove={() => void removeParticipant(attendance)}
                />
              ))}
            </ul>
          )}
        </section>

        {canceled ? null : (
          <section className="flex flex-col gap-3 border-t pt-3">
            <button
              type="button"
              aria-expanded={editing}
              onClick={() => setEditing((current) => !current)}
              className="group/edit flex h-9 items-center gap-1.5 self-start rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
            >
              <Pencil aria-hidden className="size-4 text-muted-foreground" />
              {t("calendar.session.edit.toggle")}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  editing && "rotate-180"
                )}
              />
            </button>
            {editing ? (
              <SessionEditForm
                session={session}
                zone={zone}
                actions={actions}
                onDone={() => setEditing(false)}
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 self-start text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => void cancelClass()}
            >
              <Ban />
              {t("calendar.session.cancel.action")}
            </Button>
          </section>
        )}
      </div>

      <AddParticipantDialog
        open={adding}
        onOpenChange={setAdding}
        sessionId={routeId}
        attendances={list}
        onChanged={() => {
          void reload()
          void revalidateEvents()
        }}
      />
    </SidePanel>
  )
}

function ParticipantRow({
  attendance,
  readOnly,
  disabled,
  onToggle,
  onRemove,
}: {
  attendance: ClassAttendance
  readOnly: boolean
  disabled: boolean
  onToggle: (status: AttendanceStatus) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const name = attendance.userName || t("calendar.session.participants.noName")
  const canRemove = attendance.guest
    ? !attendance.id.startsWith("ve_")
    : Boolean(attendance.classEnrollmentId)

  return (
    <li className="flex items-center gap-2.5 border-b border-border/60 py-2 last:border-b-0">
      <UserAvatar
        name={name}
        src={attendance.profilePictureUrl ? apiAssetUrl(attendance.profilePictureUrl) : null}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {attendance.chatId ? (
            <Link
              to={`/chat/${attendance.chatId}`}
              className="truncate rounded text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium">{name}</span>
          )}
          {attendance.guest ? (
            <StatusBadge tone="neutral">{t("calendar.session.participants.guest")}</StatusBadge>
          ) : null}
        </div>
        {attendance.contactExternalId ? (
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {contactLine(attendance.contactExternalId)}
          </p>
        ) : null}
      </div>

      {readOnly ? (
        attendance.attendanceStatus ? (
          <StatusBadge tone={attendance.attendanceStatus === "show" ? "success" : "danger"}>
            {t(`calendar.situation.${attendance.attendanceStatus}`)}
          </StatusBadge>
        ) : null
      ) : (
        <div className="flex shrink-0 items-center gap-0.5">
          <MarkButton
            active={attendance.attendanceStatus === "show"}
            tone="show"
            label={t(
              attendance.attendanceStatus === "show"
                ? "calendar.session.mark.clearShow"
                : "calendar.session.mark.show"
            )}
            disabled={disabled}
            onClick={() => onToggle("show")}
          />
          <MarkButton
            active={attendance.attendanceStatus === "no_show"}
            tone="no_show"
            label={t(
              attendance.attendanceStatus === "no_show"
                ? "calendar.session.mark.clearNoShow"
                : "calendar.session.mark.noShow"
            )}
            disabled={disabled}
            onClick={() => onToggle("no_show")}
          />
          {canRemove ? (
            <ActionsMenu
              label={t("calendar.session.participants.moreFor", { name })}
              actions={[
                {
                  label: t(
                    attendance.guest
                      ? "calendar.session.remove.guestAction"
                      : "calendar.session.remove.enrolledAction"
                  ),
                  icon: <UserMinus />,
                  destructive: true,
                  onSelect: onRemove,
                },
              ]}
            />
          ) : null}
        </div>
      )}
    </li>
  )
}

function MarkButton({
  active,
  tone,
  label,
  disabled,
  onClick,
}: {
  active: boolean
  tone: AttendanceStatus
  label: string
  disabled: boolean
  onClick: () => void
}) {
  const Icon = tone === "show" ? Check : X
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "pointer-coarse:size-10",
        active &&
          tone === "show" &&
          "bg-status-success-soft text-status-success hover:bg-status-success-soft",
        active &&
          tone === "no_show" &&
          "bg-status-danger-soft text-status-danger hover:bg-status-danger-soft"
      )}
      onClick={onClick}
    >
      <Icon />
    </Button>
  )
}

function buildEditSchema(t: (key: string) => string) {
  return z
    .object({
      start: z.date({ error: t("calendar.booking.errors.startRequired") }).nullable(),
      end: z.date({ error: t("calendar.booking.errors.endRequired") }).nullable(),
      title: z.string().max(255, t("calendar.booking.errors.titleTooLong")),
      notes: z.string().max(500, t("calendar.booking.errors.descriptionTooLong")),
    })
    .superRefine((values, context) => {
      if (!values.start || !values.end) {
        context.addIssue({
          code: "custom",
          path: [values.start ? "end" : "start"],
          message: t(
            values.start
              ? "calendar.booking.errors.endRequired"
              : "calendar.booking.errors.startRequired"
          ),
        })
      } else if (values.end <= values.start) {
        context.addIssue({
          code: "custom",
          path: ["end"],
          message: t("calendar.booking.errors.endBeforeStart"),
        })
      }
    })
}

type EditValues = z.infer<ReturnType<typeof buildEditSchema>>

/** Remarcar esta aula, sem mexer na grade da turma. O título e a nota também são só desta aula. */
function SessionEditForm({
  session,
  zone,
  actions,
  onDone,
}: {
  session: ClassSessionEvent
  zone: string
  actions: BookingActions
  onDone: () => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildEditSchema(t), [t])
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      start: fieldDateOf(session.start, zone),
      end: fieldDateOf(session.end, zone),
      title: session.title === session.classGroupName ? "" : session.title,
      notes: session.notes ?? "",
    },
    mode: "onBlur",
  })
  const start = useWatch({ control: form.control, name: "start" })

  const submit = useFormSubmit(form, async (values) => {
    await actions.mutations.updateSession(session, {
      start: instantFromField(values.start as Date, zone),
      end: instantFromField(values.end as Date, zone),
      title: values.title.trim() || null,
      notes: values.notes.trim() || null,
    })
    toast.success(t("calendar.session.edit.done"))
    onDone()
  })

  return (
    // Fica fora do `<form>` do painel: os dois não podem se aninhar.
    <div className="flex flex-col gap-3">
      <DateTimeField control={form.control} name="start" label={t("calendar.booking.fields.start")} />
      <DateTimeField
        control={form.control}
        name="end"
        label={t("calendar.booking.fields.end")}
        min={start ?? undefined}
      />
      <TextField
        control={form.control}
        name="title"
        label={t("calendar.session.new.title")}
        optional
        placeholder={session.classGroupName}
        autoComplete="off"
      />
      <TextareaField
        control={form.control}
        name="notes"
        label={t("calendar.session.new.notes")}
        optional
        rows={2}
      />
      <FormError form={form} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="pointer-coarse:h-10"
          disabled={form.formState.isSubmitting}
          onClick={() => void submit()}
        >
          {t("calendar.session.edit.submit")}
        </Button>
        <Button type="button" variant="ghost" className="pointer-coarse:h-10" onClick={onDone}>
          {t("calendar.common.cancel")}
        </Button>
      </div>
    </div>
  )
}
