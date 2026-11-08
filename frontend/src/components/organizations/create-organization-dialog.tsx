import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { z } from "zod"

import { FormActions, ResponsiveDialog, TextField, useFormSubmit } from "@/components/shared"
import { apiPost } from "@/lib/api"
import { useAuth, type AccountSummary } from "@/lib/auth"

type CreateOrganizationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A organização nova, já na lista da pessoa. Quem abriu decide para onde ir. */
  onCreated: (account: AccountSummary) => void
}

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t("organizations.create.nameTooShort"))
      .max(60, t("organizations.create.nameTooLong")),
  })
}

/** Criar uma organização: a pessoa entra como dona, com os créditos de boas-vindas. */
export function CreateOrganizationDialog({ open, onOpenChange, onCreated }: CreateOrganizationDialogProps) {
  const { t } = useTranslation()
  const { refreshAccounts } = useAuth()
  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)
  const submit = useFormSubmit(form, async ({ name }) => {
    const account = await apiPost<AccountSummary>("/organizations", { organization: { name: name.trim() } })
    await refreshAccounts().catch(() => undefined)
    toast.success(t("organizations.create.created", { name: account.organization.name }))
    form.reset()
    close()
    onCreated(account)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t("organizations.create.title")}
      description={t("organizations.create.description")}
      onSubmit={submit}
      footer={<FormActions form={form} submitLabel={t("organizations.create.submit")} onCancel={close} />}
    >
      <TextField
        control={form.control}
        name="name"
        label={t("organizations.create.name")}
        placeholder={t("organizations.create.namePlaceholder")}
        autoFocus
      />
    </ResponsiveDialog>
  )
}
