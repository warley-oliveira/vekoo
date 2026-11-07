import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Check,
  MessageCircle,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import {
  AvatarStack,
  Callout,
  CopyButton,
  CurrencyInput,
  DatePicker,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  NumberInput,
  SearchableSelect,
  SegmentedControl,
  SelectInput,
  SidePanel,
  StatusBadge,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useBoardHandle } from "@/hooks/pipelines/board-handle"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { useBoardChannelParams } from "@/hooks/pipelines/use-board-realtime"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { useCardDetail, useWatchCard } from "@/hooks/pipelines/use-card-detail"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { useChannel } from "@/hooks/use-channel"
import { useLanguage } from "@/lib/i18n"
import { ApiError, apiAssetUrl } from "@/lib/api"
import { formatDate } from "@/lib/date-format"
import { endOfDay } from "@/lib/date-format"
import { formatCurrency } from "@/lib/format-number"
import { agingDays, contactPhoneOf, dealStatusOf, localDayKey, parseDayKey } from "@/lib/pipelines/card-meta"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import {
  CARD_PRIORITIES,
  type BoardDetail,
  type BoardEvent,
  type CardDetail,
  type CardLabel,
  type CardPriority,
} from "@/lib/pipelines/types"
import { useSession } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { AttachmentsSection } from "./attachments-section"
import { CardActivities } from "./card-activities"
import { HiddenLabel } from "@/components/pipelines/hidden-label"
import { CardComments } from "./card-comments"
import { ChatLink } from "./chat-link"
import { ChecklistsSection, StageChecksSection } from "./checklists-section"
import { CustomFieldsSection } from "./custom-fields-section"
import { LabelPicker } from "./label-picker"
import { StageTrack } from "./stage-track"

const DescriptionEditor = lazy(() => import("./description-editor"))

type PanelTab = "details" | "comments" | "activity"

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium">{children}</h3>
}

