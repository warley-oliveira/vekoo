import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"

import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import type { Team } from "@/lib/people/types"
import { useRevalidatePeople } from "./use-people"

export const TEAMS_KEY = "/teams?perPage=100"

type TeamInput = { name?: string; active?: boolean }

export function useTeams() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Team[]>(TEAMS_KEY, () =>
    fetchAllPages<Team>(TEAMS_KEY, "teams")
  )

  return {
    teams: data,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

export function useTeamMutations() {
  const { mutate } = useSWRConfig()
  const revalidatePeople = useRevalidatePeople()

  // Toda lista de departamentos em cache, inclusive a de quem pede `?active=true`.
  const revalidate = useCallback(
    () => mutate((key) => typeof key === "string" && key.startsWith("/teams")),
    [mutate]
  )

  const createTeam = useCallback(
    async (input: TeamInput) => {
      const team = await apiPost<Team>("/teams", { team: input })
      await revalidate()
      return team
    },
    [revalidate]
  )

  const updateTeam = useCallback(
    async (id: string, input: TeamInput) => {
      const team = await apiPatch<Team>(`/teams/${id}`, { team: input })
      await revalidate()
      return team
    },
    [revalidate]
  )

  const deleteTeam = useCallback(
    async (id: string) => {
      await apiDelete(`/teams/${id}`)
      // As pessoas ficam, mas perdem o vínculo.
      await revalidatePeople()
    },
    [revalidatePeople]
  )

  return { createTeam, updateTeam, deleteTeam }
}
