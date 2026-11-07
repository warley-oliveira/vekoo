import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react"
import { Link } from "react-router"
import { toast } from "sonner"
import useSWR from "swr"

import {
  Callout,
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
  SearchInput,
  ResponsiveDialog,
  StatusBadge,
  UserAvatar,
  useConfirm,
  type StatusTone,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  chatDisplayName,
  lookupChats,
  useClassEnrollments,
  useEnrollmentMutations,
} from "@/hooks/calendar/use-class-groups"
import { useCan } from "@/hooks/use-can"
import { useRetained } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import type { ChatLookupItem, ClassEnrollment, ClassGroup } from "@/lib/calendar/types"
import { capitalizeFirstLetter, formatDate } from "@/lib/date-format"
import { formatPhone, isValidPhone } from "@/lib/format-phone"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { areaErrorMessage } from "./area-errors"
import { occupancyLevel, type OccupancyLevel } from "./occupancy"
import { OccupancyBar } from "./occupancy-bar"
import { formatClock, weekdayName } from "./week-schedule"

/** Com menos do que isto, a busca traria meio mundo. Como na origem. */
const MIN_QUERY = 2

const LEVEL_TONE: Record<OccupancyLevel, StatusTone> = {
  free: "neutral",
  almost: "warning",
  full: "danger",
}

/** Um contato inscrito: pode ter uma inscrição por horário, e cancelar leva todas juntas. */
type EnrolledContact = {
  key: string
  chatId: string | null
  name: string | null
  picture: string | null
  externalId: string | null
  enrollments: ClassEnrollment[]
}

function groupByContact(enrollments: ClassEnrollment[]): EnrolledContact[] {
  const contacts = new Map<string, EnrolledContact>()
  for (const enrollment of enrollments) {
    if (enrollment.status !== "active") continue

    const key = enrollment.chatId ?? enrollment.id
    const known = contacts.get(key)
    if (known) {
      known.enrollments.push(enrollment)
    } else {
      contacts.set(key, {
        key,
        chatId: enrollment.chatId,
        name: enrollment.userName,
        picture: enrollment.profilePictureUrl,
        externalId: enrollment.contactExternalId,
        enrollments: [enrollment],
      })
    }
  }
  return [...contacts.values()]
}

/** Só número brasileiro de verdade vira telefone: `visitante-ana` e id de Instagram ficam como estão. */
function formatContactId(externalId: string | null): string | null {
  if (!externalId) return null
  return externalId.startsWith("55") && isValidPhone(externalId)
    ? formatPhone(externalId)
    : externalId
}

type EnrollmentsPanelProps = {
  calendarId: string
  classGroup: ClassGroup
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Turma cheia: o caminho para aumentar as vagas. */
  onEdit: (classGroup: ClassGroup) => void
}

