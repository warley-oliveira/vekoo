import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import { FormActions, FormField, ResponsiveDialog, TextareaField, TextField, useFormSubmit } from "@/components/shared"
import { useDashboardMutations } from "@/hooks/custom-dashboards/use-custom-dashboards"
import { useOpenCount } from "@/hooks/use-panel-session"
import {
  dashboardDetailsSchema,
  MAX_DASHBOARD_DESCRIPTION,
  MAX_DASHBOARD_NAME,
  type DashboardDetailsValues,
} from "@/lib/custom-dashboards/dashboard-details"
import type { CustomDashboardSummary } from "@/lib/custom-dashboards/types"
import { cn } from "@/lib/utils"

import { DASHBOARD_ICON_KEYS, ICONS } from "./icons"

/** Os ícones do painel, em botões: a aba mostra um deles. */
export function IconField({ control, label }: { control: ReturnType<typeof useForm<DashboardDetailsValues>>["control"]; label: string }) {
  const { t } = useTranslation()

  return (
    <FormField control={control} name="icon" label={label}>
      {({ field }) => (
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
          {DASHBOARD_ICON_KEYS.map((key) => {
            const Icon = ICONS[key]
            const selected = field.value === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={t(`customDashboards.icons.${key}`)}
                title={t(`customDashboards.icons.${key}`)}
                onClick={() => field.onChange(key)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-muted-foreground ring-1 ring-foreground/10 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-10",
                  selected && "bg-primary/5 text-primary ring-2 ring-primary"
                )}
              >
                <Icon aria-hidden className="size-4" />
              </button>
            )
          })}
        </div>
      )}
    </FormField>
  )
}

type DashboardDetailsDialogProps = {
  dashboard: Pick<CustomDashboardSummary, "id" | "name" | "description" | "icon">
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Renomear: nome, descrição e ícone. Vale na hora, mesmo com o painel em edição: não é o que o "Salvar" guarda. */
export function DashboardDetailsDialog({ dashboard, open, onOpenChange }: DashboardDetailsDialogProps) {
  const openCount = useOpenCount(open)
  return <DetailsForm key={openCount} dashboard={dashboard} open={open} onOpenChange={onOpenChange} />
}

function DetailsForm({ dashboard, open, onOpenChange }: DashboardDetailsDialogProps) {
  const { t } = useTranslation()
  const { update } = useDashboardMutations()
  const schema = useMemo(() => dashboardDetailsSchema(t), [t])
  const form = useForm<DashboardDetailsValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: dashboard.name, description: dashboard.description ?? "", icon: dashboard.icon ?? "chart" },
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    await update(dashboard.id, { name: values.name, description: values.description || null, icon: values.icon })
    toast.success(t("customDashboards.details.saved"))
    onOpenChange(false)
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("customDashboards.details.title")}
      description={t("customDashboards.details.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("customDashboards.details.save")}
          onCancel={() => onOpenChange(false)}
          requireChanges
        />
      }
    >
      <div className="flex flex-col gap-4">
        <TextField control={form.control} name="name" label={t("customDashboards.details.name")} maxLength={MAX_DASHBOARD_NAME} autoFocus />
        <TextareaField
          control={form.control}
          name="description"
          label={t("customDashboards.details.descriptionLabel")}
          rows={2}
          maxLength={MAX_DASHBOARD_DESCRIPTION}
          optional
        />
        <IconField control={form.control} label={t("customDashboards.details.icon")} />
      </div>
    </ResponsiveDialog>
  )
}
