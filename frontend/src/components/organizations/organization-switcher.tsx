import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog"
import { OrganizationPicker } from "@/components/organizations/organization-picker"
import { ResponsiveDialog } from "@/components/shared"
import { Kbd } from "@/components/ui/kbd"
import {
  isOrganizationSwitcherShortcut,
  ORGANIZATION_SWITCHER_SHORTCUT,
  useOrganizationSwitcher,
} from "@/hooks/organizations/use-organization-switcher"
import { useIsTouch } from "@/hooks/use-media-query"
import { accountPath, switchTargetPath } from "@/lib/account-scope"
import { useAuth } from "@/lib/auth"
import { useLocation, useNavigate } from "@/lib/router"

/**
 * O seletor de organização em modal, montado uma vez pela casca. Abre pelo topo da barra lateral,
 * por "Trocar" no menu "Mais" do celular e por Ctrl/⌘ + Shift + O, de qualquer tela.
 *
 * Modal, e não popover preso ao botão: o conteúdo é uma lista rica (logo, papel, pessoas, plano,
 * créditos), com busca e, para o suporte, milhares de organizações em rolagem infinita; o botão
 * mora numa barra de 16 rem que pode estar recolhida, e o atalho abre de onde não há botão.
 */
export function OrganizationSwitcherDialog() {
  const { t } = useTranslation()
  const { session, refreshAccounts } = useAuth()
  const open = useOrganizationSwitcher((state) => state.open)
  const setOpen = useOrganizationSwitcher((state) => state.setOpen)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isTouch = useIsTouch()
  const [creating, setCreating] = useState(false)
  const master = Boolean(session?.user.master)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isOrganizationSwitcherShortcut(event)) return
      event.preventDefault()
      setOpen(!useOrganizationSwitcher.getState().open)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  // Pessoas, créditos e organizações novas mudam em outras abas: relê ao abrir.
  useEffect(() => {
    if (!open) return
    refreshAccounts().catch(() => {
      /* fica a lista que veio com a sessão */
    })
  }, [open, refreshAccounts])

  // Saiu da organização (a tela mudou por outro caminho): o modal não fica para trás.
  useEffect(() => () => setOpen(false), [setOpen])

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        size={master ? "lg" : "md"}
        fixedHeight={master}
        title={t("organizations.picker.title")}
        description={t(isTouch ? "organizations.picker.descriptionTouch" : "organizations.picker.description")}
        headerActions={
          isTouch ? null : (
            <Kbd aria-label={t("organizations.picker.shortcut", { keys: ORGANIZATION_SWITCHER_SHORTCUT })}>
              {ORGANIZATION_SWITCHER_SHORTCUT}
            </Kbd>
          )
        }
      >
        <OrganizationPicker
          variant="dialog"
          target={switchTargetPath(pathname)}
          onNavigated={() => setOpen(false)}
          onCreate={() => {
            setOpen(false)
            setCreating(true)
          }}
        />
      </ResponsiveDialog>
      <CreateOrganizationDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(account) => navigate(accountPath(account.hashid, "/"))}
      />
    </>
  )
}
