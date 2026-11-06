import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import {
  FacetedFilter,
  FilterLayoutContext,
  ResponsiveDialog,
  type FacetOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  bulkPost,
  useContactMutations,
  type BulkScope,
} from "@/hooks/contacts/use-contact-mutations"
import { contactErrorMessage } from "@/lib/contacts/error-message"
import type { ContactTag } from "@/lib/contacts/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { TagDot } from "./tag-dot"

export type TagsMode = "add" | "remove"

export type ContactTagsDialogProps = {
  mode: TagsMode
  scope: BulkScope
  tags: ContactTag[]
  onClose: () => void
}

/** Escolher as etiquetas é também a confirmação: o botão diz o que vai acontecer, e com quantos. */
export function ContactTagsDialog({ mode, scope, tags, onClose }: ContactTagsDialogProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { report } = useContactMutations()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo<FacetOption[]>(
    () =>
      tags.map((tag) => ({
        value: tag.id,
        label: tag.name,
        icon: <TagDot color={tag.color} />,
      })),
    [tags]
  )

  const amount = { count: scope.count, formatted: formatNumber(scope.count, language) }
  const keys = `contacts.bulk.${mode === "add" ? "addTags" : "removeTags"}`

  async function submit() {
    if (busy || selected.length === 0) return

    setBusy(true)
    setError(null)
    try {
      const result = await bulkPost(
        mode === "add" ? "bulk-add-tags" : "bulk-remove-tags",
        scope.target,
        { tagIds: selected }
      )
      report(`${keys}.done`, result, scope)
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
      title={t(`${keys}.title`)}
      description={
        scope.name
          ? t(`${keys}.descriptionNamed`, { name: scope.name })
          : t(`${keys}.description`, amount)
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
            variant={mode === "remove" ? "destructive" : "default"}
            disabled={busy || selected.length === 0}
            className="pointer-coarse:h-10"
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t(`${keys}.confirm`)}
          </Button>
        </>
      }
    >
      {tags.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("contacts.bulk.noTags")}</p>
      ) : (
        // A lista à vista, sem popover sobre o diálogo.
        <FilterLayoutContext.Provider value="stacked">
          <FacetedFilter
            title={t("contacts.bulk.tagsLabel")}
            options={options}
            value={selected}
            onChange={setSelected}
          />
        </FilterLayoutContext.Provider>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </ResponsiveDialog>
  )
}
