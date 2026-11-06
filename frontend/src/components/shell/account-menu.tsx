import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import {
  Bell,
  ChevronsUpDown,
  Languages,
  LogOut,
  UserPlus,
  UserRound,
} from "lucide-react"

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
import { initials, useAuth } from "@/lib/auth"
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Quadrado com as iniciais da organização: a identidade da conta na casca. */
export function OrganizationBadge({
  name,
  className,
}: {
  name: string
  className?: string
}) {
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

/** Identidade da conta (organização + pessoa) e o menu da conta, no topo da barra. */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const canInvite = useCan("core_settings")
  const signOut = useSignOut()

  // A barra só existe dentro da sessão (ver RequireAuth), mas o fallback evita
  // qualquer chance de tela branca durante a saída.
  const organizationName = session?.organization.name ?? t("account.fallbackName")
  const personName = session?.account.name ?? ""

  return (
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
        <OrganizationBadge name={organizationName} />
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
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {personName}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {session?.account.email}
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
          <DropdownMenuItem render={<Link to="/settings/users" />}>
            <UserPlus /> {t("account.invite")}
          </DropdownMenuItem>
        )}
        <LanguageSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
