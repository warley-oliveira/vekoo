import useSWR from "swr"

import { useCan } from "@/hooks/use-can"
import { FLOWS_KEY } from "@/hooks/flows/use-flows"
import type { FlowSummary } from "@/lib/flows/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"

const NO_FLOWS: FlowSummary[] = []

/**
 * Os fluxos para escolher em "iniciar fluxo". Quem configura webhook tem `core_settings`, e fluxos pedem `flows`: sem ela,
 * a tela diz por que não dá para escolher, em vez de pedir e levar um 403.
 */
export function useFlowOptions() {
  const canSeeFlows = useCan("flows")
  const { data, error, isLoading, mutate } = useSWR<FlowSummary[]>(canSeeFlows ? FLOWS_KEY : null, () =>
    fetchAllPages<FlowSummary>(FLOWS_KEY, "flows")
  )
  return { flows: data ?? NO_FLOWS, canSeeFlows, error, isLoading, reload: () => mutate() }
}
