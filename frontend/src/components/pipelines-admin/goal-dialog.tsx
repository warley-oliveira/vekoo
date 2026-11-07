import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import {
  ComboboxField,
  CurrencyField,
  FormActions,
  Money,
  ResponsiveDialog,
  useFormSubmit,
} from "@/components/shared"
import { useGoalMutations } from "@/hooks/pipelines-admin/use-goals"
import { useLanguage } from "@/lib/i18n"
import { formatMonth } from "@/lib/pipelines-admin/format"
import type { GoalScope, PersonRef } from "@/lib/pipelines-admin/types"

/** Um pouco abaixo do teto de `numeric(12, 2)` da API. */
const MAX_TARGET = 9_999_999_999

export type GoalDialogState = {
  scope: GoalScope
  /** Com a pessoa, a meta é dela. Sem pessoa numa meta individual, o diálogo pergunta quem. */
  person: PersonRef | null
  goalId: string | null
  target: number | null
}

/** Criar ou editar uma meta do mês: da tela de metas ou do popover no topo do pipeline. */
export default function GoalDialog({
  boardId,
  month,
  state,
  addable,
  open,
  onOpenChange,
}: {
  boardId: string
  month: string
  state: GoalDialogState
  addable: { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { createGoal, updateGoal } = useGoalMutations(boardId)

  const askPerson = state.scope === "user" && !state.person

  const schema = useMemo(
    () =>
      z.object({
        target: z
          .number({ error: t("pipelinesAdmin.goals.form.targetRequired") })
          .positive(t("pipelinesAdmin.goals.form.targetRequired"))
          .max(MAX_TARGET, t("pipelinesAdmin.goals.form.targetTooHigh"))
          .nullable()
          .refine((value) => value !== null, t("pipelinesAdmin.goals.form.targetRequired")),
        accountId: z
          .string()
          .nullable()
          .refine((value) => !askPerson || Boolean(value), t("pipelinesAdmin.goals.form.personRequired")),
      }),
    [askPerson, t]
  )

  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { target: state.target, accountId: state.person?.id ?? null },
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const targetValue = values.target
    if (state.goalId) {
      await updateGoal(state.goalId, { targetValue })
    } else {
      await createGoal({
        scope: state.scope,
        assignedAccountId: state.scope === "user" ? values.accountId : null,
        periodMonth: month,
        targetValue,
      })
    }
    toast.success(t("pipelinesAdmin.goals.form.saved"))
    close()
  })

  const who = state.scope === "funnel" ? t("pipelinesAdmin.goals.boardGoal") : state.person?.name

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={
        state.goalId ? t("pipelinesAdmin.goals.form.editTitle") : t("pipelinesAdmin.goals.form.createTitle")
      }
      description={[who, formatMonth(month, language)].filter(Boolean).join(" · ")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("pipelinesAdmin.goals.form.submit")}
          onCancel={close}
          requireChanges={Boolean(state.goalId)}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {askPerson ? (
          <ComboboxField
            control={form.control}
            name="accountId"
            label={t("pipelinesAdmin.goals.form.person")}
            options={addable.map((person) => ({ value: person.id, label: person.name }))}
            placeholder={t("pipelinesAdmin.goals.form.personPlaceholder")}
          />
        ) : null}
        <CurrencyField
          control={form.control}
          name="target"
          label={t("pipelinesAdmin.goals.form.target")}
          hint={t("pipelinesAdmin.goals.form.targetHint")}
        />
        {state.target ? (
          <p className="text-xs text-muted-foreground">
            {t("pipelinesAdmin.goals.form.current")} <Money value={state.target} />
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
