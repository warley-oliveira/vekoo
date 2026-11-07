import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ArrowRight, ChevronLeft, ChevronRight, Pencil, Plus, UserPlus } from "lucide-react"

import { ErrorState, ListSkeleton, UserAvatar } from "@/components/shared"
import type { GoalDialogState } from "@/components/pipelines-admin/goal-dialog"
import { GoalMeter } from "@/components/pipelines-admin/metrics/goal-meter"
import { RevenueGoalFigure } from "@/components/pipelines-admin/metrics/revenue-goal-figure"
import { Button } from "@/components/ui/button"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { useGoalHistory, useGoalProgress } from "@/hooks/pipelines-admin/use-goals"
import { apiAssetUrl } from "@/lib/api"
import { useLanguage } from "@/lib/i18n"
import { formatMonth, formatMonthTitle, shiftMonth } from "@/lib/pipelines-admin/format"
import type { Board } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"

const HISTORY_MONTHS = 6

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className="shrink-0 text-muted-foreground pointer-coarse:size-10"
      onClick={onClick}
    >
      <Pencil />
    </Button>
  )
}

/** As metas do mês: a do pipeline, a de cada pessoa e os últimos meses. Em chunk próprio. */
export default function BoardGoalsContent({
  board,
  month,
  currentMonth,
  onMonthChange,
  onEdit,
  onLeave,
}: {
  board: Board
  month: string
  currentMonth: string
  onMonthChange: (month: string) => void
  onEdit: (editing: { state: GoalDialogState; addable: { id: string; name: string }[] }) => void
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { progress, error, isLoading, isValidating, reload } = useGoalProgress(board.id, month)
  const { history } = useGoalHistory(board.id, month, HISTORY_MONTHS)
  const { assignable } = usePeopleOptions()

  /** Quem ainda não aparece no mês: colega novo, que ainda não tem card. */
  const addable = useMemo(() => {
    const shown = new Set([
      ...(progress?.users.map((entry) => entry.user.id) ?? []),
      ...(progress?.usersWithoutGoal.map((user) => user.id) ?? []),
    ])
    return assignable.filter((person) => !shown.has(person.id))
  }, [assignable, progress])

  const edit = (state: GoalDialogState) => onEdit({ state, addable })
  const boardGoal = t("pipelinesAdmin.goals.boardGoal")
  const hasAnyone = (progress?.users.length ?? 0) + (progress?.usersWithoutGoal.length ?? 0) > 0
  const hasHistory = history?.some((point) => point.targetValue > 0 || point.actualValue > 0)

  return (
    <div className="flex max-h-[min(38rem,75dvh)] flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2 max-md:px-0 max-md:pt-0">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("pipelinesAdmin.goals.previousMonth")}
          className="pointer-coarse:size-10"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <p aria-live="polite" className="min-w-0 flex-1 text-center font-heading text-sm font-medium">
          {formatMonthTitle(month, language)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("pipelinesAdmin.goals.nextMonth")}
          className="pointer-coarse:size-10"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && !progress ? (
          <ErrorState className="m-3" error={error} onRetry={() => void reload()} />
        ) : isLoading || !progress ? (
          <div className="p-3">
            <ListSkeleton rows={3} avatar />
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-5 p-3 motion-safe:transition-opacity max-md:px-0",
              isValidating && "opacity-70"
            )}
          >
            <section className="flex flex-col gap-2">
              <div className="flex min-h-8 items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">{boardGoal}</h3>
                {progress.funnel ? (
                  <EditButton
                    label={t("pipelines.goals.editBoard")}
                    onClick={() =>
                      edit({
                        scope: "funnel",
                        person: null,
                        goalId: progress.funnel!.goalId,
                        target: progress.funnel!.targetValue,
                      })
                    }
                  />
                ) : null}
              </div>
              {progress.funnel ? (
                <GoalMeter
                  actual={progress.funnel.actualValue}
                  target={progress.funnel.targetValue}
                  percentage={progress.funnel.progressPercentage}
                  label={boardGoal}
                />
              ) : (
                <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3">
                  <p className="text-sm text-pretty text-muted-foreground">
                    {t("pipelinesAdmin.goals.noBoardGoal.title", { month: formatMonth(month, language) })}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="pointer-coarse:h-10"
                    onClick={() => edit({ scope: "funnel", person: null, goalId: null, target: null })}
                  >
                    <Plus />
                    {t("pipelinesAdmin.goals.setBoardGoal")}
                  </Button>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-medium text-muted-foreground">{t("pipelinesAdmin.goals.byPerson")}</h3>
              {!hasAnyone ? (
                <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.goals.noPeople")}</p>
              ) : null}
              <ul className="flex flex-col gap-3">
                {progress.users.map((entry) => (
                  <li key={entry.goalId} className="flex items-start gap-2.5">
                    <UserAvatar
                      name={entry.user.name ?? ""}
                      src={entry.user.avatarUrl ? apiAssetUrl(entry.user.avatarUrl) : undefined}
                      size="sm"
                      className="mt-0.5"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="truncate text-sm font-medium">{entry.user.name}</p>
                      <GoalMeter
                        actual={entry.actualValue}
                        target={entry.targetValue}
                        percentage={entry.progressPercentage}
                        label={t("pipelinesAdmin.goals.goalOf", { name: entry.user.name })}
                      />
                    </div>
                    <EditButton
                      label={t("pipelines.goals.editOf", { name: entry.user.name })}
                      onClick={() =>
                        edit({
                          scope: "user",
                          person: entry.user,
                          goalId: entry.goalId,
                          target: entry.targetValue,
                        })
                      }
                    />
                  </li>
                ))}
                {progress.usersWithoutGoal.map((user) => (
                  <li key={user.id} className="flex items-center gap-2.5">
                    <UserAvatar
                      name={user.name ?? ""}
                      src={user.avatarUrl ? apiAssetUrl(user.avatarUrl) : undefined}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{t("pipelinesAdmin.goals.noGoalThisMonth")}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 pointer-coarse:h-10"
                      onClick={() => edit({ scope: "user", person: user, goalId: null, target: null })}
                    >
                      <Plus />
                      {t("pipelinesAdmin.goals.setGoal")}
                    </Button>
                  </li>
                ))}
              </ul>
              {board.viewerCanViewAllCards && addable.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 self-start text-muted-foreground pointer-coarse:h-10"
                  onClick={() => edit({ scope: "user", person: null, goalId: null, target: null })}
                >
                  <UserPlus />
                  {t("pipelinesAdmin.goals.setForOther")}
                </Button>
              ) : null}
            </section>

            {history && hasHistory ? (
              <RevenueGoalFigure
                history={history}
                highlightMonth={month}
                title={t("pipelinesAdmin.goals.history.title", { count: HISTORY_MONTHS })}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t px-3 py-2 max-md:px-0 max-md:pb-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-muted-foreground pointer-coarse:h-10"
          nativeButton={false}
          render={<Link to={`/pipelines/${board.id}/settings/goals${month === currentMonth ? "" : `?month=${month}`}`} />}
          onClick={onLeave}
        >
          {t("pipelines.goals.manage")}
          <ArrowRight />
        </Button>
      </div>
    </div>
  )
}
