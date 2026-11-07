import { useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { FormActions, ResponsiveDialog, TextField, useFormSubmit } from "@/components/shared"

type NameValues = { name: string }

/** Criar e renomear pedem o mesmo: um nome que a pessoa reconheça depois. */
export function WebhookNameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialName = "",
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  initialName?: string
  onSubmit: (name: string) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(3, t("webhooks.dialog.nameTooShort"))
          .max(100, t("webhooks.dialog.nameTooLong")),
      }),
    [t]
  )
  const form = useForm<NameValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName },
    mode: "onBlur",
  })
  const submit = useFormSubmit(form, async (values) => {
    await onSubmit(values.name)
    onOpenChange(false)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={submit}
      footer={<FormActions form={form} submitLabel={submitLabel} onCancel={() => onOpenChange(false)} requireChanges />}
    >
      <TextField
        control={form.control}
        name="name"
        label={t("webhooks.dialog.name")}
        placeholder={t("webhooks.dialog.namePlaceholder")}
        autoFocus
        autoComplete="off"
      />
    </ResponsiveDialog>
  )
}
