import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trans, useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Crown, KeyRound, Lock, RotateCcw, Users, UserX } from "lucide-react"
import { toast } from "sonner"

import {
  FormActions,
  MultiSelectField,
  PhoneField,
  SelectField,
  ResponsiveDialog,
  SwitchField,
  TextField,
  UnsavedChangesDialog,
  useConfirm,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAccessRoles, useRoleName } from "@/hooks/people/use-access-roles"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { usePersonMutations } from "@/hooks/people/use-people"
import { usePersonActions } from "@/hooks/people/use-person-actions"
import { useTeams } from "@/hooks/people/use-teams"
import { useSession } from "@/lib/auth"
import { formatDate } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { isGranted } from "@/lib/people/permissions"
import { firstName, rulesFor } from "@/lib/people/person-rules"
import type { Person } from "@/lib/people/types"
import { Callout } from "@/components/shared/callout"
import {
  OWNER_ACCESS,
  accessOptions,
  accessToInput,
  accessValueOf,
  editPersonSchema,
  teamOptions,
  type PersonFormValues,
} from "./person-form"

type PersonPanelProps = {
  person: Person
  people: Person[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function sameItems(a: string[], b: string[]) {
  return a.length === b.length && a.every((item) => b.includes(item))
}

/**
 * A ficha de uma pessoa: dados, o que ela pode e o acesso. Cada abertura pede uma `key` nova,
 * porque o formulário nasce dos dados dela (ver `useOpenCount`).
 */
export function PersonPanel({ person, people, open, onOpenChange }: PersonPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { account: actor } = useSession()
  const confirm = useConfirm()
  const { updatePerson } = usePersonMutations()
  const { revoke, restore, remove, transfer } = usePersonActions()
  const { teams, isLoading: loadingTeams } = useTeams()
  const { roles, isLoading: loadingRoles, error: rolesError } = useAccessRoles()
  const roleName = useRoleName()

  const rules = rulesFor(person, actor, people)
  const name = firstName(person.name)
  const [changingPassword, setChangingPassword] = useState(false)

  const schema = useMemo(() => editPersonSchema(t), [t])
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: person.name,
      email: person.email,
      phone: person.phone ?? "",
      access: accessValueOf(person),
      teamIds: person.teamIds,
      setupOnly: person.setupOnly,
      password: "",
      passwordConfirmation: "",
    },
    mode: "onBlur",
  })

  const close = () => onOpenChange(false)

  const submit = useFormSubmit(form, async (values) => {
    const accessChanged = values.access !== accessValueOf(person)
    const changingOwnSettings =
      rules.isSelf && accessChanged && values.access !== OWNER_ACCESS
    const nextRole = roles?.find((role) => role.id === values.access)

    if (changingOwnSettings && !isGranted(nextRole?.permissions.core_settings)) {
      const stay = await confirm({
        title: t("people.users.selfLockout.title"),
        description: t("people.users.selfLockout.description"),
        confirmLabel: t("people.users.selfLockout.confirm"),
        destructive: true,
      })
      if (!stay) return
    }

    if (accessChanged && values.access === OWNER_ACCESS) {
      const promote = await confirm({
        title: t("people.users.promote.title", { name }),
        description: t("people.users.promote.description"),
        confirmLabel: t("people.users.promote.confirm"),
      })
      if (!promote) return
    }

    if (values.password) {
      const change = await confirm({
        title: t("people.users.password.confirmTitle", { name }),
        description: t("people.users.password.effect", { name }),
        confirmLabel: t("people.users.password.confirm"),
      })
      if (!change) return
    }

    await updatePerson(person.id, {
      ...(values.name.trim() !== person.name ? { name: values.name.trim() } : {}),
      ...(values.email.trim().toLowerCase() !== person.email
        ? { email: values.email.trim().toLowerCase() }
        : {}),
      ...(values.phone !== (person.phone ?? "") ? { phone: values.phone || null } : {}),
      ...(accessChanged ? accessToInput(values.access) : {}),
      ...(sameItems(values.teamIds, person.teamIds) ? {} : { teamIds: values.teamIds }),
      ...(values.setupOnly !== person.setupOnly ? { setupOnly: values.setupOnly } : {}),
      ...(values.password
        ? { password: values.password, passwordConfirmation: values.passwordConfirmation }
        : {}),
    })

    toast.success(
      values.password
        ? t("people.users.password.done", { name })
        : t("people.users.edit.done", { name })
    )
    close()
  })

  const isDirty = form.formState.isDirty
  const locked = !rules.canEdit
  const requestClose = useGuardedClose(isDirty, close)

  const options = accessOptions(
    roles,
    roleName,
    actor,
    t("people.users.access.owner"),
    rules.isOwner
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={person.name}
      description={person.email}
      size="lg"
      onSubmit={locked ? undefined : submit}
      footer={
        locked ? (
          <Button type="button" variant="outline" onClick={close} className="pointer-coarse:h-10">
            {t("people.common.close")}
          </Button>
        ) : (
          <FormActions
            form={form}
            submitLabel={t("people.users.edit.submit")}
            onCancel={close}
            requireChanges
          />
        )
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-6">
        {person.revokedAt ? (
          <Callout
            tone="warning"
            title={t("people.users.revoked.title", {
              date: formatDate(person.revokedAt, language),
            })}
            action={
              rules.canRestore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() => void restore(person)}
                >
                  <RotateCcw />
                  {t("people.users.restore.action")}
                </Button>
              ) : null
            }
          >
            {t("people.users.revoked.description", { name })}
          </Callout>
        ) : null}

        {rules.isLocked ? (
          <Callout icon={<Lock />}>{t("people.users.locked")}</Callout>
        ) : null}

        {!rules.isLocked && !rules.canEditIdentity && !rules.isSelf ? (
          <Callout icon={<Users />}>{t("people.users.identityShared", { name })}</Callout>
        ) : null}

        <div className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="name"
            label={t("people.users.fields.name")}
            autoComplete="off"
            spellCheck={false}
            disabled={locked || !rules.canEditIdentity}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="email"
              type="email"
              inputMode="email"
              label={t("people.users.fields.email")}
              autoComplete="off"
              disabled={locked || !rules.canEditIdentity}
            />
            <PhoneField
              control={form.control}
              name="phone"
              label={t("people.users.fields.phone")}
              optional
              disabled={locked || !rules.canEditIdentity}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t pt-5">
          <SelectField
            control={form.control}
            name="access"
            label={t("people.users.fields.access")}
            options={options}
            clearLabel={rules.isLastOwner ? undefined : t("people.users.access.none")}
            placeholder={
              loadingRoles
                ? t("people.common.loading")
                : t("people.users.access.none")
            }
            hint={
              rolesError
                ? t("people.users.fields.accessFailed")
                : rules.isLastOwner
                  ? t("people.users.fields.accessLastOwner")
                  : t("people.users.fields.accessHint")
            }
            disabled={!rules.canChangeAccess || loadingRoles || Boolean(rolesError)}
          />
          <MultiSelectField
            control={form.control}
            name="teamIds"
            label={t("people.users.fields.teams")}
            options={teamOptions(teams, person.teamIds)}
            placeholder={
              loadingTeams
                ? t("people.common.loading")
                : t("people.users.fields.teamsPlaceholder")
            }
            emptyLabel={t("people.users.fields.teamsEmpty")}
            optional
            disabled={locked}
          />
          <SwitchField
            control={form.control}
            name="setupOnly"
            label={t("people.users.fields.setupOnly")}
            hint={t("people.users.fields.setupOnlyHint")}
            disabled={locked}
          />
        </div>

        {rules.isSelf ? (
          <p className="border-t pt-5 text-sm text-muted-foreground">
            <Trans
              i18nKey="people.users.password.ownInProfile"
              components={{
                profile: (
                  <Link
                    to="/settings/profile"
                    className="rounded font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                ),
              }}
            />
          </p>
        ) : rules.canChangePassword ? (
          <div className="flex flex-col gap-3 border-t pt-5">
            {changingPassword ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    control={form.control}
                    name="password"
                    type="password"
                    label={t("people.users.fields.newPassword")}
                    hint={t("people.users.fields.passwordHint")}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <TextField
                    control={form.control}
                    name="passwordConfirmation"
                    type="password"
                    label={t("people.users.fields.newPasswordConfirmation")}
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("people.users.password.effect", { name })}
                </p>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 pointer-coarse:h-10"
                    onClick={() => {
                      setChangingPassword(false)
                      form.resetField("password")
                      form.resetField("passwordConfirmation")
                    }}
                  >
                    {t("people.users.password.keep")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-medium">{t("people.users.password.title")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("people.users.password.hint", { name })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="pointer-coarse:h-10"
                  onClick={() => setChangingPassword(true)}
                >
                  <KeyRound />
                  {t("people.users.password.action")}
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {rules.canTransferOwnership ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">{t("people.users.transfer.sectionTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("people.users.transfer.hint", { name })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              onClick={() => {
                void transfer(person).then((done) => {
                  if (done) close()
                })
              }}
            >
              <Crown />
              {t("people.users.transfer.action")}
            </Button>
          </div>
        ) : null}

        {rules.canRevoke ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">{t("people.users.revoke.sectionTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("people.users.revoke.hint", { name })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-10"
              onClick={() => void revoke(person)}
            >
              <UserX />
              {t("people.users.revoke.action")}
            </Button>
          </div>
        ) : rules.isSelf && !rules.isLastOwner ? (
          <p className="border-t pt-5 text-xs text-muted-foreground">
            {t("people.users.revoke.notSelf")}
          </p>
        ) : rules.isLastOwner ? (
          <p className="border-t pt-5 text-xs text-muted-foreground">
            {t("people.users.revoke.lastOwner")}
          </p>
        ) : null}

        {/* Por último e sem peso visual: revogar resolve quase todos os casos. */}
        {rules.canDelete ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => {
                void remove(person).then((removed) => {
                  if (removed) close()
                })
              }}
            >
              {t("people.users.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
