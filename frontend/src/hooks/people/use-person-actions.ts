import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { useAuth } from "@/lib/auth"
import { errorMessage } from "@/lib/people/error-message"
import { firstName } from "@/lib/people/person-rules"
import type { Person } from "@/lib/people/types"
import { usePersonMutations } from "./use-people"

/**
 * Cortar, devolver e apagar o acesso, com as confirmações e os recados. A tabela e o painel
 * usam os mesmos: o texto que explica o efeito é o que evita o clique errado.
 */
export function usePersonActions() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { revokePerson, restorePerson, deletePerson, transferOwnership } = usePersonMutations()
  const { refreshSession } = useAuth()

  const restore = useCallback(
    async (person: Person) => {
      try {
        await restorePerson(person.id)
        toast.success(t("people.users.restore.done", { name: firstName(person.name) }))
        return true
      } catch (error) {
        toast.error(errorMessage(t, error))
        return false
      }
    },
    [restorePerson, t]
  )

  const revoke = useCallback(
    async (person: Person) => {
      const name = firstName(person.name)
      const confirmed = await confirm({
        title: t("people.users.revoke.title", { name }),
        description: t("people.users.revoke.description", { name }),
        confirmLabel: t("people.users.revoke.confirm"),
        destructive: true,
        onConfirm: () => revokePerson(person.id),
      })
      if (confirmed) {
        toast.success(t("people.users.revoke.done", { name }), {
          action: { label: t("common.undo"), onClick: () => void restore(person) },
        })
      }
      return confirmed
    },
    [confirm, restore, revokePerson, t]
  )

  const remove = useCallback(
    async (person: Person) => {
      const confirmed = await confirm({
        title: t("people.users.delete.title", { name: person.name }),
        description: t("people.users.delete.description", { name: firstName(person.name) }),
        confirmLabel: t("people.users.delete.confirm"),
        requireText: t("people.users.delete.word"),
        destructive: true,
        onConfirm: () => deletePerson(person.id),
      })
      if (confirmed) toast.success(t("people.users.delete.done", { name: firstName(person.name) }))
      return confirmed
    },
    [confirm, deletePerson, t]
  )

  // Quem passa a posse deixa de ser dono: a sessão relê o papel e as permissões.
  const transfer = useCallback(
    async (person: Person) => {
      const name = firstName(person.name)
      const confirmed = await confirm({
        title: t("people.users.transfer.title", { name }),
        description: t("people.users.transfer.description", { name }),
        confirmLabel: t("people.users.transfer.confirm"),
        onConfirm: async () => {
          await transferOwnership(person.id)
          await refreshSession().catch(() => undefined)
        },
      })
      if (confirmed) toast.success(t("people.users.transfer.done", { name }))
      return confirmed
    },
    [confirm, refreshSession, t, transferOwnership]
  )

  return { revoke, restore, remove, transfer }
}
