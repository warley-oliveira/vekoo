import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Building2, ChevronRight, ExternalLink, LifeBuoy, LogOut, Plus } from "lucide-react"
import { toast } from "sonner"

import { safeNext } from "@/components/auth-guard"
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog"
import { SupportOrganizations } from "@/components/organizations/support-organizations"
import { OrganizationBadge } from "@/components/shell/account-menu"
import { Callout, EmptyState, SearchInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { VekooMark } from "@/components/vekoo-mark"
import { useSignOut } from "@/hooks/use-sign-out"
import { accountPath } from "@/lib/account-scope"
import { useIdentity } from "@/hooks/use-identity"
import { useAuth, type AccountSummary } from "@/lib/auth"
import { matchesSearch } from "@/lib/search-text"
import { useNavigate, useSearchParams } from "@/lib/router"

/** A partir disto a lista ganha busca: até aqui, cabe numa olhada. */
const SEARCH_FROM = 6

/**
 * `/organizations`: em qual organização esta aba vai trabalhar. É a tela de quem tem mais de uma
 * organização (no login, em `/`), de quem perdeu o acesso à da aba, e a área do suporte do Vekoo.
 * Abrir leva para `/a/<hashid>/...` nesta aba; o ícone ao lado abre numa aba nova.
 */
export function OrganizationsPage() {
  const { t } = useTranslation()
  const identity = useIdentity()
  const { leaveAccount, refreshAccounts, accountLost } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const signOut = useSignOut()
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const reduceMotion = useReducedMotion()
  const next = safeNext(searchParams.get("next"))

  // Esta aba saiu de qualquer organização: o cabeçalho para de ir, e o WebSocket fecha.
  useEffect(() => {
    leaveAccount()
  }, [leaveAccount])

  // A lista pode ter mudado em outra aba (organização criada, vínculo removido).
  useEffect(() => {
    refreshAccounts().catch(() => {
      /* fica a lista que veio com a sessão */
    })
  }, [refreshAccounts])

  const accounts = identity.accounts
  const visible = useMemo(() => {
    const term = query.trim()
    if (!term) return accounts
    return accounts.filter((account) => matchesSearch(account.organization.name, term))
  }, [accounts, query])

  function open(account: AccountSummary) {
    navigate(accountPath(account.hashid, next ?? "/"))
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <VekooMark className="text-lg" />
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut />
          {t("account.signOut")}
        </Button>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-10 pb-16 sm:px-6">
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t("organizations.title", { name: identity.user.name.split(/\s+/)[0] })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("organizations.description", { email: identity.user.email })}
          </p>
        </div>

        {accountLost && <LostNotice code={accountLost.code} />}

        {/* O suporte sem organização própria vê só a busca do suporte. */}
        {(accounts.length > 0 || !identity.user.master) && (
        <section aria-labelledby="organizations-mine" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="organizations-mine" className="text-sm font-medium">
              {t("organizations.mine", { count: accounts.length })}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus />
              {t("organizations.create.open")}
            </Button>
          </div>

          {accounts.length >= SEARCH_FROM && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={t("organizations.searchPlaceholder")}
              shortcut={false}
            />
          )}

          {accounts.length === 0 ? (
            <EmptyState
              icon={<Building2 />}
              title={t("organizations.empty.title")}
              description={t("organizations.empty.description")}
              action={{ label: t("organizations.create.open"), onClick: () => setCreating(true) }}
            />
          ) : visible.length === 0 ? (
            <EmptyState title={t("organizations.noMatch")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
              <AnimatePresence initial={false}>
                {visible.map((account) => (
                  <motion.li
                    key={account.hashid}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => open(account)}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <OrganizationBadge
                        name={account.organization.name}
                        logoUrl={account.organization.logoUrl}
                        className="size-9"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{account.organization.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {t(`organizations.roles.${account.role}`)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mr-2 shrink-0"
                      aria-label={t("organizations.openInNewTab", { name: account.organization.name })}
                      nativeButton={false}
                      render={
                        <a href={accountPath(account.hashid, next ?? "/")} target="_blank" rel="noopener" />
                      }
                    >
                      <ExternalLink />
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
        )}

        {identity.user.master && (
          <section aria-labelledby="organizations-support" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <LifeBuoy className="size-4 text-primary" aria-hidden />
              <h2 id="organizations-support" className="text-sm font-medium">
                {t("organizations.support.title")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">{t("organizations.support.description")}</p>
            <SupportOrganizations
              onEntered={(account) => {
                toast(t("organizations.support.entered", { name: account.organization.name }))
                navigate(accountPath(account.hashid, "/"))
              }}
            />
          </section>
        )}
      </main>

      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} onCreated={open} />
    </div>
  )
}

function LostNotice({ code }: { code: string }) {
  const { t } = useTranslation()
  const key = code === "accountRevoked" ? "revoked" : code === "accountRequired" ? "required" : "notFound"
  return (
    <Callout tone={key === "required" ? "info" : "warning"} title={t(`organizations.lost.${key}.title`)} role="status">
      {t(`organizations.lost.${key}.description`)}
    </Callout>
  )
}
