import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { apiPost } from "@/lib/api"
import { contactErrorMessage } from "@/lib/contacts/error-message"
import { selectionBody, type ContactSelectionTarget } from "@/lib/contacts/filters"
import type { BulkResult, ContactStatus } from "@/lib/contacts/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { reloadContacts } from "./use-contacts"

export type BulkScope = {
  target: ContactSelectionTarget
  /** Quantos a tela acha que são. Quem decide o que muda é o servidor, e o retorno diz. */
  count: number
  /** O nome, quando é um contato só: "Fechar a conversa de Ana?". */
  name?: string | null
  /** Vem da linha, sem seleção nenhuma: não precisa confirmar o que é simples de desfazer. */
  single?: boolean
  onDone?: () => void
}

type BulkRoute =
  | "bulk-add-tags"
  | "bulk-remove-tags"
  | "bulk-assign-user"
  | "bulk-update-status"
  | "bulk-toggle-automation"

export function bulkPost(route: BulkRoute, target: ContactSelectionTarget, body: object) {
  return apiPost<BulkResult>(`/contacts/${route}`, { ...selectionBody(target), ...body })
}

/**
 * As ações em lote: confirmam, dizem quantos mudaram e recarregam a lista, porque lote não avisa
 * o tempo real. `updatedCount` conta só quem mudou de verdade, então o retorno pode ser menor que
 * a seleção: quem já estava assim, ou quem ficou fora do que a pessoa pode ver, não entra.
 */
export function useContactMutations() {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()

  const amount = (count: number) => ({ count, formatted: formatNumber(count, language) })

  /** O desfecho, em toast. Serve também aos diálogos de etiquetas e de atribuição. */
  function report(doneKey: string, result: BulkResult, scope: BulkScope) {
    const updated = result.updatedCount

    if (updated === 0) {
      toast.info(t("contacts.bulk.nothingChanged"), {
        description: t("contacts.bulk.nothingChangedHint"),
      })
    } else {
      const skipped = scope.count - updated
      toast.success(t(doneKey, amount(updated)), {
        description: skipped > 0 ? t("contacts.bulk.someUnchanged", amount(skipped)) : undefined,
      })
    }

    scope.onDone?.()
    void reloadContacts()
  }

  async function run(route: BulkRoute, body: object, doneKey: string, scope: BulkScope) {
    try {
      report(doneKey, await bulkPost(route, scope.target, body), scope)
    } catch (error) {
      toast.error(t("contacts.bulk.failed"), { description: contactErrorMessage(t, error) })
    }
  }

  /** Abrir e fechar, ligar e desligar: uma ação sem escolha, então a confirmação é a pergunta. */
  async function confirmed(
    route: BulkRoute,
    body: object,
    keys: { title: string; hint: string; confirm: string; done: string },
    scope: BulkScope
  ) {
    if (scope.single) return run(route, body, keys.done, scope)

    let result: BulkResult | null = null
    const accepted = await confirm({
      title: t(keys.title, amount(scope.count)),
      description: t(keys.hint, amount(scope.count)),
      confirmLabel: t(keys.confirm, amount(scope.count)),
      onConfirm: async () => {
        result = await bulkPost(route, scope.target, body)
      },
    })
    if (accepted && result) report(keys.done, result, scope)
  }

  function setStatus(status: ContactStatus, scope: BulkScope) {
    const action = status === "open" ? "reopen" : "close"
    return confirmed(
      "bulk-update-status",
      { status },
      {
        title: `contacts.bulk.${action}.title`,
        hint: `contacts.bulk.${action}.hint`,
        confirm: `contacts.bulk.${action}.confirm`,
        done: `contacts.bulk.${action}.done`,
      },
      scope
    )
  }

  function setAutomation(enabled: boolean, scope: BulkScope) {
    const action = enabled ? "automationOn" : "automationOff"
    return confirmed(
      "bulk-toggle-automation",
      { automationEnabled: enabled },
      {
        title: `contacts.bulk.${action}.title`,
        hint: `contacts.bulk.${action}.hint`,
        confirm: `contacts.bulk.${action}.confirm`,
        done: `contacts.bulk.${action}.done`,
      },
      scope
    )
  }

  return { report, setStatus, setAutomation }
}