/** Quem está inscrito na turma, e quem mais vai entrar. */
export function EnrollmentsPanel({
  calendarId,
  classGroup,
  open,
  onOpenChange,
  onEdit,
}: EnrollmentsPanelProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  // Fechando, o painel para de ler: a turma pode ter acabado de ser excluída. O que já chegou fica
  // na tela até a animação de saída terminar.
  const {
    enrollments: fetched,
    activeCount: fetchedCount,
    maxStudents: fetchedMax,
    error,
    isLoading,
    reload,
  } = useClassEnrollments(calendarId, open ? classGroup.id : null)
  const loaded = useRetained(
    useMemo(
      () =>
        fetched
          ? { enrollments: fetched, activeCount: fetchedCount, maxStudents: fetchedMax }
          : null,
      [fetched, fetchedCount, fetchedMax]
    )
  )
  const { enroll, unenroll } = useEnrollmentMutations(calendarId, classGroup.id)

  const enrollments = loaded?.enrollments
  // A turma já traz os números: vagas e busca aparecem de cara, e só a lista espera a API.
  const activeCount = loaded ? loaded.activeCount : classGroup.activeEnrollmentCount
  const maxStudents = loaded ? loaded.maxStudents : classGroup.maxStudents
  const level = occupancyLevel(activeCount, maxStudents)
  const seatsLabel = t("calendar.classGroups.seats.occupied", {
    count: maxStudents ?? 0,
    active: activeCount,
  })

  const contacts = useMemo(() => groupByContact(enrollments ?? []), [enrollments])

  async function add(chat: ChatLookupItem) {
    const name = chatDisplayName(chat) || t("calendar.classGroups.enrollments.noName")
    try {
      await enroll(chat.id)
      toast.success(t("calendar.classGroups.enrollments.enrolled", { name }))
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "classGroupFull") {
        // Alguém ocupou a última vaga enquanto esta tela estava aberta.
        void reload()
        toast.error(t("calendar.classGroups.enrollments.fullError"))
      } else {
        toast.error(areaErrorMessage(t, cause))
      }
    }
  }

  async function remove(contact: EnrolledContact) {
    const name = contact.name ?? t("calendar.classGroups.enrollments.noName")
    const confirmed = await confirm({
      title: t("calendar.classGroups.enrollments.cancel.title", { name }),
      description: t("calendar.classGroups.enrollments.cancel.description", {
        name,
        count: contact.enrollments.length,
      }),
      confirmLabel: t("calendar.classGroups.enrollments.cancel.confirm"),
      cancelLabel: t("calendar.classGroups.enrollments.cancel.keep"),
      destructive: true,
      onConfirm: () => unenroll(contact.enrollments[0].id),
    })
    if (confirmed) toast.success(t("calendar.classGroups.enrollments.cancel.done", { name }))
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={classGroup.name}
      description={t("calendar.classGroups.enrollments.description")}
    >
      {error && !enrollments ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="flex flex-col gap-5">
          {maxStudents ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">
                  {t("calendar.classGroups.enrollments.seatsTitle")}
                </h3>
                <StatusBadge tone={LEVEL_TONE[level]} dot={false} className="tabular-nums">
                  {seatsLabel}
                </StatusBadge>
              </div>
              <OccupancyBar active={activeCount} max={maxStudents} label={seatsLabel} />
            </section>
          ) : null}

          {level === "full" ? (
            <Callout
              tone="warning"
              role="status"
              title={
                maxStudents
                  ? t("calendar.classGroups.enrollments.full.title")
                  : t("calendar.classGroups.enrollments.noSeats.title")
              }
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() => onEdit(classGroup)}
                >
                  {t("calendar.classGroups.enrollments.full.action")}
                </Button>
              }
            >
              {maxStudents
                ? t("calendar.classGroups.enrollments.full.description")
                : t("calendar.classGroups.enrollments.noSeats.description")}
            </Callout>
          ) : (
            <ContactSearch active={open} enrolledContacts={contacts} onEnroll={add} />
          )}

          <section className="flex flex-col gap-2">
            {isLoading && !enrollments ? (
              <ListSkeleton rows={3} avatar />
            ) : (
              <>
                <h3 className="text-sm font-medium">
                  {t("calendar.classGroups.enrollments.listTitle", { count: contacts.length })}
                </h3>
                <EnrolledList
                  contacts={contacts}
                  canEnroll={level !== "full"}
                  onCancel={(contact) => void remove(contact)}
                />
                {activeCount > (enrollments?.length ?? 0) ? (
                  <p className="text-xs text-muted-foreground">
                    {t("calendar.classGroups.enrollments.truncated", {
                      shown: enrollments?.length ?? 0,
                      total: activeCount,
                    })}
                  </p>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </ResponsiveDialog>
  )
}

/** Buscar um contato e inscrever. Quem já está inscrito não aparece: a API o recusaria. */
function ContactSearch({
  active,
  enrolledContacts,
  onEnroll,
}: {
  active: boolean
  enrolledContacts: EnrolledContact[]
  onEnroll: (chat: ChatLookupItem) => Promise<void>
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [enrollingId, setEnrollingId] = useState<string | null>(null)

  const term = query.trim()
  const searching = active && term.length >= MIN_QUERY
  const lookup = useSWR<ChatLookupItem[]>(
    searching ? ["class-enrollment-lookup", term] : null,
    () => lookupChats(term),
    { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false }
  )

  const results = useMemo(() => {
    const enrolled = new Set(enrolledContacts.map((contact) => contact.chatId))
    return (lookup.data ?? []).filter((chat) => !enrolled.has(chat.id))
  }, [enrolledContacts, lookup.data])

  async function enroll(chat: ChatLookupItem) {
    setEnrollingId(chat.id)
    try {
      await onEnroll(chat)
    } finally {
      setEnrollingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        debounce={400}
        shortcut={false}
        loading={lookup.isValidating}
        placeholder={t("calendar.classGroups.enrollments.search")}
      />
      {term.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          {t("calendar.classGroups.enrollments.searchHint")}
        </p>
      ) : !searching ? null : lookup.error ? (
        <InlineError onRetry={() => void lookup.mutate()} />
      ) : lookup.data && results.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">
          {lookup.data.length > 0
            ? t("calendar.classGroups.enrollments.allEnrolled")
            : t("calendar.classGroups.enrollments.noMatch")}
        </p>
      ) : results.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
          {results.map((chat) => {
            const name = chatDisplayName(chat) || t("calendar.classGroups.enrollments.noName")
            const contactId = formatContactId(chat.externalId)
            const busy = enrollingId === chat.id
            return (
              <li key={chat.id} className="flex items-center gap-3 px-3 py-2">
                <UserAvatar name={name} src={chat.profilePictureUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {contactId ? (
                    <p className="truncate text-xs text-muted-foreground">{contactId}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-busy={busy}
                  aria-label={t("calendar.classGroups.enrollments.enrollOne", { name })}
                  className="shrink-0 pointer-coarse:h-10"
                  disabled={enrollingId !== null}
                  onClick={() => void enroll(chat)}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
                  {t("calendar.classGroups.enrollments.enroll")}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

function EnrolledList({
  contacts,
  canEnroll,
  onCancel,
}: {
  contacts: EnrolledContact[]
  canEnroll: boolean
  onCancel: (contact: EnrolledContact) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const preset = useMotionPreset()
  const canOpenChat = useCan("chat")

  const slotLabel = (enrollment: ClassEnrollment) =>
    enrollment.scheduleDayOfWeek !== null && enrollment.scheduleWindowStart
      ? t("calendar.classGroups.enrollments.slot", {
          day: capitalizeFirstLetter(weekdayName(enrollment.scheduleDayOfWeek, language, "short")),
          time: formatClock(enrollment.scheduleWindowStart, language),
        })
      : t("calendar.classGroups.enrollments.allSlots")

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-5" />}
        title={t("calendar.classGroups.enrollments.empty.title")}
        description={canEnroll ? t("calendar.classGroups.enrollments.empty.description") : undefined}
        className="p-6"
      />
    )
  }

  return (
    <ul className="flex flex-col divide-y">
      <AnimatePresence initial={false} mode="popLayout">
        {contacts.map((contact) => {
          const name = contact.name ?? t("calendar.classGroups.enrollments.noName")
          const cancelLabel = t("calendar.classGroups.enrollments.cancel.action", { name })
          const details = [
            formatContactId(contact.externalId),
            contact.enrollments.map(slotLabel).join(", "),
            t("calendar.classGroups.enrollments.since", {
              date: formatDate(contact.enrollments[0].enrolledAt, language),
            }),
          ].filter(Boolean)

          return (
            <motion.li
              key={contact.key}
              {...preset.listItem}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <UserAvatar name={name} src={contact.picture} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {canOpenChat && contact.chatId ? (
                    <Link
                      to={`/chat/${contact.chatId}`}
                      className="rounded outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </p>
                <p className="text-xs text-pretty text-muted-foreground tabular-nums">
                  {details.join(" · ")}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={cancelLabel}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onCancel(contact)}
                    />
                  }
                >
                  <UserMinus />
                </TooltipTrigger>
                <TooltipContent>{cancelLabel}</TooltipContent>
              </Tooltip>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
