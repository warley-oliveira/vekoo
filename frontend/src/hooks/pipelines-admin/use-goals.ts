import { useCallback } from "react"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type { Goal, GoalHistoryPoint, GoalProgress } from "@/lib/pipelines-admin/types"
import { boardKey, useRevalidateBoard } from "./use-board"

type GoalInput = Partial<Pick<Goal, "scope" | "assignedAccountId" | "periodMonth" | "targetValue">>

/** O atingimento das metas de um mês. */
export function useGoalProgress(boardId: string, month: string, { enabled = true } = {}) {
  const { data, error, isLoading, isValidating, mutate } = useApi<GoalProgress>(
    enabled ? `${boardKey(boardId)}/goals/progress?month=${month}` : null,
    { keepPreviousData: true }
  )

  return {
    progress: data,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

/** A meta do quadro contra a receita ganha, mês a mês, até `month`. */
export function useGoalHistory(boardId: string, month: string, months = 6, { enabled = true } = {}) {
  const { data, error, isLoading, isValidating, mutate } = useApi<{ history: GoalHistoryPoint[] }>(
    enabled ? `${boardKey(boardId)}/goals/history?month=${month}&months=${months}` : null,
    { keepPreviousData: true }
  )

  return {
    history: data?.history,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export function useGoalMutations(boardId: string) {
  const revalidate = useRevalidateBoard(boardId)
  const base = `${boardKey(boardId)}/goals`

  const createGoal = useCallback(
    async (input: GoalInput) => {
      const goal = await apiPost<Goal>(base, { goal: { metric: "revenue", ...input } })
      await revalidate()
      return goal
    },
    [base, revalidate]
  )

  const updateGoal = useCallback(
    async (id: string, input: GoalInput) => {
      const goal = await apiPatch<Goal>(`${base}/${id}`, { goal: input })
      await revalidate()
      return goal
    },
    [base, revalidate]
  )

  const deleteGoal = useCallback(
    async (id: string) => {
      await apiDelete(`${base}/${id}`)
      await revalidate()
    },
    [base, revalidate]
  )

  return { createGoal, updateGoal, deleteGoal }
}
