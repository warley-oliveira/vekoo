import { useMemo } from "react"
import useSWR from "swr"

import { fetchAllPages } from "@/lib/people/fetch-all-pages"
import type { PersonOption } from "@/lib/pipelines/types"

const PEOPLE_OPTIONS_KEY = "/users?perPage=100"
const NO_PEOPLE: PersonOption[] = []

/** Quem está ativo na organização: filtros, responsável, menção. Lista pequena, lida uma vez. */
export function usePeopleOptions() {
  const { data, isLoading } = useSWR<PersonOption[]>(
    PEOPLE_OPTIONS_KEY,
    () => fetchAllPages<PersonOption>(PEOPLE_OPTIONS_KEY, "users"),
    { revalidateOnFocus: false }
  )

  const people = data ?? NO_PEOPLE
  // Quem só configura a plataforma não atende: não recebe card, mas pode ter ficado com algum.
  const assignable = useMemo(() => people.filter((person) => !person.setupOnly), [people])

  return { people, assignable, isLoading }
}
