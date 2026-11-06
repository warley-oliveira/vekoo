import { useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import {
  FacetedFilter,
  FilterLayoutContext,
  ResponsiveDialog,
  SearchableSelect,
  type FacetOption,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatPeople, useChatTags } from "@/hooks/chat/use-chat-refs"
import { ApiError } from "@/lib/api"
import type { BulkChange } from "@/lib/chat-details/bulk"
import type { BulkResult } from "@/lib/chat-details/types"

type DialogProps = {
  count: number
  run: (change: BulkChange) => Promise<BulkResult>
  onClose: () => void
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.serverMessage ? error.serverMessage : fallback
}

/** Escolher as etiquetas já é a confirmação: o botão diz o que vai acontecer, e com quantas. */
export function BulkTagsDialog({
  mode,
  count,
  run,
  onClose,
}: DialogProps & { mode: "add" | "remove" }) {
  const { t } = useTranslation()
  const { tags } = useChatTags()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo<FacetOption[]>(
    () =>
      tags.map((tag) => ({
        value: tag.id,
        label: tag.name,
        icon: (
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
        ),
      })),
    [tags]
  )

  const keys = `chatDetails.bulk.${mode === "add" ? "addTags" : "removeTags"}`

  const submit = async () => {
    if (busy || selected.length === 0) return

    setBusy(true)
    setError(null)
    try {
      await run(mode === "add" ? { kind: "addTags", tagIds: selected } : { kind: "removeTags", tagIds: selected })
      onClose()
    } catch (cause) {
      setError(errorText(cause, t("chatDetails.bulk.failed")))
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
      description={t(`${keys}.description`, { count })}
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
            {t("chatDetails.bulk.cancel")}
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
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t("chatDetails.bulk.noTags")}
        </p>
      ) : (
        // A lista à vista, sem popover sobre o diálogo.
        <FilterLayoutContext.Provider value="stacked">
          <FacetedFilter
            title={t("chatDetails.bulk.tagsLabel")}
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

const UNASSIGN = "__unassign"

export function BulkAssignDialog({ count, run, onClose }: DialogProps) {
  const { t } = useTranslation()
  const { people } = useChatPeople()
  const fieldId = useId()
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo<SelectOption[]>(
    () => [
      { value: UNASSIGN, label: t("chatDetails.bulk.assign.none") },
      ...people
        .filter((person) => !person.setupOnly)
        .map((person) => ({ value: person.id, label: person.name, description: person.email })),
    ],
    [people, t]
  )

  const removing = selected === UNASSIGN

  const submit = async () => {
    if (busy || !selected) return

    setBusy(true)
    setError(null)
    try {
      await run({ kind: "assign", accountId: removing ? null : selected })
      onClose()
    } catch (cause) {
      setError(errorText(cause, t("chatDetails.bulk.failed")))
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      title={t("chatDetails.bulk.assign.title")}
      description={t("chatDetails.bulk.assign.description", { count })}
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
            {t("chatDetails.bulk.cancel")}
          </Button>
          <Button
            type="button"
            disabled={busy || !selected}
            className="pointer-coarse:h-10"
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {t(removing ? "chatDetails.bulk.assign.confirmRemove" : "chatDetails.bulk.assign.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 pb-1">
        <label htmlFor={fieldId} className="text-sm font-medium">
          {t("chatDetails.bulk.assign.label")}
        </label>
        <SearchableSelect
          id={fieldId}
          options={options}
          value={selected}
          onChange={(next) => setSelected(next)}
          placeholder={t("chatDetails.bulk.assign.placeholder")}
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
