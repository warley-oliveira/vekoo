import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import type { EmailCheck, Person } from "@/lib/people/types"

// Pessoas da organização. A lista é uma só para as três telas da área, e todas filtram
// no navegador: ela é pequena, e assim a busca responde sem esperar a rede.

/** A tela de usuários pede todo mundo, inclusive quem foi revogado (ver o contrato). */
export const PEOPLE_KEY = "/users?status=all&perPage=100"

type PersonInput = Partial<{
  name: string
  email: string
  phone: string | null
  password: string
  passwordConfirmation: string
  role: "owner" | "member"
  accessRoleId: string | null
  teamIds: string[]
  setupOnly: boolean
}>

export function usePeople() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<Person[]>(
    PEOPLE_KEY,
    () => fetchAllPages<Person>(PEOPLE_KEY, "users")
  )

  return {
    people: data,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

/** Mudou gente: mudam também as contagens de departamentos e grupos, e os seletores de outras telas. */
export function useRevalidatePeople() {
  const { mutate } = useSWRConfig()

  return useCallback(
    () =>
      mutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith("/users") || key.startsWith("/teams") || key.startsWith("/access-roles"))
      ),
    [mutate]
  )
}

export function usePersonMutations() {
  const { mutate } = useSWRConfig()
  const { session, updateSession, refreshSession } = useAuth()
  const revalidate = useRevalidatePeople()
  const actorId = session?.account.id

  /** Troca a pessoa na lista antes da próxima leitura, para a tela não piscar o valor antigo. */
  const replaceInList = useCallback(
    (person: Person) =>
      mutate<Person[]>(
        PEOPLE_KEY,
        (list) => list?.map((item) => (item.id === person.id ? person : item)),
        { revalidate: false }
      ),
    [mutate]
  )

  const settle = useCallback(
    async (person: Person) => {
      await replaceInList(person)
      void revalidate()
      // Quem editou a si mesmo pode ter trocado de grupo, e o menu depende disso.
      if (person.id === actorId) {
        updateSession({ account: person })
        void refreshSession()
      }
      return person
    },
    [actorId, refreshSession, replaceInList, revalidate, updateSession]
  )

  const createPerson = useCallback(
    async (input: PersonInput) => {
      const person = await apiPost<Person>("/users", { user: input })
      await mutate<Person[]>(PEOPLE_KEY, (list) => (list ? [...list, person] : list), {
        revalidate: false,
      })
      void revalidate()
      return person
    },
    [mutate, revalidate]
  )

  const updatePerson = useCallback(
    async (id: string, input: PersonInput) =>
      settle(await apiPatch<Person>(`/users/${id}`, { user: input })),
    [settle]
  )

  const revokePerson = useCallback(
    async (id: string) => settle(await apiPost<Person>(`/users/${id}/revoke`)),
    [settle]
  )

  const restorePerson = useCallback(
    async (id: string) => settle(await apiPost<Person>(`/users/${id}/restore`)),
    [settle]
  )

  const deletePerson = useCallback(
    async (id: string) => {
      await apiDelete(`/users/${id}`)
      await mutate<Person[]>(PEOPLE_KEY, (list) => list?.filter((item) => item.id !== id), {
        revalidate: false,
      })
      void revalidate()
    },
    [mutate, revalidate]
  )

  /**
   * Entra ou sai de um departamento. Otimista: a linha muda na hora, e volta como estava se
   * a API recusar. `teamIds` substitui tudo, então parte sempre do que está na lista.
   */
  const setPersonTeams = useCallback(
    async (person: Person, teamIds: string[]) => {
      const optimistic = { ...person, teamIds }
      await mutate<Person[]>(
        PEOPLE_KEY,
        async (list) => {
          const updated = await apiPatch<Person>(`/users/${person.id}`, { user: { teamIds } })
          return list?.map((item) => (item.id === updated.id ? updated : item))
        },
        {
          optimisticData: (list) =>
            list?.map((item) => (item.id === person.id ? optimistic : item)) ?? [],
          rollbackOnError: true,
          revalidate: false,
        }
      )
      void revalidate()
    },
    [mutate, revalidate]
  )

  const checkEmail = useCallback(
    (email: string, signal?: AbortSignal) =>
      apiGet<EmailCheck>(`/users/check-email?email=${encodeURIComponent(email)}`, { signal }),
    []
  )

  return {
    createPerson,
    updatePerson,
    revokePerson,
    restorePerson,
    deletePerson,
    setPersonTeams,
    checkEmail,
  }
}