/** O título é editável no lugar: texto até clicar, e salva ao sair ou com Enter. */
function EditableTitle({
  value,
  onCommit,
}: {
  value: string
  onCommit: (title: string) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${node.scrollHeight}px`
  }, [draft])

  function commit() {
    const title = draft.trim()
    if (!title) {
      setDraft(value)
      toast.error(t("pipelines.card.titleRequired"))
      return
    }
    if (title !== value) onCommit(title)
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={draft}
      maxLength={500}
      aria-label={t("pipelines.card.titleLabel")}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === "Escape") {
          event.stopPropagation()
          setDraft(value)
        }
      }}
      className="w-full resize-none overflow-hidden rounded-md bg-transparent px-1 py-0.5 font-heading text-xl leading-snug font-semibold tracking-tight outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  )
}

/** Valor com máscara: salva ao sair do campo, para não mandar uma escrita a cada dígito. */
function CommitCurrency({
  value,
  disabled,
  label,
  onCommit,
}: {
  value: number | null
  disabled?: boolean
  label: string
  onCommit: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <CurrencyInput
      aria-label={label}
      disabled={disabled}
      value={draft}
      onChange={setDraft}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
    />
  )
}

function CommitNumber({
  value,
  min,
  max,
  disabled,
  label,
  onCommit,
}: {
  value: number | null
  min?: number
  max?: number
  disabled?: boolean
  label: string
  onCommit: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <HiddenLabel text={label}>
      {(id) => (
        <NumberInput
          id={id}
          disabled={disabled}
          min={min}
          max={max}
          value={draft}
          onChange={setDraft}
          onBlur={() => {
            if (draft !== value) onCommit(draft)
          }}
        />
      )}
    </HiddenLabel>
  )
}

function CommitText({
  value,
  label,
  type = "text",
  placeholder,
  onCommit,
}: {
  value: string | null
  label: string
  type?: string
  placeholder?: string
  onCommit: (value: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? "")
  useEffect(() => setDraft(value ?? ""), [value])
  return (
    <Input
      aria-label={label}
      type={type}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim() || null
        if (next !== value) onCommit(next)
      }}
    />
  )
}

const CardDetails = memo(function CardDetails({
  card,
  board,
}: {
  card: CardDetail
  board: BoardDetail
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const actions = useCardActions()
  const requestLost = useBoardUi((state) => state.requestLost)
  const { people, assignable } = usePeopleOptions()

  const isCrm = board.boardType === "crm"
  const status = dealStatusOf(card)
  const closed = status !== "open"
  const stages = board.stages
  const stageName = stages.find((stage) => stage.id === card.stageId)?.name ?? ""

  const save = useCallback(
    (patch: Parameters<typeof actions.update>[1], optimistic?: Parameters<typeof actions.update>[2]) =>
      actions.update(card.id, patch, optimistic).catch(() => undefined),
    [actions, card.id]
  )

  const onMove = useCallback(
    (stageId: string) => void actions.moveTo(card.id, stageId),
    [actions, card.id]
  )

  const assigneeOptions = useMemo(() => {
    const options = assignable.map((person) => ({
      value: person.id,
      label: person.name,
      description: person.email ?? undefined,
    }))
    // Quem só configura não aparece na lista, mas pode já ser o responsável.
    if (card.assignedTo && !assignable.some((person) => person.id === card.assignedToId)) {
      options.unshift({
        value: card.assignedTo.id,
        label: card.assignedTo.name,
        description: card.assignedTo.email ?? undefined,
      })
    }
    return options
  }, [assignable, card.assignedTo, card.assignedToId])

  const priorityOptions = useMemo(
    () =>
      CARD_PRIORITIES.map((priority) => ({
        value: priority,
        label: t(`pipelines.priority.${priority}`),
      })),
    [t]
  )

  const phone = contactPhoneOf(card)
  const weighted =
    card.dealValue && card.dealProbability ? (card.dealValue * card.dealProbability) / 100 : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-3 pb-8">
      <div className="flex flex-col gap-3">
        <EditableTitle
          value={card.title}
          onCommit={(title) => void save({ title }, { title })}
        />

        {isCrm ? (
          closed ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={status === "won" ? "success" : "danger"}>
                {t(`pipelines.deal.${status}`)}
                {card.wonAt || card.lostAt
                  ? ` · ${formatDate((card.wonAt ?? card.lostAt) as number, language)}`
                  : ""}
              </StatusBadge>
              {card.lostReason ? (
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {card.lostReason}
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto pointer-coarse:h-10"
                onClick={() => void actions.reopen(card.id)}
              >
                <RotateCcw />
                {t("pipelines.deal.reopen")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => void actions.closeDeal(card.id, "won")}
              >
                <Check className="text-status-success" />
                {t("pipelines.deal.markWon")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => requestLost(card.id)}
              >
                <X className="text-status-danger" />
                {t("pipelines.deal.markLost")}
              </Button>
            </div>
          )
        ) : null}
      </div>

      <StageTrack card={card} stages={stages} onMove={onMove} />

      <section aria-label={t("pipelines.card.properties")} className="flex flex-col gap-2">
        <PropertyRow label={t("pipelines.card.assignee")}>
          <HiddenLabel text={t("pipelines.card.assignee")}>
            {(id) => (
              <SearchableSelect
                id={id}
                clearable
                placeholder={t("pipelines.card.noAssignee")}
                value={card.assignedToId}
                options={assigneeOptions}
                onChange={(assignedToId) => {
                  const person = people.find((candidate) => candidate.id === assignedToId) ?? null
                  void save({ assignedToId }, { assignedToId, assignedTo: person })
                }}
              />
            )}
          </HiddenLabel>
        </PropertyRow>
        <PropertyRow label={t("pipelines.card.priority")}>
          <SelectInput
            aria-label={t("pipelines.card.priority")}
            clearLabel={t("pipelines.priority.none")}
            placeholder={t("pipelines.priority.none")}
            value={card.priority}
            options={priorityOptions}
            onChange={(next) => {
              const priority = next as CardPriority | null
              void save({ priority }, { priority })
            }}
          />
        </PropertyRow>
        <PropertyRow label={t("pipelines.card.dueDate")}>
          <DatePicker
            label={t("pipelines.card.dueDate")}
            clearable
            placeholder={t("pipelines.card.noDueDate")}
            value={card.dueDate ? new Date(card.dueDate) : null}
            onChange={(date) => {
              // O prazo é o dia todo: escolher hoje não pode já nascer vencido.
              const dueDate = date ? endOfDay(date).getTime() : null
              void save({ dueDate }, { dueDate })
            }}
          />
        </PropertyRow>
        <PropertyRow label={t("pipelines.card.labels")}>
          <LabelPicker
            value={card.labels}
            onChange={(labels: CardLabel[]) =>
              void save({ labelIds: labels.map((label) => label.id) }, { labels })
            }
          />
        </PropertyRow>
        <PropertyRow label={t("pipelines.card.chat")}>
          <ChatLink card={card} onLink={(chatId) => void save({ chatId })} />
        </PropertyRow>
      </section>

      {isCrm ? (
        <section className="flex flex-col gap-2" aria-labelledby="card-deal-title">
          <h3 id="card-deal-title" className="text-sm font-medium">
            {t("pipelines.deal.title")}
          </h3>
          <PropertyRow label={t("pipelines.deal.value")}>
            <CommitCurrency
              label={t("pipelines.deal.value")}
              disabled={closed}
              value={card.dealValue}
              onCommit={(dealValue) => void save({ dealValue }, { dealValue })}
            />
          </PropertyRow>
          <PropertyRow label={t("pipelines.deal.probability")}>
            <CommitNumber
              label={t("pipelines.deal.probability")}
              disabled={closed}
              min={0}
              max={100}
              value={card.dealProbability}
              onCommit={(dealProbability) => void save({ dealProbability }, { dealProbability })}
            />
          </PropertyRow>
          <PropertyRow label={t("pipelines.deal.expectedClose")}>
            <DatePicker
              label={t("pipelines.deal.expectedClose")}
              clearable
              disabled={closed}
              value={card.expectedCloseDate ? parseDayKey(card.expectedCloseDate) : null}
              onChange={(date) => {
                const expectedCloseDate = date ? localDayKey(date) : null
                void save({ expectedCloseDate }, { expectedCloseDate })
              }}
            />
          </PropertyRow>
          <PropertyRow label={t("pipelines.deal.aging")}>
            <p
              className={cn(
                "text-sm",
                card.isRotting && !closed && "font-medium text-status-warning"
              )}
            >
              {agingDays(card) > 0
                ? t("pipelines.track.daysHere", { count: agingDays(card) })
                : t("pipelines.track.enteredToday")}
              {card.isRotting && !closed ? ` · ${t("pipelines.deal.rotting")}` : ""}
            </p>
          </PropertyRow>
          {weighted !== null ? (
            <PropertyRow label={t("pipelines.deal.weighted")}>
              <p className="text-sm tabular-nums">{formatCurrency(weighted, language)}</p>
            </PropertyRow>
          ) : null}
          <PropertyRow label={t("pipelines.contact.company")}>
            <CommitText
              label={t("pipelines.contact.company")}
              value={card.companyName}
              onCommit={(companyName) => void save({ companyName }, { companyName })}
            />
          </PropertyRow>
          <PropertyRow label={t("pipelines.contact.email")}>
            <div className="flex items-center gap-1">
              <CommitText
                type="email"
                label={t("pipelines.contact.email")}
                value={card.contactEmail}
                onCommit={(contactEmail) => void save({ contactEmail }, { contactEmail })}
              />
              {card.contactEmail ? (
                <CopyButton
                  value={card.contactEmail}
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-muted-foreground pointer-coarse:size-10"
                  aria-label={t("pipelines.contact.copyEmail")}
                />
              ) : null}
            </div>
          </PropertyRow>
          <PropertyRow label={t("pipelines.contact.phone")}>
            <div className="flex items-center gap-1">
              <CommitText
                label={t("pipelines.contact.phone")}
                value={card.contactPhone}
                // O número da conversa ligada, quando o card não tem um próprio.
                placeholder={phone ?? undefined}
                onCommit={(contactPhone) => void save({ contactPhone }, { contactPhone })}
              />
              {phone ? (
                <>
                  <CopyButton
                    value={phone}
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground pointer-coarse:size-10"
                    aria-label={t("pipelines.contact.copyPhone")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    nativeButton={false}
                    className="shrink-0 text-muted-foreground pointer-coarse:size-10"
                    aria-label={t("pipelines.contact.whatsapp")}
                    title={t("pipelines.contact.whatsapp")}
                    render={
                      <a
                        href={`https://wa.me/${phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <MessageCircle />
                  </Button>
                </>
              ) : null}
            </div>
          </PropertyRow>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionTitle>{t("pipelines.description.title")}</SectionTitle>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}>
          <DescriptionEditor
            value={card.descriptionJson}
            fallbackText={card.description}
            onSave={(descriptionJson) => actions.update(card.id, { descriptionJson })}
          />
        </Suspense>
      </section>

      <StageChecksSection
        boardId={board.id}
        cardId={card.id}
        stageId={card.stageId}
        stageName={stageName}
      />

      <CustomFieldsSection
        card={card}
        customFields={board.customFields}
        stages={stages}
        onChange={(key, value) => {
          // O PATCH substitui o mapa inteiro: sem juntar, preencher um campo apagaria os outros.
          const customFieldValues = { ...card.customFieldValues, [key]: value }
          void save({ customFieldValues }, { customFieldValues })
        }}
      />

      <ChecklistsSection boardId={board.id} cardId={card.id} />
      <AttachmentsSection boardId={board.id} cardId={card.id} />
    </div>
  )
})

