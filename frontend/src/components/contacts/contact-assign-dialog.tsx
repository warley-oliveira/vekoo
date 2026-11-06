import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import { ResponsiveDialog, SearchableSelect, type SelectOption } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  bulkPost,
  useContactMutations,
  type BulkScope,
} from "@/hooks/contacts/use-contact-mutations"
import { contactErrorMessage } from "@/lib/contacts/error-message"
import type { ContactUser } from "@/lib/contacts/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

/** Opção "ninguém": a API tira a atribuição com `accountId: null`. */
const UNASSIGN = "__unassign"

export type ContactAssignDialogProps = {
  scope: BulkScope
  users: ContactUser[]
  onClose: () => void
}

export function ContactAssignDialog({ scope, users, onClose }: ContactAssignDialogProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { report } = useContactMutations()
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo<SelectOption[]>(
    () => [
      { value: UNASSIGN, label: t("contacts.bulk.assign.remove") },
      // Quem configura, mas não atende, a API recusaria.
      ...users
        .filter((user) => user.assignable !== false)
        .map((user) => ({ value: user.id, label: user.name })),
    ],
    [t, users]
  )

  const amount = { count: scope.count, formatted: formatNumber(scope.count, language) }
  const removing = selected === UNASSIGN

  async function submit() {
    if (busy || !selected) return

    setBusy(true)
    setError(null)
    try {
      const result = await bulkPost("bulk-assign-user", scope.target, {
        accountId: removing ? null : selected,
      })
      report(removing ? "contacts.bulk.assign.doneRemoved" : "contacts.bulk.assign.done", result, scope)
      onClose()
    } catch (cause) {
      setError(contactErrorMessage(t, cause))
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title={t("contacts.bulk.assign.title")}
      description={
        scope.name
          ? t("contacts.bulk.assign.descriptionNamed", { name: scope.name })
          : t("contacts.bulk.assign.description", amount)
      }
      size="sm"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="pointer-coarse:h-10"
            onClick={onClose}
          >
            {t("contacts.actions.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || !selected}
            className="pointer-coarse:h-10"
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t(removing ? "contacts.bulk.assign.confirmRemove" : "contacts.bulk.assign.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 pb-1">
        <span className="text-sm font-medium">{t("contacts.bulk.assign.label")}</span>
        <SearchableSelect
          aria-label={t("contacts.bulk.assign.label")}
          options={options}
          value={selected}
          onChange={(next) => setSelected(next)}
          placeholder={t("contacts.bulk.assign.placeholder")}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}
