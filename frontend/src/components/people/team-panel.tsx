import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  SidePanel,
  SwitchField,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { useTeamMutations } from "@/hooks/people/use-teams"
import type { Team } from "@/lib/people/types"
import { TeamMembers } from "./team-members"

type TeamPanelProps = {
  /** Sem departamento, o painel cria. */
  team: Team | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Criou: o painel continua aberto neste departamento, para já pôr as pessoas. */
  onCreated: (team: Team) => void
  onDelete: (team: Team) => void
}

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("people.teams.fields.nameRequired"))
      .max(60, t("people.teams.fields.nameTooLong")),
    active: z.boolean(),
  })
}

type TeamValues = z.infer<ReturnType<typeof buildSchema>>

/** Criar, renomear e ver quem está no departamento, tudo no mesmo lugar. */
export function TeamPanel({ team, open, onOpenChange, onCreated, onDelete }: TeamPanelProps) {
  const { t } = useTranslation()
  const { createTeam, updateTeam } = useTeamMutations()

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<TeamValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: team?.name ?? "", active: team?.active ?? true },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    if (team) {
      await updateTeam(team.id, values)
      form.reset(values)
      toast.success(t("people.teams.edit.done", { name: values.name }))
      close()
    } else {
      const created = await createTeam(values)
      form.reset(values)
      toast.success(t("people.teams.create.done", { name: created.name }))
      onCreated(created)
    }
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={team?.name ?? t("people.teams.create.title")}
      description={team ? undefined : t("people.teams.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={team ? t("people.teams.edit.submit") : t("people.teams.create.submit")}
          onCancel={close}
          cancelLabel={team ? t("people.common.close") : undefined}
          requireChanges={Boolean(team)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="name"
            label={t("people.teams.fields.name")}
            placeholder={t("people.teams.fields.namePlaceholder")}
            autoComplete="off"
            spellCheck={false}
            autoFocus={!team}
          />
          <SwitchField
            control={form.control}
            name="active"
            label={t("people.teams.fields.active")}
            hint={t("people.teams.fields.activeHint")}
          />
        </div>

        {team ? <TeamMembers team={team} /> : null}

        {team ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(team)}
            >
              <Trash2 />
              {t("people.teams.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
