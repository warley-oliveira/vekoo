import { NavLink } from "react-router"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

type AreaNavItem = { to: string; label: string }

/**
 * Abas de uma área de configurações, cada uma com a sua rota: o endereço diz onde se está,
 * e o botão voltar funciona. Em tela estreita, rola de lado em vez de quebrar a linha.
 */
function AreaNav({ label, items }: { label: string; items: AreaNavItem[] }) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto border-b px-4 [scrollbar-width:none] md:mx-0 md:px-0"
    >
      {/* Margem negativa: o texto da primeira aba alinha com o conteúdo, e não a área de clique. */}
      <ul className="-ml-2.5 flex min-w-max gap-1 md:gap-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  "relative flex h-10 items-center rounded-t-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  isActive
                    ? "text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Quem faz parte e o que cada um pode. No menu lateral, tudo isto é "Usuários". */
export function PeopleAreaNav() {
  const { t } = useTranslation()

  return (
    <AreaNav
      label={t("people.nav.aria")}
      items={[
        { to: "/settings/users", label: t("people.nav.users") },
        { to: "/settings/teams", label: t("people.nav.teams") },
        { to: "/settings/access-roles", label: t("people.nav.accessRoles") },
        { to: "/settings/organization", label: t("people.nav.organization") },
      ]}
    />
  )
}

/** O que é só da própria pessoa, aberto a qualquer sessão. */
export function AccountAreaNav() {
  const { t } = useTranslation()

  return (
    <AreaNav
      label={t("people.nav.accountAria")}
      items={[
        { to: "/settings/profile", label: t("people.nav.profile") },
        { to: "/settings/notifications", label: t("people.nav.notifications") },
      ]}
    />
  )
}
