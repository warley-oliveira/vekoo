import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Building2, LogIn } from "lucide-react"
import { toast } from "sonner"

import { EmptyState, ErrorState, ListSkeleton, RelativeTime, SearchInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"
import { apiPost, type PaginationMeta } from "@/lib/api"
import type { AccountSummary } from "@/lib/auth"

type SupportOrganization = {
  id: string
  name: string
  createdAt: number
  membersCount: number
  owner: { name: string; email: string } | null
}

type SupportOrganizationsResponse = { organizations: SupportOrganization[]; meta: PaginationMeta }

/**
 * A busca do suporte do Vekoo: por nome da organização, ou por nome ou e-mail de quem participa.
 * Entrar cria (na primeira vez) o vínculo de suporte e registra a entrada no servidor.
 */
export function SupportOrganizations({ onEntered }: { onEntered: (account: AccountSummary) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [entering, setEntering] = useState<string | null>(null)
  const path = `/support/organizations?perPage=20${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`
  const { data, error, isLoading, isValidating, mutate } = useApi<SupportOrganizationsResponse>(path)

  async function enter(organization: SupportOrganization) {
    setEntering(organization.id)
    try {
      onEntered(await apiPost<AccountSummary>(`/support/organizations/${organization.id}/enter`))
    } catch {
      toast.error(t("organizations.support.enterFailed"))
    } finally {
      setEntering(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={query}
        onChange={setQuery}
        debounce={300}
        loading={isValidating && !isLoading}
        placeholder={t("organizations.support.searchPlaceholder")}
        shortcut={false}
      />
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void mutate()} />
      ) : !data || data.organizations.length === 0 ? (
        <EmptyState icon={<Building2 />} title={t("organizations.support.empty")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {data.organizations.map((organization) => (
            <li key={organization.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{organization.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {organization.owner
                    ? t("organizations.support.owner", organization.owner)
                    : t("organizations.support.noOwner")}
                  {" · "}
                  {t("organizations.support.members", { count: organization.membersCount })}
                  {" · "}
                  <RelativeTime value={organization.createdAt} />
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={entering !== null}
                onClick={() => void enter(organization)}
              >
                <LogIn />
                {t("organizations.support.enter")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {data && data.meta.total > data.organizations.length && (
        <p className="text-xs text-muted-foreground">
          {t("organizations.support.more", { count: data.meta.total - data.organizations.length })}
        </p>
      )}
    </div>
  )
}
