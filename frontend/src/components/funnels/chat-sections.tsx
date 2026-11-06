import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown, Pencil, X } from "lucide-react"
import { toast } from "sonner"

import { InlineError, ListSkeleton, SelectInput, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { parseDay } from "@/hooks/insights/use-dashboard-period"
import { useChatBookings, useChatMessages, useChatMutations } from "@/hooks/insights/use-funnel-chat"
import { formatDate, formatDateTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { funnelErrorMessage } from "./error-message"
import type { ChatAttributeDefinition, ChatMessage } from "./types"

/** Um bloco do painel: título quieto, conteúdo logo abaixo. */
export function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ---------- nota ---------- */

export function ChatNotes({
  chatId,
  notes,
  readOnly,
  onSaved,
}: {
  chatId: string
  notes: string | null
  readOnly: boolean
  onSaved: (notes: string | null) => void
}) {
  const { t } = useTranslation()
  const { updateChat } = useChatMutations(chatId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true)
    const value = draft.trim() || null
    try {
      await updateChat({ notes: value })
      onSaved(value)
      setEditing(false)
      toast.success(t("funnels.panel.noteSaved"))
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelSection
      title={t("funnels.panel.notes")}
      action={
        !editing && !readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground pointer-coarse:h-8"
            onClick={() => {
              setDraft(notes ?? "")
              setEditing(true)
            }}
          >
            <Pencil />
            {notes ? t("funnels.panel.editNote") : t("funnels.panel.addNote")}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            value={draft}
            aria-label={t("funnels.panel.notes")}
            placeholder={t("funnels.panel.notePlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void save()
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>
              {t("funnels.panel.cancel")}
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
              {t("funnels.panel.saveNote")}
            </Button>
          </div>
        </div>
      ) : notes ? (
        <p className="text-sm break-words whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("funnels.panel.noNotes")}</p>
      )}
    </PanelSection>
  )
}

/* ---------- campos do contato ---------- */

type ChatAttributesProps = {
  chatId: string
  definitions: ChatAttributeDefinition[]
  values: Record<string, string>
}

export function ChatAttributes({ chatId, definitions, values }: ChatAttributesProps) {
  const { t } = useTranslation()
  const [showBlanks, setShowBlanks] = useState(false)

  const isFilled = (definition: ChatAttributeDefinition) => Boolean(values[definition.key])
  const filled = definitions.filter(isFilled)
  const blank = definitions.filter((definition) => !isFilled(definition))
  const visible = showBlanks ? definitions : filled

  if (definitions.length === 0) return null

  return (
    <PanelSection
      title={t("funnels.panel.fields")}
      action={
        blank.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground pointer-coarse:h-8"
            aria-expanded={showBlanks}
            onClick={() => setShowBlanks((current) => !current)}
          >
            {showBlanks
              ? t("funnels.panel.hideBlanks")
              : t("funnels.panel.showBlanks", { count: blank.length })}
          </Button>
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("funnels.panel.noFields")}</p>
      ) : (
        <dl className="flex flex-col gap-1">
          {visible.map((definition) => (
            <AttributeRow
              key={definition.key}
              chatId={chatId}
              definition={definition}
              value={values[definition.key] ?? ""}
            />
          ))}
        </dl>
      )}
    </PanelSection>
  )
}

function AttributeRow({
  chatId,
  definition,
  value,
}: {
  chatId: string
  definition: ChatAttributeDefinition
  value: string
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { updateAttribute } = useChatMutations(chatId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  async function save(next: string) {
    if (saving) return
    setSaving(true)
    try {
      await updateAttribute(definition.key, next.trim() ? next : null)
      setEditing(false)
      toast.success(t("funnels.panel.fieldSaved", { name: definition.name }))
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
    } finally {
      setSaving(false)
    }
  }

  const shown = (() => {
    if (!value) return null
    if (definition.valueType === "checkbox") return t(value === "true" ? "funnels.panel.yes" : "funnels.panel.no")
    if (definition.valueType === "date") {
      const date = parseDay(value)
      return date ? formatDate(date, language, "short") : value
    }
    return value
  })()

  const label = (
    <dt className="min-w-0 truncate text-sm text-muted-foreground" title={definition.description ?? definition.name}>
      {definition.name}
    </dt>
  )

  // Sim ou não vale na hora, como todo interruptor do produto.
  if (definition.valueType === "checkbox") {
    return (
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 py-0.5">
        {label}
        <dd className="m-0">
          <Switch
            checked={value === "true"}
            disabled={saving}
            aria-label={definition.name}
            onCheckedChange={(checked) => void save(checked ? "true" : "false")}
          />
        </dd>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-3 py-0.5">
      {label}
      <dd className="m-0 min-w-0">
        {editing ? (
          definition.valueType === "list" ? (
            <SelectInput
              aria-label={definition.name}
              disabled={saving}
              value={value || null}
              clearLabel={t("funnels.panel.clearField")}
              options={definition.optionValues.map((option) => ({ value: option, label: option }))}
              onChange={(next) => void save(next ?? "")}
            />
          ) : (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                aria-label={definition.name}
                type={definition.valueType === "number" ? "number" : definition.valueType === "date" ? "date" : "text"}
                value={draft}
                disabled={saving}
                className="min-w-0 flex-1"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void save(draft)
                  }
                  if (event.key === "Escape") {
                    event.stopPropagation()
                    setEditing(false)
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("funnels.panel.saveField", { name: definition.name })}
                disabled={saving}
                onClick={() => void save(draft)}
              >
                <Check />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("funnels.panel.cancel")}
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                <X />
              </Button>
            </div>
          )
        ) : (
          <button
            type="button"
            aria-label={t("funnels.panel.editField", { name: definition.name })}
            className="group flex min-h-6 w-full min-w-0 items-center gap-1 rounded text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
            onClick={() => {
              setDraft(value)
              setEditing(true)
            }}
          >
            <span className={cn("min-w-0 flex-1 break-words", !shown && "text-muted-foreground")}>
              {shown ?? t("funnels.panel.blank")}
            </span>
            <Pencil
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100"
            />
          </button>
        )}
      </dd>
    </div>
  )
}

/* ---------- agendamentos ---------- */

export function ChatBookings({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { allowed, bookings, isLoading } = useChatBookings(chatId)

  if (!allowed) return null

  // Mais recentes primeiro, como na origem: o que interessa é o próximo ou o último.
  const sorted = [...(bookings ?? [])]
    .filter((event) => event.type === "booking")
    .sort((a, b) => b.start - a.start)

  return (
    <PanelSection title={t("funnels.panel.bookings")}>
      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("funnels.panel.noBookings")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((booking) => (
            <li key={booking.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-muted-foreground/50"
                // Cor escolhida pela pessoa, como etiqueta.
                style={booking.color ? { backgroundColor: booking.color } : undefined}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={booking.title ?? undefined}>
                  {booking.title || t("funnels.panel.untitledBooking")}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(booking.start, language)}</p>
              </div>
              {booking.status === "canceled" ? (
                <StatusBadge tone="neutral">{t("funnels.panel.bookingCanceled")}</StatusBadge>
              ) : booking.attendanceStatus === "show" ? (
                <StatusBadge tone="success">{t("funnels.panel.bookingShow")}</StatusBadge>
              ) : booking.attendanceStatus === "no_show" ? (
                <StatusBadge tone="danger">{t("funnels.panel.bookingNoShow")}</StatusBadge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  )
}

/* ---------- histórico ---------- */

/** Fechado de início: o histórico é mais uma consulta, e só importa a quem abrir. */
export function ChatHistory({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <PanelSection
      title={t("funnels.panel.history")}
      action={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground pointer-coarse:h-8"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {t(open ? "funnels.panel.hideHistory" : "funnels.panel.showHistory")}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      }
    >
      {open ? <HistoryList chatId={chatId} /> : null}
    </PanelSection>
  )
}

function HistoryList({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const { messages, error, isLoading, isLoadingMore, hasMore, loadMore, reload } = useChatMessages(chatId)
  const endRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)

  // A mensagem que importa é a última: abre com ela à vista.
  useEffect(() => {
    if (messages?.length && !scrolled.current) {
      scrolled.current = true
      endRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [messages])

  if (error && !messages) return <InlineError onRetry={reload} />
  if (isLoading && !messages) return <ListSkeleton rows={3} />
  if (!messages?.length) return <p className="text-sm text-muted-foreground">{t("funnels.panel.noMessages")}</p>

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2">
      {hasMore ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="self-center text-muted-foreground pointer-coarse:h-8"
          disabled={isLoadingMore}
          onClick={() => void loadMore()}
        >
          {t("funnels.panel.olderMessages")}
        </Button>
      ) : null}
      <ol className="flex flex-col gap-1.5">
        {messages.map((message) => (
          <HistoryMessage key={message.id} message={message} />
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  )
}

function HistoryMessage({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const text = message.content?.trim()
  const media =
    message.typeElement && message.typeElement !== "text"
      ? t(`funnels.card.preview.${["image", "audio"].includes(message.typeElement) ? message.typeElement : "media"}`)
      : null
  const body = (text && text !== "-" ? text : null) ?? message.caption ?? media

  // Nota do sistema (atribuição, sequência): uma linha discreta, sem balão.
  if (message.role === "base") {
    return <li className="px-2 py-0.5 text-center text-xs text-muted-foreground">{body}</li>
  }

  const fromContact = message.role === "user"

  return (
    <li className={cn("flex", fromContact ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm",
          fromContact ? "bg-card ring-1 ring-foreground/10" : "bg-accent text-accent-foreground"
        )}
      >
        {!fromContact && message.senderName ? (
          <p className="truncate text-xs font-medium opacity-80">{message.senderName}</p>
        ) : null}
        <p className="break-words whitespace-pre-wrap">{body}</p>
        <p className="mt-0.5 text-right text-[11px] opacity-60">{formatDateTime(message.createdAt, language)}</p>
      </div>
    </li>
  )
}
