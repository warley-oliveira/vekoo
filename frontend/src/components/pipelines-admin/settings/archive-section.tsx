import { useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Info } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  Form,
  FormActions,
  NumberField,
  RadioField,
  SettingsSection,
} from "@/components/shared"
import { useBoardMutations } from "@/hooks/pipelines-admin/use-board"
import { useSyncedForm } from "@/hooks/pipelines-admin/use-synced-form"
import type { Board, DealCloseBehavior } from "@/lib/pipelines-admin/types"

const MAX_DAYS = 365
const DAY_MS = 86_400_000

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  const days = z
    .number()
    .int(t("pipelinesAdmin.settings.archive.daysRange", { max: MAX_DAYS }))
    .min(1, t("pipelinesAdmin.settings.archive.daysRange", { max: MAX_DAYS }))
    .max(MAX_DAYS, t("pipelinesAdmin.settings.archive.daysRange", { max: MAX_DAYS }))
    .nullable()

  return z
    .object({
      autoArchiveDays: days,
      dealCloseBehavior: z.enum(["manual", "immediate", "auto_archive_days"]),
      dealCloseArchiveDays: days,
    })
    .refine(
      (values) =>
        values.dealCloseBehavior !== "auto_archive_days" || values.dealCloseArchiveDays !== null,
      {
        path: ["dealCloseArchiveDays"],
        message: t("pipelinesAdmin.settings.archive.dealDaysRequired"),
      }
    )
}

type ArchiveValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(board: Board): ArchiveValues {
  return {
    autoArchiveDays: board.autoArchiveDays,
    dealCloseBehavior: board.dealCloseBehavior,
    dealCloseArchiveDays: board.dealCloseArchiveDays,
  }
}

/** Quantos cards a regra alcançaria hoje: parados há mais que isso, sem negócio fechado. */
function countStale(board: Board, days: number | null): number {
  if (!days || days < 1) return 0
  const threshold = Date.now() - days * DAY_MS
  return board.stages.reduce(
    (total, stage) =>
      total +
      stage.cards.filter((card) => !card.wonAt && !card.lostAt && card.updatedAt < threshold).length,
    0
  )
}

const DEAL_OPTIONS: DealCloseBehavior[] = ["manual", "immediate", "auto_archive_days"]

type SectionProps = {
  board: Board
  onDirtyChange: (dirty: boolean) => void
}

/** O que sai do quadro sozinho. Nada é apagado: arquivado continua em Arquivados. */
export function ArchiveSection({ board, onDirtyChange }: SectionProps) {
  const { t } = useTranslation()
  const { updateBoard } = useBoardMutations(board.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<ArchiveValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(board),
    mode: "onBlur",
  })
  useSyncedForm(form, valuesOf(board))

  const isDirty = form.formState.isDirty
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  const autoArchiveDays = useWatch({ control: form.control, name: "autoArchiveDays" })
  const dealCloseBehavior = useWatch({ control: form.control, name: "dealCloseBehavior" })
  const eligible = useMemo(() => countStale(board, autoArchiveDays), [autoArchiveDays, board])

  return (
    <SettingsSection
      title={t("pipelinesAdmin.settings.archive.title")}
      description={t("pipelinesAdmin.settings.archive.description")}
    >
      <Form
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (values) => {
          const saved = await updateBoard({
            autoArchiveDays: values.autoArchiveDays,
            dealCloseBehavior: values.dealCloseBehavior,
            dealCloseArchiveDays:
              values.dealCloseBehavior === "auto_archive_days" ? values.dealCloseArchiveDays : null,
          })
          form.reset(valuesOf(saved))
          toast.success(t("pipelinesAdmin.settings.archive.saved"))
        }}
      >
        <NumberField
          control={form.control}
          name="autoArchiveDays"
          label={t("pipelinesAdmin.settings.archive.staleLabel")}
          hint={t("pipelinesAdmin.settings.archive.staleHint")}
          placeholder={t("pipelinesAdmin.settings.archive.never")}
          optional
          min={1}
          max={MAX_DAYS}
        />

        {eligible > 0 ? (
          <Callout tone="neutral" icon={<Info />} role="status">
            {t("pipelinesAdmin.settings.archive.stalePreview", { count: eligible })}
          </Callout>
        ) : null}

        {board.boardType === "crm" ? (
          <>
            <RadioField
              control={form.control}
              name="dealCloseBehavior"
              label={t("pipelinesAdmin.settings.archive.dealLabel")}
              variant="cards"
              options={DEAL_OPTIONS.map((value) => ({
                value,
                label: t(`pipelinesAdmin.settings.archive.deal.${value}.label`),
                description: t(`pipelinesAdmin.settings.archive.deal.${value}.hint`),
              }))}
            />
            {dealCloseBehavior === "auto_archive_days" ? (
              <NumberField
                control={form.control}
                name="dealCloseArchiveDays"
                label={t("pipelinesAdmin.settings.archive.dealDays")}
                min={1}
                max={MAX_DAYS}
              />
            ) : null}
          </>
        ) : null}

        <FormActions submitLabel={t("pipelinesAdmin.settings.archive.submit")} requireChanges />
      </Form>
    </SettingsSection>
  )
}
