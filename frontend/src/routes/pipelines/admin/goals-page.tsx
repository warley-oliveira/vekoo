import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router"
import { ChevronLeft, ChevronRight, Goal as GoalIcon, Pencil, Plus, Target, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  ActionsMenu,
  ComboboxField,
  CurrencyField,
  EmptyState,
  ErrorState,
  FormActions,
  ListSkeleton,
  Money,
  ResponsiveDialog,
  SectionCard,
  UserAvatar,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BoardFrame } from "@/components/pipelines-admin/board-frame"
import { GoalMeter } from "@/components/pipelines-admin/metrics/goal-meter"
import { RevenueGoalFigure } from "@/components/pipelines-admin/metrics/revenue-goal-figure"
import { usePeople } from "@/hooks/people/use-people"
import { useGoalHistory, useGoalMutations, useGoalProgress } from "@/hooks/pipelines-admin/use-goals"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { apiAssetUrl } from "@/lib/api"
import { useLanguage } from "@/lib/i18n"
import { hasGoals } from "@/lib/pipelines-admin/board-rules"
import { formatMonth, formatMonthTitle, monthOf, shiftMonth } from "@/lib/pipelines-admin/format"
import type { Board, GoalScope, PersonRef } from "@/lib/pipelines-admin/types"
import { cn } from "@/lib/utils"

const HISTORY_MONTHS = 6
/** Um pouco abaixo do teto de `numeric(12, 2)` da API. */
const MAX_TARGET = 9_999_999_999

type DialogState =
  | { kind: "closed" }
  | {
      kind: "open"
      scope: GoalScope
      /** Com a pessoa, a meta é dela. Sem pessoa numa meta individual, o diálogo pergunta quem. */
      person: PersonRef | null
      goalId: string | null
      target: number | null
    }

export default function GoalsPage() {
  const { t } = useTranslation()

  return (
    <BoardFrame
      area="goals"
      skeleton={
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <ListSkeleton rows={3} avatar />
        </div>
      }
      header={() => ({ description: t("pipelinesAdmin.goals.description") })}
    >
      {(board) => (hasGoals(board) ? <GoalsContent board={board} /> : <NotSalesBoard boardId={board.id} />)}
    </BoardFrame>
  )
}

function NotSalesBoard({ boardId }: { boardId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <EmptyState
      icon={<Target className="size-5" />}
      title={t("pipelinesAdmin.goals.notSales.title")}
      description={t("pipelinesAdmin.goals.notSales.description")}
      action={{
        label: t("pipelinesAdmin.goals.notSales.action"),
        onClick: () => navigate(`/pipelines/${boardId}/settings`),
      }}
    />
  )
}

