import useSWR, { type SWRConfiguration } from "swr"
import { apiFetch } from "@/lib/api"

// Central data-fetching hook. Pass `null` as the key to conditionally skip a request.
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => apiFetch<T>(p), config)
}
