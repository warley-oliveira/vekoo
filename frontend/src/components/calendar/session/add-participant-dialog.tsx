import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { EmptyState, ResponsiveDialog, SearchInput, UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { chatDisplayName, lookupChats, useAttendanceMutations } from "@/hooks/calendar/use-class-groups"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { apiAssetUrl } from "@/lib/api"
import { eventErrorMessage } from "@/lib/calendar/event-error"
import { formatDayKey, addDaysToKey } from "@/lib/calendar/timezone"
import type { ChatLookupItem, ClassAttendance, ScheduleWindowOption } from "@/lib/calendar/types"
import { contactLine } from "@/lib/calendar/contact"
import { useLanguage } from "@/lib/i18n"

const MIN_QUERY = 2
const SEARCH_DELAY = 400

/** Um domingo qualquer: só para o `Intl` escrever o nome do dia no idioma da tela. */
const A_SUNDAY = "2026-01-04"

function dayName(dayOfWeek: number, language: string): string {
  return formatDayKey(addDaysToKey(A_SUNDAY, dayOfWeek), language, { weekday: "long" })
}

/**
 * Pôr alguém na aula: só nesta, como convidado, ou na turma, escolhendo os horários. Quem já está na
 * lista não aparece na busca.
 */
export function AddParticipantDialog({
  open,
  onOpenChange,
  sessionId,
  attendances,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  attendances: ClassAttendance[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { addGuest, enrollInSlots, fetchSchedule } = useAttendanceMutations(sessionId)

  const [query, setQuery] = useState("")
  const debounced = useDebouncedValue(query, SEARCH_DELAY)
  const [results, setResults] = useState<ChatLookupItem[]>([])
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busyChat, setBusyChat] = useState<string | null>(null)

  // Segundo passo: em quais horários da turma inscrever.
  const [enrolling, setEnrolling] = useState<ChatLookupItem | null>(null)
  const [windows, setWindows] = useState<ScheduleWindowOption[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  const term = debounced.trim()
  const canSearch = term.length >= MIN_QUERY

  useEffect(() => {
    if (!open || !canSearch) return
    const controller = new AbortController()
    let live = true
    setSearching(true)
    setFailed(false)
    lookupChats(term, controller.signal)
      .then((chats) => {
        if (live) setResults(chats)
      })
      .catch((cause: unknown) => {
        if (live && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setFailed(true)
          setResults([])
        }
      })
      .finally(() => {
        if (live) setSearching(false)
      })
    return () => {
      live = false
      controller.abort()
    }
  }, [canSearch, open, term])

  const present = useMemo(() => new Set(attendances.map((item) => item.chatId)), [attendances])
  const available = canSearch ? results.filter((chat) => !present.has(chat.id)) : []
  const settling = canSearch ? searching || term !== debounced.trim() : false

  function reset() {
    setQuery("")
    setResults([])
    setEnrolling(null)
    setWindows(null)
    setSelected([])
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function addAsGuest(chat: ChatLookupItem) {
    setBusyChat(chat.id)
    try {
      await addGuest(chat.id)
      toast.success(t("calendar.session.participants.addedGuest"))
      setResults((current) => current.filter((item) => item.id !== chat.id))
      onChanged()
    } catch (cause) {
      toast.error(eventErrorMessage(t, cause))
    } finally {
      setBusyChat(null)
    }
  }

  async function startEnroll(chat: ChatLookupItem) {
    setBusyChat(chat.id)
    try {
      const { windows: found } = await fetchSchedule()
      const current = found.find((item) => item.current)
      setWindows(found)
      // Começa nos horários iguais ao desta aula: é o que costuma valer.
      setSelected(
        found
          .filter((item) => item.windowStart === current?.windowStart)
          .map((item) => `${item.dayOfWeek}|${item.windowStart}`)
      )
      setEnrolling(chat)
    } catch (cause) {
      toast.error(eventErrorMessage(t, cause))
    } finally {
      setBusyChat(null)
    }
  }

  async function confirmEnroll() {
    if (!enrolling || selected.length === 0) return
    setBusyChat(enrolling.id)
    try {
      await enrollInSlots(
        enrolling.id,
        selected.map((key) => {
          const [dayOfWeek, windowStart] = key.split("|")
          return { dayOfWeek: Number(dayOfWeek), windowStart }
        })
      )
      toast.success(t("calendar.session.participants.enrolled", { count: selected.length }))
      setResults((current) => current.filter((item) => item.id !== enrolling.id))
      setEnrolling(null)
      setWindows(null)
      onChanged()
    } catch (cause) {
      toast.error(eventErrorMessage(t, cause))
    } finally {
      setBusyChat(null)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={
        enrolling
          ? t("calendar.session.participants.chooseSlots", { name: chatDisplayName(enrolling) })
          : t("calendar.session.participants.addTitle")
      }
      description={enrolling ? undefined : t("calendar.session.participants.addDescription")}
    >
      {enrolling && windows ? (
        <div className="flex flex-col gap-3">
          {windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("calendar.session.participants.noSlots")}</p>
          ) : (
            <ul className="flex flex-col">
              {windows.map((window) => {
                const key = `${window.dayOfWeek}|${window.windowStart}`
                const id = `slot-${key}`
                return (
                  <li key={key}>
                    <label
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        id={id}
                        checked={selected.includes(key)}
                        onCheckedChange={(checked) =>
                          setSelected((current) =>
                            checked === true
                              ? [...current, key]
                              : current.filter((item) => item !== key)
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 first-letter:uppercase">
                        {dayName(window.dayOfWeek, language)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {window.windowEnd
                          ? `${window.windowStart} – ${window.windowEnd}`
                          : window.windowStart}
                      </span>
                      {window.current ? (
                        <span className="text-xs text-muted-foreground">
                          {t("calendar.session.participants.thisClass")}
                        </span>
                      ) : null}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              onClick={() => {
                setEnrolling(null)
                setWindows(null)
              }}
            >
              <ArrowLeft />
              {t("calendar.common.back")}
            </Button>
            <Button
              type="button"
              className="pointer-coarse:h-10"
              disabled={selected.length === 0 || busyChat !== null}
              onClick={() => void confirmEnroll()}
            >
              {busyChat ? <Loader2 className="animate-spin" /> : null}
              {t("calendar.session.participants.enrollInSlots", { count: selected.length })}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-64 flex-col gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            debounce={0}
            shortcut={false}
            loading={settling}
            placeholder={t("calendar.session.participants.searchPlaceholder")}
          />

          {!canSearch ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("calendar.session.participants.typeMore", { count: MIN_QUERY })}
            </p>
          ) : settling && available.length === 0 ? (
            <div aria-hidden className="flex flex-col gap-2 py-1">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : failed ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              {t("calendar.session.participants.searchFailed")}
            </p>
          ) : available.length === 0 ? (
            <EmptyState title={t("calendar.session.participants.noResults")} />
          ) : (
            <ul className="flex flex-col gap-1">
              {available.map((chat) => (
                <li key={chat.id} className="flex items-center gap-2.5 py-1.5">
                  <UserAvatar
                    name={chatDisplayName(chat)}
                    src={chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {chatDisplayName(chat) || t("calendar.session.participants.noName")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {contactLine(chat.externalId)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 pointer-coarse:h-10"
                    disabled={busyChat === chat.id}
                    title={t("calendar.session.participants.onlyThisHint")}
                    onClick={() => void addAsGuest(chat)}
                  >
                    {t("calendar.session.participants.onlyThis")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 pointer-coarse:h-10"
                    disabled={busyChat === chat.id}
                    title={t("calendar.session.participants.wholeGroupHint")}
                    onClick={() => void startEnroll(chat)}
                  >
                    {t("calendar.session.participants.wholeGroup")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ResponsiveDialog>
  )
}
