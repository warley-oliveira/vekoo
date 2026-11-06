import { useMemo, useState } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  Archive,
  ArrowRightLeft,
  Check,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  UserRoundPlus,
  X,
} from "lucide-react"

import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  SegmentedControl,
  Timeline,
  type StatusTone,
  type TimelineItem,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useCardActivities,
  type ActivityGroup,
} from "@/hooks/pipelines/use-card-detail"
import { formatCurrency } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { CardActivity } from "@/lib/pipelines/types"

const ACTION_LOOK: Record<string, { icon: React.ReactNode; tone: StatusTone }> = {
  created: { icon: <Plus />, tone: "success" },
  moved: { icon: <ArrowRightLeft />, tone: "info" },
  updated: { icon: <Pencil />, tone: "neutral" },
  assigned: { icon: <UserRoundPlus />, tone: "accent" },
  commented: { icon: <MessageSquareText />, tone: "neutral" },
  archived: { icon: <Archive />, tone: "neutral" },
  auto_archived: { icon: <Archive />, tone: "neutral" },
  deal_won: { icon: <Check />, tone: "success" },
  deal_lost: { icon: <X />, tone: "danger" },
  deal_reopened: { icon: <RotateCcw />, tone: "info" },
}

const KNOWN_FIELDS = new Set([
  "title",
  "description",
  "priority",
  "due_date",
  "deal_value",
  "deal_probability",
  "company_name",
])

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value)
}

/** O que mudou, numa linha. O texto de cada detalhe vem da ação. */
function describe(activity: CardActivity, t: TFunction, language: string): string | undefined {
  const details = activity.details
  const value = (key: string) => details[key]
  const money = (amount: unknown) =>
    amount === null || amount === undefined
      ? null
      : formatCurrency(Number(amount), language)

  switch (activity.action) {
    case "moved":
      return `${text(value("fromStage"))} → ${text(value("toStage"))}`
    case "assigned":
      return `${text(value("fromAccountName"))} → ${text(value("toAccountName"))}`
    case "updated": {
      const field = String(value("field") ?? "")
      const label = KNOWN_FIELDS.has(field) ? t(`pipelines.activity.fields.${field}`) : field
      if (field === "description") return label
      return `${label}: ${text(value("oldValue"))} → ${text(value("newValue"))}`
    }
    case "commented":
      return text(value("body"))
    case "deal_lost":
      if (value("reason")) return t("pipelines.activity.lostReason", { reason: value("reason") })
      return money(value("dealValue")) ?? undefined
    case "deal_won":
    case "deal_reopened":
      return money(value("dealValue")) ?? undefined
    default:
      return undefined
  }
}

const GROUPS: ActivityGroup[] = ["all", "moves", "deals", "updates"]

/** O que aconteceu com o card, do mais novo para o mais velho. */
export function CardActivities({
  boardId,
  cardId,
  isCrm,
}: {
  boardId: string
  cardId: string
  isCrm: boolean
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [group, setGroup] = useState<ActivityGroup>("all")
  const { activities, hasMore, error, isLoading, isLoadingMore, loadMore, reload } =
    useCardActivities(boardId, cardId, group)

  const items = useMemo<TimelineItem[]>(
    () =>
      activities.map((activity) => {
        const look = ACTION_LOOK[activity.action] ?? ACTION_LOOK.updated
        const who = activity.user?.name ?? t("pipelines.activity.system")
        return {
          id: activity.id,
          icon: look?.icon,
          tone: look?.tone,
          title: t(`pipelines.activity.actions.${activity.action}`, {
            who,
            defaultValue: t("pipelines.activity.actions.unknown", { who }),
          }),
          description: describe(activity, t, language),
          time: activity.createdAt,
        }
      }),
    [activities, language, t]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <SegmentedControl<ActivityGroup>
        aria-label={t("pipelines.activity.filterLabel")}
        value={group}
        onChange={setGroup}
        options={GROUPS.filter((value) => value !== "deals" || isCrm).map((value) => ({
          value,
          label: t(`pipelines.activity.groups.${value}`),
        }))}
      />

      {isLoading ? (
        <ListSkeleton rows={5} avatar />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <EmptyState className="border-0 p-6" title={t("pipelines.activity.empty")} />
      ) : (
        <>
          <Timeline items={items} />
          {hasMore ? (
            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isLoadingMore}
                className="text-muted-foreground pointer-coarse:h-10"
                onClick={() => void loadMore()}
              >
                {t("pipelines.activity.loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
