import { useState } from "react"
import { Link, useLocation, useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import {
  Bell,
  Building2,
  Check,
  ChevronsUpDown,
  Languages,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Plus,
  UserPlus,
  UserRound,
} from "lucide-react"

import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCan } from "@/hooks/use-can"
import { useSignOut } from "@/hooks/use-sign-out"
import { accountPath } from "@/lib/account-scope"
import { apiAssetUrl } from "@/lib/api"
import { initials, useAuth, type AccountSummary } from "@/lib/auth"
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** O logo da organização ou, sem ele, as iniciais: a identidade da conta na casca. */
export function OrganizationBadge({
  name,
  logoUrl,
  className,
}: {
  name: string
  logoUrl?: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={apiAssetUrl(logoUrl)}
        alt=""
        className={cn("size-7 shrink-0 rounded-lg object-cover", className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-heading text-xs font-bold text-primary-foreground",
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

/** No menu, até aqui a lista cabe; acima disso, o resto fica na tela de organizações. */
const MENU_ORGANIZATIONS = 5

/**
 * Trocar de organização leva para a mesma área na outra (`/chat/123` → `/chat`): o registro aberto
 * é desta organização e não existe lá.
 */
function areaPath(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0]
  return first ? `/${first}` : "/"
}

/**
 * Identidade da conta (organização + pessoa) e o menu da conta, no topo da barra. É também o
 * seletor de organização: lista as da pessoa e troca nesta aba (Ctrl/⌘ + clique, ou o botão do
 * meio, abre numa aba nova, porque cada item é um link de verdade).
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const canInvite = useCan("core_settings")
  const signOut = useSignOut()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const accounts = session?.accounts ?? []
  const currentHashid = session?.account.hashid
  const shown = accounts.slice(0, MENU_ORGANIZATIONS)
  const target = areaPath(pathname)

  // A barra só existe dentro da sessão (ver RequireAuth), mas o fallback evita
  // qualquer chance de tela branca durante a saída.
  const organizationName = session?.organization.name ?? t("account.fallbackName")
  const personName = session?.account.name ?? ""

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto min-w-0 flex-1 justify-start gap-2.5 px-2 py-1.5",
              collapsed && "size-9 flex-none justify-center p-0"
            )}
            aria-label={t("account.menuAria", { organization: organizationName })}
          />
        }
      >
        <OrganizationBadge
          name={organizationName}
          logoUrl={session?.organization.logoUrl}
        />
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
              <span className="w-full truncate text-left text-sm font-medium">
                {organizationName}
              </span>
              <span className="w-full truncate text-left text-xs text-muted-foreground">
                {personName}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("organizations.switcher.label")}
          </DropdownMenuLabel>
          {session?.account.support && (
            <DropdownMenuItem render={<Link to="/organizations" />}>
              <LifeBuoy className="text-primary" />
              <span className="min-w-0 flex-1 truncate">{organizationName}</span>
              <span className="text-xs text-muted-foreground">{t("organizations.support.badge")}</span>
            </DropdownMenuItem>
          )}
          {shown.map((account) => (
            <OrganizationItem
              key={account.hashid}
              account={account}
              current={account.hashid === currentHashid}
              to={accountPath(account.hashid, target)}
            />
          ))}
          {accounts.length > MENU_ORGANIZATIONS && (
            <DropdownMenuItem render={<Link to="/organizations" />}>
              <LayoutGrid /> {t("organizations.switcher.all", { count: accounts.length })}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <Plus /> {t("organizations.create.open")}
          </DropdownMenuItem>
          {session?.user.master && accounts.length <= MENU_ORGANIZATIONS && (
            <DropdownMenuItem render={<Link to="/organizations" />}>
              <LifeBuoy /> {t("organizations.switcher.support")}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {personName}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {session?.user.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/settings/profile" />}>
          <UserRound /> {t("navigation.routes.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/settings/notifications" />}>
          <Bell /> {t("navigation.routes.notificationSettings")}
        </DropdownMenuItem>
        {canInvite && (
          <>
            <DropdownMenuItem render={<Link to="/settings/organization" />}>
              <Building2 /> {t("people.organization.title")}
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/settings/users?new=1" />}>
              <UserPlus /> {t("account.invite")}
            </DropdownMenuItem>
          </>
        )}
        <LanguageSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <CreateOrganizationDialog
      open={creating}
      onOpenChange={setCreating}
      onCreated={(account) => navigate(accountPath(account.hashid, "/"))}
    />
    </>
  )
}

function OrganizationItem({ account, current, to }: { account: AccountSummary; current: boolean; to: string }) {
  const { t } = useTranslation()
  return (
    <DropdownMenuItem
      render={<Link to={to} aria-current={current ? "page" : undefined} />}
      aria-label={current ? t("organizations.switcher.current", { name: account.organization.name }) : undefined}
    >
      <OrganizationBadge
        name={account.organization.name}
        logoUrl={account.organization.logoUrl}
        className="size-5 rounded-md text-[0.6rem]"
      />
      <span className="min-w-0 flex-1 truncate">{account.organization.name}</span>
      {current && <Check className="text-primary" aria-hidden />}
    </DropdownMenuItem>
  )
}

/** Troca de idioma onde ela é esperada num SaaS: no menu da conta. */
function LanguageSubmenu() {
  const { t, i18n } = useTranslation()
  const language = useLanguage()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Languages /> {t("language.label")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup
          value={language}
          onValueChange={(value) => i18n.changeLanguage(value)}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <DropdownMenuRadioItem key={code} value={code}>
              {t(`language.${code}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
