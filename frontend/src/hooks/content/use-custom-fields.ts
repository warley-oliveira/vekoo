import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api"
import type {
  CustomField,
  CustomFieldInput,
  CustomFieldValues,
  NormalizePayload,
  NormalizeResult,
} from "@/lib/content/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"

export const CUSTOM_FIELDS_KEY = "/custom-fields?perPage=100"

/** Os campos da organização. Leitura aberta a qualquer sessão: chat e contatos também mostram. */
export function useCustomFields() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<CustomField[]>(
    CUSTOM_FIELDS_KEY,
    () => fetchAllPages<CustomField>(CUSTOM_FIELDS_KEY, "customFields")
  )

  return { customFields: data, error, isLoading, isValidating, reload: () => mutate() }
}

export type ValuesPeriod = { startDate?: string; endDate?: string }

function valuesPath(id: string, period: ValuesPeriod = {}) {
  const query = new URLSearchParams()
  if (period.startDate) query.set("startDate", period.startDate)
  if (period.endDate) query.set("endDate", period.endDate)
  const suffix = query.toString()
  return `/custom-fields/${id}/values${suffix ? `?${suffix}` : ""}`
}

/** Os valores distintos do campo nas conversas, do mais usado para o menos. */
export function useCustomFieldValues(id: string | null, period: ValuesPeriod = {}) {
  const { data, error, isLoading, isValidating, mutate } = useApi<CustomFieldValues>(
    id ? valuesPath(id, period) : null,
    { keepPreviousData: true, revalidateOnFocus: false }
  )

  return {
    values: data?.values,
    truncated: data?.truncated ?? false,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

/** Quantas conversas têm algum valor no campo. É o que apagar o campo deixa para trás. */
export async function countFieldValues(id: string): Promise<number> {
  const { values } = await apiGet<CustomFieldValues>(valuesPath(id))
  return values.reduce((total, entry) => (entry.value === null ? total : total + entry.count), 0)
}

export function useCustomFieldMutations() {
  const { mutate } = useSWRConfig()
  const revalidate = useCallback(() => mutate(CUSTOM_FIELDS_KEY), [mutate])

  const createCustomField = useCallback(
    async (input: CustomFieldInput) => {
      const { customField } = await apiPost<{ customField: CustomField }>("/custom-fields", {
        customField: input,
      })
      await revalidate()
      return customField
    },
    [revalidate]
  )

  const updateCustomField = useCallback(
    async (id: string, input: CustomFieldInput) => {
      const { customField } = await apiPatch<{ customField: CustomField }>(
        `/custom-fields/${id}`,
        { customField: input }
      )
      await revalidate()
      return customField
    },
    [revalidate]
  )

  const deleteCustomField = useCallback(
    async (id: string) => {
      await apiDelete(`/custom-fields/${id}`)
      await mutate<CustomField[]>(
        CUSTOM_FIELDS_KEY,
        (current) => current?.filter((field) => field.id !== id),
        { revalidate: false }
      )
    },
    [mutate]
  )

  // Rota própria para acrescentar: com duas pessoas ao mesmo tempo, regravar a lista inteira
  // apagaria a opção da outra.
  const addOption = useCallback(
    async (id: string, value: string) => {
      const { customField } = await apiPost<{ customField: CustomField }>(
        `/custom-fields/${id}/options`,
        { value }
      )
      await revalidate()
      return customField
    },
    [revalidate]
  )

  /** Sem `dryRun: false`, a API só mostra a prévia. Aplicar refaz as contagens de valores. */
  const normalize = useCallback(
    async (id: string, payload: NormalizePayload) => {
      const result = await apiPost<NormalizeResult>(`/custom-fields/${id}/normalize`, payload)
      if (!payload.dryRun) {
        await mutate(
          (key) => typeof key === "string" && key.startsWith(`/custom-fields/${id}/values`)
        )
        await revalidate()
      }
      return result
    },
    [mutate, revalidate]
  )

  return { createCustomField, updateCustomField, deleteCustomField, addOption, normalize }
}
