import { memo, type MouseEvent, type SyntheticEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Flame,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  TrendingUp,
  X,
} from "lucide-react"

import { StatusBadge, TagChip, UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCardActions } from "@/hooks/pipelines/use-card-actions"
import { useBoardUi } from "@/hooks/pipelines/use-board-ui"
import { apiAssetUrl } from "@/lib/api"
import {
  contactNameOf,
  agingDays,
  dealStatusOf,
  isCloseOverdue,
  isOverdue,
  leadScoreOf,
  leadScoreTone,
  type LeadScoreConfig,
  type LeadScoreTone,
} from "@/lib/pipelines/card-meta"
import { formatDealValue, formatShortDay } from "@/lib/pipelines/format"
import type { Card } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

/** O que todo card do quadro precisa saber, e que muda junto para todos. */
export type BoardMeta = {
  isCrm: boolean
  leadScore: LeadScoreConfig | null
  language: string
  reducedMotion: boolean
}

const MAX_LABELS = 2

const SCORE_TONE: Record<LeadScoreTone, string> = {
  cold: "text-status-info",
  warm: "text-status-warning",
  hot: "text-status-success",
}

function PriorityMark({ priority }: { priority: Card["priority"] }) {
  const { t } = useTranslation()
  if (!priority || priority === "medium") return null

  const label = t(`pipelines.priority.${priority}`)
  const className = "mt-0.5 size-4 shrink-0"

  return (
    <span title={label} className="contents">
      <span className="sr-only">{label}</span>
      {priority === "urgent" ? (
        <ChevronsUp className={cn(className, "text-status-danger")} aria-hidden />
      ) : priority === "high" ? (
        <ChevronUp className={cn(className, "text-status-warning")} aria-hidden />
      ) : (
        <ChevronDown className={cn(className, "text-muted-foreground")} aria-hidden />
      )}
    </span>
  )
}

const stopDrag = (event: SyntheticEvent) => event.stopPropagation()

/** Botões dentro do card não começam arraste nem abrem o painel. */
const INNER_ACTION = {
  onMouseDown: stopDrag,
  onTouchStart: stopDrag,
  onKeyDown: stopDrag,
  onPointerDown: stopDrag,
}

function CardActionsBar({ card, isCrm }: { card: Card; isCrm: boolean }) {
  const { t } = useTranslation()
  const actions = useCardActions()
  const openMenu = useBoardUi((state) => state.openCardMenu)
  const requestLost = useBoardUi((state) => state.requestLost)
  const isOpen = !card.wonAt && !card.lostAt

  const handle = (run: () => void) => (event: MouseEvent) => {
    event.stopPropagation()
    run()
  }

  return (
    <div
      className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-lg bg-card/95 pointer-coarse:top-0 pointer-coarse:right-0 pointer-coarse:bg-transparent opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 pointer-coarse:opacity-100"
      {...INNER_ACTION}
    >
      {isCrm && isOpen ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="pointer-coarse:hidden hover:text-status-success"
            title={t("pipelines.deal.markWon")}
            aria-label={t("pipelines.deal.markWonOf", { title: card.title })}
            onClick={handle(() => void actions.closeDeal(card.id, "won"))}
          >
            <Check />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="pointer-coarse:hidden hover:text-status-danger"
            title={t("pipelines.deal.markLost")}
            aria-label={t("pipelines.deal.markLostOf", { title: card.title })}
            onClick={handle(() => requestLost(card.id))}
          >
            <X />
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="pointer-coarse:size-10"
        title={t("pipelines.card.actions")}
        aria-label={t("pipelines.card.actionsOf", { title: card.title })}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation()
          openMenu({ cardId: card.id, anchor: event.currentTarget })
        }}
      >
        <MoreHorizontal />
      </Button>
    </div>
  )
}

