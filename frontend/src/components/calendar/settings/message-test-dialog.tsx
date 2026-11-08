import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { CalendarPlus, EyeOff, FlaskConical, Loader2 } from "lucide-react"
import { useNavigate } from "@/lib/router"

import {
  Callout,
  EmptyState,
  ErrorState,
  InlineError,
  ResponsiveDialog,
  SearchableSelect,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  previewContactReminder,
  previewSequenceStep,
  useBookingPreviewMessages,
  useReminderPreviewBookings,
  useSequencePreviewBookings,
} from "@/hooks/calendar/use-attendance-sequences"
import { useCreditMutations } from "@/hooks/use-credits"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import { formatEventWhen, formatInZone, safeTimeZone } from "@/lib/calendar/timezone"
import type { AgendaCalendar, PreviewBooking, PreviewMessage } from "@/lib/calendar/types"
import { useLanguage } from "@/lib/i18n"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { calendarErrorMessage } from "./error-message"
import type { MessageKind } from "./message-rule"

/** No envio de verdade entram as últimas 30 mensagens, e a API corta nesse teto (`ChatHistory::LIMIT`). */
const HISTORY_LIMIT = 30

export type MessageTestTarget = {
  kind: MessageKind
  /** O que está sendo testado: "1 dia antes", "Passo 2: Reforço". */
  label: string
  message: string
  aiPrompt: string
}

