import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  RadioField,
  ResponsiveDialog,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { useChatViews } from "@/hooks/chat/use-chat-refs"
import { apiPatch, apiPost } from "@/lib/api"
import { useListFilters } from "@/lib/chat/stores"
import type { ChatView, FilterCondition } from "@/lib/chat/types"

export type SaveViewState =
  | { mode: "create"; personal: boolean }
  | { mode: "rename"; view: ChatView }

type Values = { name: string; scope: "personal" | "shared" }

/** Dar nome ao que está filtrando, ou renomear uma visão. */
export function SaveViewDialog({
  state,
  conditions,
  onClose,
}: {
  state: SaveViewState
  conditions: FilterCondition[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { mutate } = useChatViews()
  const setConditions = useListFilters((store) => store.setConditions)

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("chat.views.nameRequired")),
        scope: z.enum(["personal", "shared"]),
      }),
    [t]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues:
      state.mode === "rename"
        ? { name: state.view.name, scope: state.view.personal ? "personal" : "shared" }
        : { name: "", scope: state.personal ? "personal" : "shared" },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async ({ name, scope }) => {
    if (state.mode === "rename") {
      await apiPatch(`/chat-views/${state.view.id}`, { chatView: { name } })
      toast.success(t("chat.views.renamed"))
    } else {
      const { chatView } = await apiPost<{ chatView: ChatView }>("/chat-views", {
        chatView: { name, personal: scope === "personal", payload: conditions },
      })
      setConditions(conditions, chatView.id)
      toast.success(t("chat.views.saved"))
    }
    await mutate()
    onClose()
  })

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="sm"
      title={state.mode === "rename" ? t("chat.views.renameTitle") : t("chat.views.saveTitle")}
      description={state.mode === "rename" ? undefined : t("chat.views.saveHint")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={state.mode === "rename" ? t("chat.views.renameSubmit") : t("chat.views.saveSubmit")}
          onCancel={onClose}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          control={form.control}
          name="name"
          label={t("chat.views.name")}
          autoFocus
        />
        {state.mode === "create" ? (
          <RadioField
            control={form.control}
            name="scope"
            label={t("chat.views.scope")}
            options={[
              { value: "personal", label: t("chat.views.personalOption") },
              { value: "shared", label: t("chat.views.sharedOption") },
            ]}
          />
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