/** A pontuação, com a cor da faixa em que está. O quadro e a lista mostram igual. */
export function LeadScoreValue({ score, config }: { score: number; config: LeadScoreConfig }) {
  const { t } = useTranslation()
  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums"
      title={t("pipelines.card.meta.leadScore", { value: Math.round(score) })}
    >
      <TrendingUp className={cn("size-3", SCORE_TONE[leadScoreTone(score, config)])} aria-hidden />
      {Math.round(score)}
    </span>
  )
}

function CardMeta({ card, meta }: { card: Card; meta: BoardMeta }) {
  const { t } = useTranslation()
  const { language } = meta
  const status = dealStatusOf(card)
  const open = status === "open"

  const value = card.dealValue && card.dealValue > 0 ? card.dealValue : null
  const days = open ? agingDays(card) : 0
  const score = leadScoreOf(card, meta.leadScore)
  const checks =
    card.stageChecksProgress.total > 0 ? card.stageChecksProgress : card.checklistProgress
  const dueOverdue = isOverdue(card)
  const closeOverdue = isCloseOverdue(card)

  return (
    <div className="flex min-w-0 items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {value !== null ? (
          <span
            className={cn(
              "font-medium text-foreground",
              status === "won" && "text-status-success",
              status === "lost" && "font-normal text-muted-foreground line-through"
            )}
          >
            {formatDealValue(value, language)}
            {open && meta.isCrm && card.dealProbability ? (
              <span className="ml-1 font-normal text-muted-foreground">
                {card.dealProbability}%
              </span>
            ) : null}
          </span>
        ) : null}

        {card.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              dueOverdue && "font-medium text-status-danger"
            )}
            title={dueOverdue ? t("pipelines.card.meta.overdue") : t("pipelines.card.meta.due")}
          >
            <Calendar className="size-3" aria-hidden />
            {formatShortDay(card.dueDate, language)}
          </span>
        ) : card.expectedCloseDate && open ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              closeOverdue && "font-medium text-status-danger"
            )}
            title={t("pipelines.card.meta.expectedClose")}
          >
            <Calendar className="size-3" aria-hidden />
            {formatShortDay(card.expectedCloseDate, language)}
          </span>
        ) : null}

        {card.isRotting && open ? (
          <span
            className="inline-flex items-center gap-1 font-medium text-status-warning"
            title={t("pipelines.card.meta.rotting", { count: days })}
          >
            <Flame className="size-3" aria-hidden />
            {t("pipelines.card.meta.days", { count: days })}
          </span>
        ) : null}

        {checks.total > 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              checks.completed === checks.total && "text-status-success"
            )}
            title={t("pipelines.card.meta.checklist", {
              completed: checks.completed,
              total: checks.total,
            })}
          >
            <CheckSquare className="size-3" aria-hidden />
            {checks.completed}/{checks.total}
          </span>
        ) : null}

        {card.commentsCount > 0 ? (
          <span
            className="inline-flex items-center gap-1"
            title={t("pipelines.card.meta.comments", { count: card.commentsCount })}
          >
            <MessageSquareText className="size-3" aria-hidden />
            {card.commentsCount}
          </span>
        ) : null}

        {card.hasChat ? (
          <span className="inline-flex" title={t("pipelines.card.meta.chat")}>
            <MessageCircle className="size-3" aria-hidden />
            <span className="sr-only">{t("pipelines.card.meta.chat")}</span>
          </span>
        ) : null}

        {score !== null && meta.leadScore ? (
          <LeadScoreValue score={score} config={meta.leadScore} />
        ) : null}
      </div>

      {card.assignedTo ? (
        <UserAvatar
          size="sm"
          className="size-5 text-[0.625rem]"
          name={card.assignedTo.name}
          title={card.assignedTo.name}
          src={card.assignedTo.avatarUrl ? apiAssetUrl(card.assignedTo.avatarUrl) : null}
        />
      ) : null}
    </div>
  )
}