function GoalsContent({ board }: { board: Board }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()

  const currentMonth = useMemo(() => monthOf(new Date()), [])
  const month = params.get("month") ?? currentMonth

  const { progress, error, isLoading, isValidating, reload } = useGoalProgress(board.id, month)
  const { history } = useGoalHistory(board.id, month, HISTORY_MONTHS)
  const { deleteGoal } = useGoalMutations(board.id)
  const { people } = usePeople()

  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" })
  const open = dialog.kind === "open"
  const dialogKey = useOpenCount(open)
  const shown = useRetained(open ? dialog : null)

  function goToMonth(next: string) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === currentMonth) updated.delete("month")
        else updated.set("month", next)
        return updated
      },
      { replace: true }
    )
  }

  const monthLabel = formatMonth(month, language)

  /** Quem ainda não aparece no mês: colega novo, que ainda não tem card. */
  const addable = useMemo(() => {
    const shownIds = new Set([
      ...(progress?.users.map((entry) => entry.user.id) ?? []),
      ...(progress?.usersWithoutGoal.map((user) => user.id) ?? []),
    ])
    return (people ?? []).filter(
      (person) => !person.revokedAt && !person.setupOnly && !shownIds.has(person.id)
    )
  }, [people, progress])

  async function remove(goalId: string, name: string) {
    const confirmed = await confirm({
      title: t("pipelinesAdmin.goals.delete.title", { name, month: monthLabel }),
      description: t("pipelinesAdmin.goals.delete.description"),
      confirmLabel: t("pipelinesAdmin.goals.delete.confirm"),
      destructive: true,
      onConfirm: () => deleteGoal(goalId),
    })
    if (confirmed) toast.success(t("pipelinesAdmin.goals.delete.done"))
  }

  const boardGoalName = t("pipelinesAdmin.goals.boardGoal")
  const hasAnyone = (progress?.users.length ?? 0) + (progress?.usersWithoutGoal.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("pipelinesAdmin.goals.previousMonth")}
          className="pointer-coarse:size-10"
          onClick={() => goToMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <h2 aria-live="polite" className="min-w-40 text-center font-heading text-base font-medium">
          {formatMonthTitle(month, language)}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("pipelinesAdmin.goals.nextMonth")}
          className="pointer-coarse:size-10"
          onClick={() => goToMonth(shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
        {month !== currentMonth ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-1 text-muted-foreground pointer-coarse:h-10"
            onClick={() => goToMonth(currentMonth)}
          >
            {t("pipelinesAdmin.goals.thisMonth")}
          </Button>
        ) : null}
      </div>

      {error && !progress ? (
        <ErrorState error={error} onRetry={() => void reload()} />
      ) : isLoading || !progress ? (
        <div className="flex flex-col gap-4" aria-hidden>
          <Skeleton className="h-28 w-full rounded-xl" />
          <ListSkeleton rows={3} avatar />
        </div>
      ) : (
        <div className={cn("flex flex-col gap-5 motion-safe:transition-opacity", isValidating && "opacity-70")}>
          <SectionCard
            title={boardGoalName}
            description={t("pipelinesAdmin.goals.boardGoalHint")}
            actions={
              progress.funnel ? (
                <ActionsMenu
                  label={t("pipelinesAdmin.goals.actionsOf", { name: boardGoalName })}
                  actions={[
                    {
                      label: t("pipelinesAdmin.goals.edit"),
                      icon: <Pencil />,
                      onSelect: () =>
                        setDialog({
                          kind: "open",
                          scope: "funnel",
                          person: null,
                          goalId: progress.funnel!.goalId,
                          target: progress.funnel!.targetValue,
                        }),
                    },
                    {
                      label: t("pipelinesAdmin.goals.delete.action"),
                      icon: <Trash2 />,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => void remove(progress.funnel!.goalId, boardGoalName),
                    },
                  ]}
                />
              ) : undefined
            }
          >
            {progress.funnel ? (
              <GoalMeter
                actual={progress.funnel.actualValue}
                target={progress.funnel.targetValue}
                percentage={progress.funnel.progressPercentage}
                label={boardGoalName}
              />
            ) : (
              <EmptyState
                icon={<GoalIcon className="size-5" />}
                className="p-6"
                title={t("pipelinesAdmin.goals.noBoardGoal.title", { month: monthLabel })}
                description={t("pipelinesAdmin.goals.noBoardGoal.description")}
                action={{
                  label: t("pipelinesAdmin.goals.setBoardGoal"),
                  onClick: () =>
                    setDialog({ kind: "open", scope: "funnel", person: null, goalId: null, target: null }),
                }}
              />
            )}
          </SectionCard>

          <SectionCard title={t("pipelinesAdmin.goals.byPerson")} description={t("pipelinesAdmin.goals.byPersonHint")}>
            <div className="flex flex-col gap-4">
              {!hasAnyone ? (
                <p className="text-sm text-muted-foreground">{t("pipelinesAdmin.goals.noPeople")}</p>
              ) : null}

              <ul className="flex flex-col gap-4">
                {progress.users.map((entry) => (
                  <li key={entry.goalId} className="flex items-start gap-3">
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
                    <ActionsMenu
                      label={t("pipelinesAdmin.goals.actionsOf", { name: entry.user.name })}
                      className="shrink-0"
                      actions={[
                        {
                          label: t("pipelinesAdmin.goals.edit"),
                          icon: <Pencil />,
                          onSelect: () =>
                            setDialog({
                              kind: "open",
                              scope: "user",
                              person: entry.user,
                              goalId: entry.goalId,
                              target: entry.targetValue,
                            }),
                        },
                        {
                          label: t("pipelinesAdmin.goals.delete.action"),
                          icon: <Trash2 />,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => void remove(entry.goalId, entry.user.name ?? ""),
                        },
                      ]}
                    />
                  </li>
                ))}
                {progress.usersWithoutGoal.map((user) => (
                  <li key={user.id} className="flex items-center gap-3">
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
                      onClick={() =>
                        setDialog({ kind: "open", scope: "user", person: user, goalId: null, target: null })
                      }
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
                  onClick={() =>
                    setDialog({ kind: "open", scope: "user", person: null, goalId: null, target: null })
                  }
                >
                  <UserPlus />
                  {t("pipelinesAdmin.goals.setForOther")}
                </Button>
              ) : null}
            </div>
          </SectionCard>

          {history?.some((point) => point.targetValue > 0 || point.actualValue > 0) ? (
            <RevenueGoalFigure
              history={history}
              highlightMonth={month}
              title={t("pipelinesAdmin.goals.history.title", { count: HISTORY_MONTHS })}
              description={t("pipelinesAdmin.goals.history.description")}
            />
          ) : null}
        </div>
      )}

      {shown && shown.kind === "open" ? (
        <GoalDialog
          key={dialogKey}
          board={board}
          month={month}
          state={shown}
          addable={addable}
          open={open}
          onOpenChange={(next) => {
            if (!next) setDialog({ kind: "closed" })
          }}
        />
      ) : null}
    </div>
  )
}

