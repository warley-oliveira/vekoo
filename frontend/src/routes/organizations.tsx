import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { LogOut } from "lucide-react"

import { safeNext } from "@/components/auth-guard"
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog"
import { OrganizationPicker } from "@/components/organizations/organization-picker"
import { Callout } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { VekooMark } from "@/components/vekoo-mark"
import { useSignOut } from "@/hooks/use-sign-out"
import { accountPath } from "@/lib/account-scope"
import { useIdentity } from "@/hooks/use-identity"
import { useAuth, type AccountSummary } from "@/lib/auth"
import { useNavigate, useSearchParams } from "@/lib/router"

/**
 * `/organizations`: em qual organização esta aba vai trabalhar. É a tela de quem tem mais de uma
 * organização (no login, em `/`), de quem perdeu o acesso à da aba, e a área do suporte do Vekoo.
 * A lista é o mesmo seletor do modal da barra lateral (`OrganizationPicker`).
 */
export function OrganizationsPage() {
  const { t } = useTranslation()
  const identity = useIdentity()
  const { leaveAccount, refreshAccounts, accountLost } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const signOut = useSignOut()
  const [creating, setCreating] = useState(false)
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

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-10 pb-16 sm:px-6">
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {t("organizations.title", { name: identity.user.name.split(/\s+/)[0] })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("organizations.description", { email: identity.user.email })}
          </p>
        </div>

        {accountLost && <LostNotice code={accountLost.code} />}

        <div className="-mx-3">
          <OrganizationPicker variant="page" target={next ?? "/"} onCreate={() => setCreating(true)} />
        </div>
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
