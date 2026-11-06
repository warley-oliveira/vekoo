import { useTranslation } from "react-i18next"

import { AreaNav } from "@/components/shared/area-nav"

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
