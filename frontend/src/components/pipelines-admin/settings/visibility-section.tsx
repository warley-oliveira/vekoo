import { useEffect, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { EyeOff, Info, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  Form,
  FormActions,
  MultiSelectField,
  RadioField,
  SettingsSection,
} from "@/components/shared"
import { useAccessRoles, useRoleName } from "@/hooks/people/use-access-roles"
import { useBoardMutations } from "@/hooks/pipelines-admin/use-board"
import { useSyncedForm } from "@/hooks/pipelines-admin/use-synced-form"
import { useCan } from "@/hooks/use-can"
import type { Board } from "@/lib/pipelines-admin/types"

function buildSchema(t: (key: string) => string) {
  return z
    .object({
      cardVisibility: z.enum(["all", "assigned"]),
      cardVisibilityBypassRoleIds: z.array(z.string()),
    })
    .refine(
      (values) =>
        values.cardVisibility === "all" || values.cardVisibilityBypassRoleIds.length > 0,
      {
        path: ["cardVisibilityBypassRoleIds"],
        message: t("pipelinesAdmin.settings.visibility.rolesRequired"),
      }
    )
}

type VisibilityValues = z.infer<ReturnType<typeof buildSchema>>

function valuesOf(board: Board): VisibilityValues {
  return {
    cardVisibility: board.cardVisibility,
    cardVisibilityBypassRoleIds: board.cardVisibilityBypassRoleIds,
  }
}

type SectionProps = {
  board: Board
  onDirtyChange: (dirty: boolean) => void
}

/**
 * Quem vê o quê. Duas travas no servidor: quem está restrito não muda a regra, e ninguém salva uma
 * regra que o tranque para fora. Apagar o último grupo liberado mantém o quadro restrito, e só a
 * dona da organização continua vendo tudo: o lado seguro, mas a tela precisa contar.
 */
export function VisibilitySection({ board, onDirtyChange }: SectionProps) {
  const { t } = useTranslation()

  if (!board.viewerCanViewAllCards) {
    return (
      <SettingsSection
        title={t("pipelinesAdmin.settings.visibility.title")}
        description={t("pipelinesAdmin.settings.visibility.description")}
      >
        <Callout tone="info" icon={<EyeOff />} role="status">
          {t("pipelinesAdmin.settings.visibility.restrictedViewer")}
        </Callout>
      </SettingsSection>
    )
  }

  return <VisibilityForm board={board} onDirtyChange={onDirtyChange} />
}

function VisibilityForm({ board, onDirtyChange }: SectionProps) {
  const { t } = useTranslation()
  const { updateBoard } = useBoardMutations(board.id)

  // `/access-roles` exige `core_settings`, até para ler. Sem ela, dá para ver a regra, não mudar.
  const canPickRoles = useCan("core_settings")
  const { roles } = useAccessRoles({ enabled: canPickRoles })
  const roleName = useRoleName()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<VisibilityValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(board),
  })
  useSyncedForm(form, valuesOf(board))

  const isDirty = form.formState.isDirty
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  const mode = useWatch({ control: form.control, name: "cardVisibility" })

  const roleOptions = useMemo(
    () => (roles ?? []).map((role) => ({ value: role.id, label: roleName(role) })),
    [roleName, roles]
  )

  const lockedOut =
    board.cardVisibility === "assigned" && board.cardVisibilityBypassRoleIds.length === 0

  return (
    <SettingsSection
      title={t("pipelinesAdmin.settings.visibility.title")}
      description={t("pipelinesAdmin.settings.visibility.description")}
    >
      {lockedOut ? (
        <Callout tone="warning" icon={<TriangleAlert />} role="status">
          {t("pipelinesAdmin.settings.visibility.noRolesLeft")}
        </Callout>
      ) : null}

      <Form
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (values) => {
          const saved = await updateBoard(values)
          form.reset(valuesOf(saved))
          toast.success(t("pipelinesAdmin.settings.visibility.saved"))
        }}
      >
        <RadioField
          control={form.control}
          name="cardVisibility"
          label={t("pipelinesAdmin.settings.visibility.mode")}
          variant="cards"
          disabled={!canPickRoles}
          options={[
            {
              value: "all",
              label: t("pipelinesAdmin.settings.visibility.modeAll"),
              description: t("pipelinesAdmin.settings.visibility.modeAllHint"),
            },
            {
              value: "assigned",
              label: t("pipelinesAdmin.settings.visibility.modeAssigned"),
              description: t("pipelinesAdmin.settings.visibility.modeAssignedHint"),
            },
          ]}
        />

        {mode === "assigned" && canPickRoles ? (
          <>
            <MultiSelectField
              control={form.control}
              name="cardVisibilityBypassRoleIds"
              label={t("pipelinesAdmin.settings.visibility.roles")}
              hint={t("pipelinesAdmin.settings.visibility.rolesHint")}
              options={roleOptions}
              placeholder={t("pipelinesAdmin.settings.visibility.rolesPlaceholder")}
            />
            <Callout tone="neutral" icon={<Info />}>
              {t("pipelinesAdmin.settings.visibility.unassignedNotice")}
            </Callout>
          </>
        ) : null}

        {canPickRoles ? (
          <FormActions submitLabel={t("pipelinesAdmin.settings.visibility.submit")} requireChanges />
        ) : (
          <p className="text-xs text-pretty text-muted-foreground">
            {t("pipelinesAdmin.settings.visibility.needsSettings")}
          </p>
        )}
      </Form>
    </SettingsSection>
  )
}
