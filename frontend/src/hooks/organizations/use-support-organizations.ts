import { useMemo } from "react"
import useSWRInfinite from "swr/infinite"

import { apiGet } from "@/lib/api"

/** Uma organização do sistema, na lista "Todas" do suporte do Vekoo. */
export type SupportOrganization = {
  id: string
  name: string
  logoUrl: string | null
  plan: string
  creditsLeft: number
  createdAt: number
  membersCount: number
  owner: { name: string; email: string } | null
}

type SupportOrganizationsPage = {
  organizations: SupportOrganization[]
  meta: { perPage: number; hasMore: boolean; nextCursor: string | null; total: number | null }
}

const PER_PAGE = 30

/**
 * Todas as organizações do sistema, de página em página (cursor), com a busca no servidor: por
 * nome da organização (sem acento) ou por nome ou e-mail de quem participa. Só para `master`;
 * com `enabled` falso, nada vai para a rede.
 */
export function useSupportOrganizations(query: string, enabled: boolean) {
  const term = query.trim()
  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<SupportOrganizationsPage>(
    (index, previous: SupportOrganizationsPage | null) => {
      if (!enabled) return null
      if (previous && !previous.meta.nextCursor) return null
      const params = new URLSearchParams({ perPage: String(PER_PAGE) })
      if (term) params.set("q", term)
      if (index > 0 && previous?.meta.nextCursor) params.set("cursor", previous.meta.nextCursor)
      return `/support/organizations?${params}`
    },
    (key: string) => apiGet<SupportOrganizationsPage>(key),
    { revalidateFirstPage: false, revalidateOnFocus: false }
  )

  const organizations = useMemo(() => data?.flatMap((page) => page.organizations) ?? [], [data])
  const last = data?.[data.length - 1]
  const loading = enabled && !data && !error
  const loadingMore = Boolean(data) && size > 0 && typeof data?.[size - 1] === "undefined" && !error

  return {
    organizations,
    total: data?.[0]?.meta.total ?? null,
    hasMore: Boolean(last?.meta.hasMore),
    loading,
    loadingMore,
    searching: isValidating && !loading && !loadingMore,
    error,
    loadMore: () => void setSize(size + 1),
    retry: () => void mutate(),
  }
}