export type CardBodyProps = {
  card: Card
  meta: BoardMeta
  /** O lugar que o card ocupa enquanto está no ar: só a marca, sem conteúdo. */
  ghost?: boolean
  /** A cópia que acompanha o ponteiro. */
  overlay?: boolean
  selected?: boolean
  selecting?: boolean
  blocked?: string[]
}

/**
 * O card em si. Memorizado e sem assinar nada do arraste: é a parte cara, e só redesenha quando o
 * próprio card muda. Quem acompanha o arraste é `SortableCard`, em volta dele.
 */
export const CardBody = memo(function CardBody({
  card,
  meta,
  ghost = false,
  overlay = false,
  selected = false,
  selecting = false,
  blocked,
}: CardBodyProps) {
  const { t } = useTranslation()
  const status = dealStatusOf(card)
  const labels = card.labels.slice(0, MAX_LABELS)
  const hiddenLabels = card.labels.length - labels.length
  // Em vendas, com quem é o negócio: a empresa ou, sem ela, o contato. Nos outros, a descrição.
  const contact = meta.isCrm ? card.companyName || contactNameOf(card) : null
  const subtitle = meta.isCrm ? (contact !== card.title ? contact : null) : card.description

  return (
    <div
      className={cn(
        "group/card relative flex flex-col gap-1.5 overflow-hidden rounded-xl bg-card p-3 shadow-xs ring-1 ring-foreground/8 transition-shadow",
        !overlay && "hover:shadow-sm hover:ring-foreground/15",
        overlay && "shadow-lg ring-foreground/15",
        selected && "ring-2 ring-primary",
        blocked && "ring-status-warning",
        status === "lost" && "bg-card/70",
        // O lugar do card no ar: a mesma altura, sem o conteúdo. Mudar a altura aqui deslocaria a
        // lista bem debaixo do ponteiro.
        ghost && "bg-foreground/5 shadow-none ring-foreground/10 ring-inset [&>*]:invisible"
      )}
      aria-hidden={ghost || undefined}
    >
      {card.colorLabel ? (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-r-full"
          style={{ backgroundColor: card.colorLabel }}
        />
      ) : null}

      {labels.length > 0 || status !== "open" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1 pr-6 pointer-coarse:pr-8">
          {status === "won" ? (
            <StatusBadge tone="success">{t("pipelines.deal.won")}</StatusBadge>
          ) : status === "lost" ? (
            <StatusBadge tone="danger" title={card.lostReason ?? undefined}>
              {t("pipelines.deal.lost")}
            </StatusBadge>
          ) : null}
          {labels.map((label) => (
            <TagChip key={label.id} color={label.color} className="h-5 max-w-32 px-1.5 text-[0.6875rem]">
              {label.name}
            </TagChip>
          ))}
          {hiddenLabels > 0 ? (
            <TagChip
              className="h-5 px-1.5 text-[0.6875rem]"
              title={card.labels
                .slice(MAX_LABELS)
                .map((label) => label.name)
                .join(", ")}
            >
              +{hiddenLabels}
            </TagChip>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 items-start gap-1 pointer-coarse:pr-6">
        <PriorityMark priority={card.priority} />
        <h4 className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-medium text-pretty break-words">
          {card.title}
        </h4>
      </div>

      {subtitle ? (
        <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
      ) : null}

      <CardMeta card={card} meta={meta} />

      {blocked ? (
        <p
          className="flex items-center gap-1 text-xs font-medium text-status-warning"
          title={blocked.join("\n")}
        >
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{t("pipelines.card.blocked", { count: blocked.length })}</span>
        </p>
      ) : null}

      {selected || selecting ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-2 right-2 flex size-4 items-center justify-center rounded-full ring-1",
            selected
              ? "bg-primary text-primary-foreground ring-primary"
              : "bg-card ring-foreground/25"
          )}
        >
          {selected ? <Check className="size-3" /> : null}
        </span>
      ) : overlay || ghost ? null : (
        <CardActionsBar card={card} isCrm={meta.isCrm} />
      )}
    </div>
  )
})
