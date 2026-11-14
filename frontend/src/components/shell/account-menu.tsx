import { useTranslation } from "react-i18next"
import {
  ShieldCheck,
  ArrowLeftRight,
  Bell,
  Building2,
  ChevronsUpDown,
  Ellipsis,
  Languages,
  LifeBuoy,
  LogOut,
  UserPlus,
  UserRound,
} from "lucide-react"

import { OrganizationBadge } from "@/components/organizations/organization-badge"
import { UserAvatar } from "@/components/shared"
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
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { ThemeSubmenu } from "@/components/shell/theme-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ORGANIZATION_SWITCHER_SHORTCUT,
  useOrganizationSwitcher,
} from "@/hooks/organizations/use-organization-switcher"
import { useCan } from "@/hooks/use-can"
import { useSignOut } from "@/hooks/use-sign-out"
import { apiAssetUrl } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n"
import { Link } from "@/lib/router"
import { cn } from "@/lib/utils"

/**
 * A organização desta aba, no topo da barra: abre o seletor de organização (o mesmo da tela
 * `/organizations`). O nome em destaque e, abaixo, o papel da pessoa nela.
 */
export function OrganizationSwitcherButton({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const setOpen = useOrganizationSwitcher((state) => state.setOpen)

  // A barra só existe dentro da sessão (ver RequireAuth), mas o fallback evita
  // qualquer chance de tela branca durante a saída.
  const organizationName = session?.organization.name ?? t("account.fallbackName")
  const role = session?.account.support
    ? t("organizations.support.banner")
    : session
      ? t(`organizations.roles.${session.account.role}`)
      : ""

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto min-w-0 flex-1 justify-start gap-2.5 px-2 py-1.5",
              collapsed && "size-9 flex-none justify-center p-0"
            )}
            aria-haspopup="dialog"
            aria-label={t("organizations.picker.open", { name: organizationName })}
            onClick={() => setOpen(true)}
          />
        }
      >
        <span className="relative shrink-0">
          <OrganizationBadge name={organizationName} logoUrl={session?.organization.logoUrl} />
          {session?.account.support && (
            <LifeBuoy
              className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-sidebar p-px text-primary"
              aria-hidden
            />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
              <span className="w-full truncate text-left text-sm font-medium">{organizationName}</span>
              <span className="w-full truncate text-left text-xs text-muted-foreground">{role}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </TooltipTrigger>
      <TooltipContent side={collapsed ? "right" : "bottom"} className="flex items-center gap-2">
        {t("organizations.picker.title")}
        <Kbd>{ORGANIZATION_SWITCHER_SHORTCUT}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/** A pessoa: perfil, avisos, a organização (para quem administra), idioma, tema e sair. */
export function PersonMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const canInvite = useCan("core_settings")
  const signOut = useSignOut()
  const setOpen = useOrganizationSwitcher((state) => state.setOpen)
  const person = session?.user
  const personName = person?.name ?? ""

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto min-w-0 justify-start gap-2.5 px-2 py-1.5",
              collapsed ? "size-9 justify-center rounded-full p-0" : "w-full"
            )}
            aria-label={t("account.personMenu", { name: personName })}
          />
        }
      >
        <UserAvatar name={personName} src={person?.avatarUrl ? apiAssetUrl(person.avatarUrl) : null} size="sm" />
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
              <span className="w-full truncate text-left text-sm font-medium">{personName}</span>
              <span className="w-full truncate text-left text-xs text-muted-foreground">{person?.email}</span>
            </span>
            <Ellipsis className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? "right" : "top"} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{personName}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{person?.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setOpen(true)}>
          <ArrowLeftRight /> {t("organizations.picker.title")}
          <DropdownMenuShortcut>{ORGANIZATION_SWITCHER_SHORTCUT}</DropdownMenuShortcut>
        </DropdownMenuItem>
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
        {/* A curadoria do banco de referências: só a equipe da Vekoo (a API confere de novo). */}
        {person?.staff && (
          <DropdownMenuItem render={<Link to="/admin/references" />}>
            <ShieldCheck /> {t("account.curation")}
          </DropdownMenuItem>
        )}
        <LanguageSubmenu />
        <ThemeSubmenu />
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
        <DropdownMenuRadioGroup value={language} onValueChange={(value) => i18n.changeLanguage(value)}>
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