type MessageTestDialogProps = {
  calendar: AgendaCalendar
  /** O texto como está no formulário: testar não exige salvar. */
  target: MessageTestTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Testar uma mensagem, de lembrete ou de passo: nada é enviado, nada é gravado. */
export function MessageTestDialog({ calendar, target, open, onOpenChange }: MessageTestDialogProps) {
  const session = useOpenCount(open)
  const shown = useRetained(target)

  if (session === 0 || !shown) return null

  return (
    <TestDialog
      key={session}
      calendar={calendar}
      target={shown}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

type Outcome = { kind: "result"; text: string } | { kind: "error"; error: unknown }

function TestDialog({
  calendar,
  target,
  open,
  onOpenChange,
}: MessageTestDialogProps & { target: MessageTestTarget }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const navigate = useNavigate()
  const preset = useMotionPreset()
  const { refresh: refreshCredits } = useCreditMutations()

  const timeZone = safeTimeZone(calendar.timeZone)
  const isReminder = target.kind === "reminder"
  const usesAi = Boolean(target.aiPrompt.trim())

  const reminderBookings = useReminderPreviewBookings(calendar.id, open && isReminder)
  const stepBookings = useSequencePreviewBookings(calendar.id, open && !isReminder)
  const { bookings, error, isLoading, reload } = isReminder ? reminderBookings : stepBookings

  const [bookingId, setBookingId] = useState<string | null>(null)
  const booking = bookings?.find((item) => item.id === bookingId) ?? null

  // O histórico só importa para a IA: o texto pronto sai igual, com a conversa que for.
  const showHistory = isReminder && usesAi
  const history = useBookingPreviewMessages(calendar.id, showHistory ? bookingId : null)
  // `null`: ninguém mexeu ainda, e valem as mais recentes, como no envio de verdade.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const recent = useMemo(
    () => new Set((history.messages ?? []).slice(-HISTORY_LIMIT).map((message) => message.id)),
    [history.messages]
  )
  const selected = picked ?? recent

  const [running, setRunning] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const inFlight = useRef(false)

  // Com o histórico aberto, a resposta nasce abaixo da dobra: leva o olhar até ela.
  const outcomeRegion = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (running || outcome) outcomeRegion.current?.scrollIntoView({ block: "nearest" })
  }, [outcome, running])

  const options = useMemo<SelectOption[]>(
    () =>
      (bookings ?? []).map((item) => ({
        value: item.id,
        // A busca é por este rótulo: nome, serviço e colaborador, como na origem.
        label: [item.userName || item.title || t("calendar.reminders.test.unnamed"), item.serviceName, item.professionalName]
          .filter(Boolean)
          .join(" · "),
        description: bookingDescription(item, timeZone, language, t),
      })),
    [bookings, language, t, timeZone]
  )

  function chooseBooking(id: string | null) {
    setBookingId(id)
    setPicked(null)
    setOutcome(null)
  }

  function toggleMessage(id: string, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    setPicked(next)
    setOutcome(null)
  }

  function pickAll(messages: PreviewMessage[]) {
    setPicked(new Set(messages.map((message) => message.id)))
    setOutcome(null)
  }

  async function run() {
    if (!bookingId || inFlight.current) return

    inFlight.current = true
    setRunning(true)
    setOutcome(null)

    const input = {
      bookingId,
      message: target.message.trim() || null,
      aiPrompt: usesAi ? target.aiPrompt.trim() : null,
    }

    try {
      const { message } = isReminder
        ? await previewContactReminder(calendar.id, {
            ...input,
            // Sem a lista (não carregou), a API usa o histórico normal.
            ...(showHistory && history.messages ? { messageIds: [...selected] } : {}),
          })
        : await previewSequenceStep(calendar.id, input)
      setOutcome({ kind: "result", text: message })
    } catch (cause) {
      setOutcome({ kind: "error", error: cause })
    } finally {
      inFlight.current = false
      setRunning(false)
      // A IA cobra na entrada e devolve se nada sair: o saldo certo é o do servidor.
      if (usesAi) void refreshCredits()
    }
  }

  const close = () => onOpenChange(false)
  const hasBookings = (bookings?.length ?? 0) > 0

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t(`calendar.reminders.test.title.${target.kind}`)}
      description={target.label}
      footer={
        <>
          <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
            {t("calendar.reminders.test.close")}
          </Button>
          {/* Sem agendamento para escolher, não há o que gerar: nada de botão morto. */}
          {hasBookings ? (
            <Button
              type="button"
              disabled={!bookingId}
              aria-busy={running}
              className={cn("pointer-coarse:h-10", running && "pointer-events-none opacity-80")}
              onClick={() => void run()}
            >
              {running ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              {t(usesAi ? "calendar.reminders.test.runWithAi" : "calendar.reminders.test.run")}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Callout icon={<EyeOff />}>
          {t(
            usesAi
              ? `calendar.reminders.test.notice.ai.${target.kind}`
              : "calendar.reminders.test.notice.text"
          )}
        </Callout>

        <TestedContent target={target} usesAi={usesAi} />

        {error && !bookings ? (
          <ErrorState error={error} onRetry={() => void reload()} className="p-6" />
        ) : isLoading ? (
          <div aria-hidden className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !hasBookings ? (
          <EmptyState
            icon={<CalendarPlus className="size-5" />}
            title={t("calendar.reminders.test.empty.title")}
            description={t("calendar.reminders.test.empty.description")}
            action={{
              label: t("calendar.reminders.test.empty.action"),
              onClick: () => {
                close()
                navigate("/calendar")
              },
            }}
            className="p-6"
          />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="message-test-booking">{t("calendar.reminders.test.booking")}</Label>
            <SearchableSelect
              id="message-test-booking"
              options={options}
              value={bookingId}
              onChange={(value) => chooseBooking(value)}
              placeholder={t("calendar.reminders.test.bookingPlaceholder")}
              emptyLabel={t("calendar.reminders.test.bookingEmpty")}
            />
            <p className="text-xs leading-snug text-muted-foreground">
              {t("calendar.reminders.test.bookingHint")}
            </p>
          </div>
        )}

        {showHistory && bookingId ? (
          <HistoryPicker
            messages={history.messages}
            isLoading={history.isLoading}
            failed={Boolean(history.error)}
            onRetry={() => void history.reload()}
            selected={selected}
            timeZone={timeZone}
            onToggle={toggleMessage}
            onPickAll={pickAll}
            onClear={() => {
              setPicked(new Set())
              setOutcome(null)
            }}
          />
        ) : null}

        <div ref={outcomeRegion} aria-live="polite" className="empty:hidden">
          {running ? (
            <div className="space-y-2" aria-label={t("calendar.reminders.test.running")}>
              <p className="text-sm text-muted-foreground">{t("calendar.reminders.test.running")}</p>
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : null}
          <AnimatePresence initial={false}>
            {outcome ? (
              <motion.div {...preset.slideUp}>
                {outcome.kind === "result" ? (
                  <TestResult text={outcome.text} contactName={booking?.userName ?? null} />
                ) : (
                  <TestFailure error={outcome.error} />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </ResponsiveDialog>
  )
}

function bookingDescription(
  booking: PreviewBooking,
  timeZone: string,
  language: string,
  t: (key: string) => string
) {
  const when = formatEventWhen(booking.start, booking.end, timeZone, language)
  return booking.attendanceStatus
    ? `${when} · ${t(`calendar.sequences.trigger.${booking.attendanceStatus}`)}`
    : when
}

/** O que está sendo testado, para quem esqueceu o que escreveu: o painel fica atrás deste diálogo. */
function TestedContent({ target, usesAi }: { target: MessageTestTarget; usesAi: boolean }) {
  const { t } = useTranslation()
  const fallback = target.message.trim()

  return (
    <dl className="space-y-2 text-sm">
      <div className="space-y-0.5">
        <dt className="text-xs font-medium text-muted-foreground">
          {t(usesAi ? "calendar.reminders.rule.aiPrompt" : "calendar.reminders.rule.message")}
        </dt>
        <dd className="max-h-24 overflow-y-auto text-pretty whitespace-pre-wrap">
          {usesAi ? target.aiPrompt.trim() : fallback}
        </dd>
      </div>
      {usesAi && fallback ? (
        <div className="space-y-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {t("calendar.reminders.rule.fallback")}
          </dt>
          <dd className="max-h-16 overflow-y-auto text-pretty whitespace-pre-wrap text-muted-foreground">
            {fallback}
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function HistoryPicker({
  messages,
  isLoading,
  failed,
  onRetry,
  selected,
  timeZone,
  onToggle,
  onPickAll,
  onClear,
}: {
  messages: PreviewMessage[] | undefined
  isLoading: boolean
  failed: boolean
  onRetry: () => void
  selected: Set<string>
  timeZone: string
  onToggle: (id: string, checked: boolean) => void
  onPickAll: (messages: PreviewMessage[]) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const total = messages?.length ?? 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("calendar.reminders.test.history.title")}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {total > 0
              ? t("calendar.reminders.test.history.count", { selected: selected.size, total })
              : t("calendar.reminders.test.history.hint")}
          </p>
        </div>
        {total > 0 ? (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selected.size === total}
              className="pointer-coarse:h-10"
              onClick={() => onPickAll(messages ?? [])}
            >
              {t("calendar.reminders.test.history.selectAll")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selected.size === 0}
              className="pointer-coarse:h-10"
              onClick={onClear}
            >
              {t("calendar.reminders.test.history.clear")}
            </Button>
          </div>
        ) : null}
      </div>

      {failed && !messages ? (
        <div className="rounded-lg border border-dashed">
          <InlineError onRetry={onRetry} />
        </div>
      ) : isLoading ? (
        <div aria-hidden className="flex flex-col gap-2 rounded-lg border p-3">
          <Skeleton className="h-9 w-3/4 rounded-lg" />
          <Skeleton className="ml-auto h-9 w-2/3 rounded-lg" />
          <Skeleton className="h-9 w-1/2 rounded-lg" />
        </div>
      ) : total === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t("calendar.reminders.test.history.empty")}
        </p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
          {messages?.map((message) => {
            const checked = selected.has(message.id)
            const ours = message.role === "assistant"
            return (
              <li key={message.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md p-1.5 transition-opacity hover:bg-muted/50",
                    ours && "flex-row-reverse",
                    !checked && "opacity-50"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    className="mt-1"
                    onCheckedChange={(next) => onToggle(message.id, Boolean(next))}
                  />
                  <span
                    className={cn(
                      "max-w-[85%] min-w-0 rounded-lg px-2.5 py-1.5 text-sm",
                      ours ? "bg-accent text-accent-foreground" : "bg-muted"
                    )}
                  >
                    <span className="block text-pretty break-words whitespace-pre-wrap">
                      {message.content}
                    </span>
                    <span className="mt-0.5 block text-xs opacity-70">
                      {formatInZone(message.createdAt, timeZone, language, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TestResult({ text, contactName }: { text: string; contactName: string | null }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        {contactName
          ? t("calendar.reminders.test.result.titleFor", { name: contactName })
          : t("calendar.reminders.test.result.title")}
      </p>
      <p className="rounded-lg rounded-tl-sm bg-accent px-3 py-2 text-sm text-pretty break-words whitespace-pre-wrap text-accent-foreground">
        {text.trim() || t("calendar.reminders.test.result.empty")}
      </p>
      <p className="text-xs text-muted-foreground">{t("calendar.reminders.test.result.note")}</p>
    </div>
  )
}

/** Cada falha de geração tem um recado próprio: o que houve, e o que acontece com o crédito. */
function TestFailure({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation()
  const code = error instanceof ApiError ? error.code : null
  const key = code ? `calendar.reminders.test.errors.${code}` : null
  const known = key !== null && i18n.exists(`${key}.title`)

  return (
    <Callout tone={code === "busy" ? "warning" : "danger"} role="alert" title={known ? t(`${key}.title`) : undefined}>
      {known ? t(`${key}.description`) : calendarErrorMessage(t, error)}
    </Callout>
  )
}