function GoalDialog({
  board,
  month,
  state,
  addable,
  open,
  onOpenChange,
}: {
  board: Board
  month: string
  state: Extract<DialogState, { kind: "open" }>
  addable: { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { createGoal, updateGoal } = useGoalMutations(board.id)

  const askPerson = state.scope === "user" && !state.person

  const schema = useMemo(
    () =>
      z.object({
        target: z
          .number({ error: t("pipelinesAdmin.goals.form.targetRequired") })
          .positive(t("pipelinesAdmin.goals.form.targetRequired"))
          .max(MAX_TARGET, t("pipelinesAdmin.goals.form.targetTooHigh"))
          .nullable()
          .refine((value) => value !== null, t("pipelinesAdmin.goals.form.targetRequired")),
        accountId: z
          .string()
          .nullable()
          .refine((value) => !askPerson || Boolean(value), t("pipelinesAdmin.goals.form.personRequired")),
      }),
    [askPerson, t]
  )

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { target: state.target, accountId: state.person?.id ?? null },
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const targetValue = values.target
    if (state.goalId) {
      await updateGoal(state.goalId, { targetValue })
    } else {
      await createGoal({
        scope: state.scope,
        assignedAccountId: state.scope === "user" ? values.accountId : null,
        periodMonth: month,
        targetValue,
      })
    }
    toast.success(t("pipelinesAdmin.goals.form.saved"))
    close()
  })

  const who = state.scope === "funnel" ? t("pipelinesAdmin.goals.boardGoal") : state.person?.name

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={
        state.goalId ? t("pipelinesAdmin.goals.form.editTitle") : t("pipelinesAdmin.goals.form.createTitle")
      }
      description={[who, formatMonth(month, language)].filter(Boolean).join(" · ")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("pipelinesAdmin.goals.form.submit")}
          onCancel={close}
          requireChanges={Boolean(state.goalId)}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {askPerson ? (
          <ComboboxField
            control={form.control}
            name="accountId"
            label={t("pipelinesAdmin.goals.form.person")}
            options={addable.map((person) => ({ value: person.id, label: person.name }))}
            placeholder={t("pipelinesAdmin.goals.form.personPlaceholder")}
          />
        ) : null}
        <CurrencyField
          control={form.control}
          name="target"
          label={t("pipelinesAdmin.goals.form.target")}
          hint={t("pipelinesAdmin.goals.form.targetHint")}
        />
        {state.target ? (
          <p className="text-xs text-muted-foreground">
            {t("pipelinesAdmin.goals.form.current")} <Money value={state.target} />
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
