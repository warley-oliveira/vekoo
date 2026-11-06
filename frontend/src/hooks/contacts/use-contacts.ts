import { useMemo } from "react"
import { mutate, type Arguments } from "swr"

import { useApi } from "@/hooks/use-api"
import type {
  ContactFilterOptions,
  ContactsResponse,
  CustomFieldsResponse,
} from "@/lib/contacts/types"

const isContactListKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith("/contacts?")

/** A lista. Ação em lote e importação não avisam o tempo real: quem mudou recarrega. */
export function reloadContacts() {
  return mutate(isContactListKey)
}

export function useContacts(path: string) {
  return useApi<ContactsResponse>(path, {
    keepPreviousData: true,
    // A lista pode ter dezenas de milhares: voltar para a aba não precisa recontar tudo.
    revalidateOnFocus: false,
  })
}

/** O que os filtros oferecem e o que as células precisam para mostrar nome em vez de id. */
export function useContactFilterOptions(enabled = true) {
  const { data, error, isLoading, mutate: reload } = useApi<ContactFilterOptions>(
    enabled ? "/contacts/filters" : null,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const lookups = useMemo(
    () => ({
      tags: new Map((data?.tags ?? []).map((tag) => [tag.id, tag])),
      users: new Map((data?.users ?? []).map((user) => [user.id, user])),
      teams: new Map((data?.teams ?? []).map((team) => [team.id, team])),
      connectors: new Map((data?.connectors ?? []).map((connector) => [connector.id, connector])),
    }),
    [data]
  )

  return { options: data, lookups, error, isLoading, reload }
}

export type ContactLookups = ReturnType<typeof useContactFilterOptions>["lookups"]

export function useContactCustomFields() {
  const { data } = useApi<CustomFieldsResponse>("/custom-fields?perPage=100", {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })
  return data?.customFields
}
