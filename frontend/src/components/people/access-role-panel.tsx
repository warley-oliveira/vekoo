import { useMemo } from "react"
import { useController, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FormActions,
  InlineError,
  ListSkeleton,
  SidePanel,
  TextField,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAccessRoleMutations, useRoleName } from "@/hooks/people/use-access-roles"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { usePeople } from "@/hooks/people/use-people"
import { useSession } from "@/lib/auth"
import {
  BLANK_PERMISSIONS,
  CHAT_LIST_LEVELS,
  PERMISSION_LEVELS,
  completePermissions,
  isGranted,
} from "@/lib/people/permissions"
import type { AccessRole } from "@/lib/people/types"
import { PermissionEditor } from "./permission-editor"
import { PersonIdentity } from "./person-identity"

type AccessRolePanelProps = {
  /** Sem grupo, o painel cria. */
  role: AccessRole | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (role: AccessRole) => void
}

/** Os mesmos níveis da API: um valor fora daqui nem sai do navegador. */
function buildSchema(t: (key: string) => string, nameIsFixed: boolean) {
  const level = z.enum(PERMISSION_LEVELS)

  return z.object({
    name: nameIsFixed
      ? z.string()
      : z
          .string()
          .trim()
          .min(1, t("people.roles.fields.nameRequired"))
          .max(60, t("people.roles.fields.nameTooLong")),
    permissions: z.object({
      dashboard: level,
      custom_dashboards: level,
      flows: level,
      calendar: level,
      pipelines: level,
      chat: level,
      chat_list_to: z.enum(CHAT_LIST_LEVELS),
      contacts: level,
      catalog: level,
      funnel: level,
      campaigns: level,
      core_settings: level,
    }),
  })
}

type RoleValues = z.infer<ReturnType<typeof buildSchema>>

/**
 * Nome, o que o grupo libera e quem está nele. Os grupos padrão não mudam de nome nem saem,
 * mas as permissões deles são editáveis.
 */
export function AccessRolePanel({ role, open, onOpenChange, onDelete }: AccessRolePanelProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { account: actor } = useSession()
  const { createRole, updateRole } = useAccessRoleMutations()
  const { people, error: peopleError, isLoading: loadingPeople, reload: reloadPeople } = usePeople()
  const roleName = useRoleName()

  const nameIsFixed = Boolean(role?.default)
  const schema = useMemo(() => buildSchema(t, nameIsFixed), [nameIsFixed, t])
  const form = useForm<RoleValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: role ? roleName(role) : "",
      permissions: completePermissions(role?.permissions ?? BLANK_PERMISSIONS) as RoleValues["permissions"],
    },
    mode: "onBlur",
  })
  const { field: permissions, fieldState: permissionsState } = useController({
    control: form.control,
    name: "permissions",
  })

  const members = useMemo(
    () =>
      role
        ? (people ?? []).filter((person) => person.accessRoleId === role.id && !person.revokedAt)
        : [],
    [people, role]
  )

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const inThisGroup = role && actor.role !== "owner" && actor.accessRoleId === role.id
    const losesSettings =
      inThisGroup &&
      isGranted(role.permissions.core_settings) &&
      !isGranted(values.permissions.core_settings)

    if (losesSettings) {
      const proceed = await confirm({
        title: t("people.users.selfLockout.title"),
        description: t("people.users.selfLockout.description"),
        confirmLabel: t("people.users.selfLockout.confirm"),
        destructive: true,
      })
      if (!proceed) return
    }

    if (role) {
      await updateRole(role.id, {
        // O nome gravado dos padrões é dado, em pt-BR: aqui ele vem traduzido e nem deve ir.
        ...(nameIsFixed ? {} : { name: values.name.trim() }),
        permissions: values.permissions,
      })
      toast.success(t("people.roles.edit.done", { name: roleName(role) }))
    } else {
      const created = await createRole({
        name: values.name.trim(),
        permissions: values.permissions,
      })
      toast.success(t("people.roles.create.done", { name: created.name }))
    }
    form.reset(values)
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={role ? roleName(role) : t("people.roles.create.title")}
      description={role ? undefined : t("people.roles.create.description")}
      size="lg"
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={role ? t("people.roles.edit.submit") : t("people.roles.create.submit")}
          onCancel={close}
          requireChanges={Boolean(role)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-6">
        <TextField
          control={form.control}
          name="name"
          label={t("people.roles.fields.name")}
          placeholder={t("people.roles.fields.namePlaceholder")}
          hint={nameIsFixed ? t("people.roles.fields.nameFixed") : undefined}
          disabled={nameIsFixed}
          autoComplete="off"
          spellCheck={false}
          autoFocus={!role}
        />

        <PermissionEditor
          value={permissions.value}
          onChange={permissions.onChange}
          // Nível fora do contrato em algum recurso: o erro é do mapa, e não de um campo que a
          // tela mostre. Sem esta frase, o envio pararia em silêncio.
          error={
            permissionsState.error
              ? (permissionsState.error.message ?? t("people.roles.fields.permissionsInvalid"))
              : undefined
          }
        />

        {role ? (
          <section className="flex flex-col gap-3 border-t pt-5">
            <div>
              <h3 className="text-sm font-medium">{t("people.roles.members.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("people.roles.members.hint")}</p>
            </div>
            {peopleError && !people ? (
              <div className="rounded-lg border border-dashed">
                <InlineError onRetry={reloadPeople} />
              </div>
            ) : loadingPeople ? (
              <ListSkeleton rows={3} avatar />
            ) : members.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                {t("people.roles.members.empty")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {members.map((person) => (
                  <li key={person.id}>
                    <Link
                      to={`/settings/users?person=${person.id}`}
                      className="block px-3 py-2 outline-none transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <PersonIdentity
                        name={person.name}
                        email={person.email}
                        avatarUrl={person.avatarUrl}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {role && !role.default ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(role)}
            >
              <Trash2 />
              {t("people.roles.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
