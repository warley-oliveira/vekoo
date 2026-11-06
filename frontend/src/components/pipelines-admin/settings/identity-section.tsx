import { useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { z } from "zod"

import {
  ColorField,
  Form,
  FormActions,
  SettingsSection,
  StatusBadge,
  TextField,
  TextareaField,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useBoardMutations } from "@/hooks/pipelines-admin/use-board"
import { useSyncedForm } from "@/hooks/pipelines-admin/use-synced-form"
import type { Board } from "@/lib/pipelines-admin/types"
import { BoardIconField, BoardIconTile } from "../board-icon"

const NAME_MAX = 120
const DESCRIPTION_MAX = 500

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("pipelinesAdmin.settings.identity.nameRequired"))
      .max(NAME_MAX, t("pipelinesAdmin.settings.identity.nameTooLong")),
    description: z.string().max(DESCRIPTION_MAX),
    color: z.string().nullable(),
    icon: z.string().nullable(),
  })
}

type IdentityValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(board: Board): IdentityValues {
  return {
    name: board.name,
    description: board.description ?? "",
    color: board.color,
    icon: board.icon,
  }
}

type SectionProps = {
  board: Board
  onDirtyChange: (dirty: boolean) => void
}

/** Como o quadro aparece no menu e nas listas: nome, descrição, cor e ícone. */
export function IdentitySection({ board, onDirtyChange }: SectionProps) {
  const { t } = useTranslation()
  const { updateBoard } = useBoardMutations(board.id)

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<IdentityValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(board),
    mode: "onBlur",
  })
  useSyncedForm(form, valuesOf(board))

  const isDirty = form.formState.isDirty
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  const name = useWatch({ control: form.control, name: "name" })
  const color = useWatch({ control: form.control, name: "color" })
  const icon = useWatch({ control: form.control, name: "icon" })

  return (
    <SettingsSection
      title={t("pipelinesAdmin.settings.identity.title")}
      description={t("pipelinesAdmin.settings.identity.description")}
    >
      <Form
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (values) => {
          const saved = await updateBoard({
            name: values.name.trim(),
            description: values.description.trim() || null,
            color: values.color,
            icon: values.icon,
          })
          form.reset(valuesOf(saved))
          toast.success(t("pipelinesAdmin.settings.identity.saved"))
        }}
      >
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
          <BoardIconTile icon={icon} color={color} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-base leading-snug font-medium">
              {name.trim() || t("pipelinesAdmin.settings.identity.noName")}
            </p>
            <StatusBadge tone="neutral" className="mt-1">
              {t(`pipelinesAdmin.boardTypes.${board.boardType}`)}
            </StatusBadge>
          </div>
        </div>

        <TextField
          control={form.control}
          name="name"
          label={t("pipelinesAdmin.settings.identity.name")}
          placeholder={t("pipelinesAdmin.settings.identity.namePlaceholder")}
          autoComplete="off"
          maxLength={NAME_MAX}
        />
        <TextareaField
          control={form.control}
          name="description"
          label={t("pipelinesAdmin.settings.identity.descriptionLabel")}
          placeholder={t("pipelinesAdmin.settings.identity.descriptionPlaceholder")}
          optional
          showCount
          maxLength={DESCRIPTION_MAX}
          rows={3}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            control={form.control}
            name="color"
            label={t("pipelinesAdmin.settings.identity.color")}
            placeholder={t("pipelinesAdmin.settings.identity.noColor")}
            optional
            action={
              color ? (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-xs"
                  onClick={() => form.setValue("color", null, { shouldDirty: true })}
                >
                  {t("pipelinesAdmin.settings.identity.clearColor")}
                </Button>
              ) : undefined
            }
          />
          <BoardIconField
            control={form.control}
            name="icon"
            label={t("pipelinesAdmin.settings.identity.icon")}
          />
        </div>
        <FormActions submitLabel={t("pipelinesAdmin.settings.identity.submit")} requireChanges />
      </Form>
    </SettingsSection>
  )
}