type CardPanelProps = {
  board: BoardDetail
  cardId: string
  open: boolean
  onClose: () => void
}

/** O card aberto, em painel lateral. O endereço (`?card=`) diz qual é, então o link leva até ele. */
export default function CardPanel({ board, cardId, open, onClose }: CardPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const handle = useBoardHandle()
  const actions = useCardActions()
  const session = useSession()
  const params = useBoardChannelParams(board.id)
  const { card, error, isLoading, reload } = useCardDetail(board.id, cardId)
  const watch = useWatchCard(board.id, cardId)

  const [tab, setTab] = useState<PanelTab>("details")

  // Outra pessoa apagou o card aberto: fecha, e explica. O próprio apagar já avisou.
  useChannel<BoardEvent>("PipelineBoardChannel", params, (message) => {
    if (message.event === "card_deleted" && message.data.id === cardId && !handle.pending.has(cardId)) {
      toast.info(t("pipelines.card.deletedElsewhere"))
      onClose()
    }
  })

  const notFound = error instanceof ApiError && error.status === 404
  const accountId = session.account.id
  const isWatching = Boolean(card?.watchers.some((person) => person.id === accountId))
  const stageName = board.stages.find((stage) => stage.id === card?.stageId)?.name

  async function toggleWatch() {
    if (!card) return
    const next = !isWatching
    const me = {
      id: accountId,
      name: session.account.name,
      email: session.account.email,
      avatarUrl: session.account.avatarUrl ?? null,
    }
    const update = (current?: CardDetail) =>
      current
        ? {
            ...current,
            watchers: next
              ? [...current.watchers, me]
              : current.watchers.filter((person) => person.id !== accountId),
          }
        : current
    void reload(update, { revalidate: false })
    try {
      await watch(next)
      toast.success(t(next ? "pipelines.card.watching" : "pipelines.card.notWatching"))
    } catch (failure) {
      void reload()
      toast.error(pipelineErrorText(t, failure, "pipelines.errors.saveFailed"))
    }
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="xl"
      title={
        <span className="text-sm font-normal text-muted-foreground">
          {card ? <span className="sr-only">{card.title}. </span> : null}
          {stageName ?? t("pipelines.card.loadingTitle")}
        </span>
      }
      description={
        card
          ? [
              t("pipelines.card.createdAt", { date: formatDate(card.createdAt, language) }),
              card.completedAt
                ? t("pipelines.card.completedAt", { date: formatDate(card.completedAt, language) })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      headerActions={
        card ? (
          <>
            {card.watchers.length > 0 ? (
              <AvatarStack
                users={card.watchers.map((person) => ({
                  ...person,
                  avatarUrl: person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null,
                }))}
                max={3}
                className="mr-1 hidden sm:flex"
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn("pointer-coarse:size-10", isWatching ? "text-primary" : "text-muted-foreground")}
              aria-pressed={isWatching}
              aria-label={t(isWatching ? "pipelines.card.unwatch" : "pipelines.card.watch")}
              title={t(isWatching ? "pipelines.card.unwatch" : "pipelines.card.watch")}
              onClick={() => void toggleWatch()}
            >
              {isWatching ? <Bell className="fill-current" /> : <BellOff />}
            </Button>
            <CopyButton
              value={window.location.href}
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground pointer-coarse:size-10"
              aria-label={t("pipelines.card.copyLink")}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground pointer-coarse:size-10"
                    aria-label={t("pipelines.card.actions")}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {card.archived ? (
                  <DropdownMenuItem onClick={() => void actions.unarchive(card.id)}>
                    <ArchiveRestore />
                    {t("pipelines.card.unarchive")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      void actions.archive(card.id)
                      onClose()
                    }}
                  >
                    <Archive />
                    {t("pipelines.card.archive")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void actions.remove(card)}>
                  <Trash2 />
                  {t("pipelines.card.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null
      }
      bodyClassName="flex flex-col overflow-hidden p-0"
    >
      {isLoading ? (
        <div className="p-4">
          <DetailSkeleton rows={6} />
        </div>
      ) : notFound ? (
        <EmptyState
          className="m-4 border-0"
          title={t("pipelines.card.notFound")}
          description={t("pipelines.card.notFoundHint")}
          action={{ label: t("pipelines.card.backToBoard"), onClick: onClose }}
        />
      ) : error || !card ? (
        <ErrorState className="m-4" error={error} onRetry={() => void reload()} />
      ) : (
        <>
          {card.archived ? (
            <Callout tone="warning" className="mx-4 mt-3">
              {t("pipelines.card.archivedNotice")}
            </Callout>
          ) : null}

          <div className="shrink-0 border-b px-4 py-2">
            <SegmentedControl<PanelTab>
              fullWidth
              aria-label={t("pipelines.card.sections")}
              value={tab}
              onChange={setTab}
              options={[
                { value: "details", label: t("pipelines.card.tabDetails") },
                {
                  value: "comments",
                  label: t("pipelines.card.tabComments"),
                  count: card.commentsCount,
                },
                { value: "activity", label: t("pipelines.card.tabActivity") },
              ]}
            />
          </div>

          {tab === "details" ? <CardDetails card={card} board={board} /> : null}
          {tab === "comments" ? (
            <CardComments boardId={board.id} cardId={card.id} accountId={accountId} />
          ) : null}
          {tab === "activity" ? (
            <CardActivities
              boardId={board.id}
              cardId={card.id}
              isCrm={board.boardType === "crm"}
            />
          ) : null}
        </>
      )}
    </SidePanel>
  )
}
