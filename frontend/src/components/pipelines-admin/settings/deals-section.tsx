import { useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { toast } from "sonner"
import { z } from "zod"

import {
  Form,
  FormActions,
  NumberField,
  SelectField,
  SettingsSection,
} from "@/components/shared"
import { useBoardMutations } from "@/hooks/pipelines-admin/use-board"
import { useSyncedForm } from "@/hooks/pipelines-admin/use-synced-form"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import type { Board } from "@/lib/pipelines-admin/types"

const SCORE_MAX = 1000

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      dealRottingDays: z
        .number()
        .int(t("pipelinesAdmin.settings.deals.wholeDays"))
        .min(1, t("pipelinesAdmin.settings.deals.wholeDays"))
        .nullable(),
      leadScoreFieldKey: z.string().nullable(),
      leadScoreLow: z.number().int().min(0).max(SCORE_MAX).nullable(),
      leadScoreHigh: z.number().int().min(0).max(SCORE_MAX).nullable(),
    })
    .refine(
      (values) =>
        !values.leadScoreFieldKey ||
        (values.leadScoreLow ?? 0) < (values.leadScoreHigh ?? SCORE_MAX),
      {
        path: ["leadScoreHigh"],
        message: t("pipelinesAdmin.settings.deals.scoreOrder"),
      }
    )
}

type DealsValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(board: Board): DealsValues {
  return {
    dealRottingDays: board.dealRottingDays,
    leadScoreFieldKey: board.leadScoreFieldKey,
    leadScoreLow: board.leadScoreLow,
    leadScoreHigh: board.leadScoreHigh,
  }
}

type SectionProps = {
  board: Board
  onDirtyChange: (dirty: boolean) => void
}

/** Quando o negócio esfria e o que a pontuação quer dizer. */
export function DealsSection({ board, onDirtyChange }: SectionProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { updateBoard } = useBoardMutations(board.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<DealsValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(board),
    mode: "onBlur",
  })
  useSyncedForm(form, valuesOf(board))

  const isDirty = form.formState.isDirty
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  const fieldKey = useWatch({ control: form.control, name: "leadScoreFieldKey" })
  const low = useWatch({ control: form.control, name: "leadScoreLow" })
  const high = useWatch({ control: form.control, name: "leadScoreHigh" })

  const numberFields = useMemo(
    () =>
      board.customFields
        .filter((field) => field.fieldType === "number")
        .map((field) => ({ value: field.key, label: field.name })),
    [board.customFields]
  )

  return (
    <SettingsSection
      title={t("pipelinesAdmin.settings.deals.title")}
      description={t("pipelinesAdmin.settings.deals.description")}
    >
      <Form
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (values) => {
          const saved = await updateBoard({
            dealRottingDays: values.dealRottingDays,
            leadScoreFieldKey: values.leadScoreFieldKey,
            leadScoreLow: values.leadScoreLow ?? 0,
            leadScoreHigh: values.leadScoreHigh ?? SCORE_MAX,
          })
          form.reset(valuesOf(saved))
          toast.success(t("pipelinesAdmin.settings.deals.saved"))
        }}
      >
        {board.boardType === "crm" ? (
          <NumberField
            control={form.control}
            name="dealRottingDays"
            label={t("pipelinesAdmin.settings.deals.rotting")}
            hint={t("pipelinesAdmin.settings.deals.rottingHint")}
            optional
            min={1}
            max={365}
          />
        ) : null}

        <SelectField
          control={form.control}
          name="leadScoreFieldKey"
          label={t("pipelinesAdmin.settings.deals.scoreField")}
          hint={
            numberFields.length === 0 ? (
              <Link to={`/pipelines/${board.id}/settings/fields`} className="underline underline-offset-2">
                {t("pipelinesAdmin.settings.deals.scoreNoFields")}
              </Link>
            ) : (
              t("pipelinesAdmin.settings.deals.scoreHint")
            )
          }
          options={numberFields}
          placeholder={t("pipelinesAdmin.settings.deals.scoreOff")}
          clearLabel={t("pipelinesAdmin.settings.deals.scoreOff")}
          disabled={numberFields.length === 0}
          optional
        />

        {fieldKey ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                control={form.control}
                name="leadScoreLow"
                label={t("pipelinesAdmin.settings.deals.scoreLow")}
                min={0}
                max={SCORE_MAX}
              />
              <NumberField
                control={form.control}
                name="leadScoreHigh"
                label={t("pipelinesAdmin.settings.deals.scoreHigh")}
                min={0}
                max={SCORE_MAX}
              />
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              {t("pipelinesAdmin.settings.deals.scorePreview", {
                low: formatNumber(low ?? 0, language),
                high: formatNumber(high ?? SCORE_MAX, language),
              })}
            </p>
          </>
        ) : null}

        <FormActions submitLabel={t("pipelinesAdmin.settings.deals.submit")} requireChanges />
      </Form>
    </SettingsSection>
  )
}
