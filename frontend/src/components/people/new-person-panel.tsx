import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { ArrowRight, Loader2, RotateCcw } from "lucide-react"
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
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAccessRoles, useRoleName } from "@/hooks/people/use-access-roles"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { usePersonMutations } from "@/hooks/people/use-people"
import { usePersonActions } from "@/hooks/people/use-person-actions"
import { useTeams } from "@/hooks/people/use-teams"
import { useSession } from "@/lib/auth"
import { useMotionPreset } from "@/lib/motion"
import { errorMessage } from "@/lib/people/error-message"
import { firstName } from "@/lib/people/person-rules"
import type { Person } from "@/lib/people/types"
import { Callout } from "@/components/shared/callout"
import {
  accessOptions,
  accessToInput,
  createPersonSchema,
  teamOptions,
  type PersonFormValues,
} from "./person-form"

type NewPersonPanelProps = {
  people: Person[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O e-mail já é de alguém daqui: abre a ficha dessa pessoa. */
  onOpenPerson: (id: string) => void
}

type Conflict = { email: string; kind: "here" | "revoked" | "elsewhere" }

function normalizedEmail(email: string) {
  return email.trim().toLowerCase()
}

/**
 * Adicionar alguém começa pelo e-mail, porque ele é único no produto inteiro: antes de pedir
 * nome e senha, vale saber se a pessoa já está aqui, se foi revogada, ou se é de outra
 * organização, caso em que não dá para adicionar.
 */
export function NewPersonPanel({ people, open, onOpenChange, onOpenPerson }: NewPersonPanelProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const { account: actor } = useSession()
  const { createPerson, checkEmail } = usePersonMutations()
  const { restore } = usePersonActions()
  const { teams } = useTeams()
  const { roles, isLoading: loadingRoles } = useAccessRoles()
  const roleName = useRoleName()

  const [step, setStep] = useState<"email" | "details">("email")
  const [checking, setChecking] = useState(false)
  const [foundConflict, setFoundConflict] = useState<Conflict | null>(null)

  const schema = useMemo(() => createPersonSchema(t), [t])
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      access: null,
      teamIds: [],
      setupOnly: false,
      password: "",
      passwordConfirmation: "",
    },
    mode: "onBlur",
  })

  // O ponto de partida é o grupo "Usuário": quase todo mundo entra assim. Uma vez só, ao
  // chegar nos detalhes: quem voltar para trocar o e-mail não perde o que escolheu.
  const memberRoleId = roles?.find((role) => role.defaultKey === "member")?.id
  const startingGroupApplied = useRef(false)
  useEffect(() => {
    if (step === "details" && memberRoleId && !startingGroupApplied.current) {
      startingGroupApplied.current = true
      form.setValue("access", memberRoleId)
    }
  }, [form, memberRoleId, step])

  // Só vale para o e-mail conferido: mexeu no campo, o recado some sozinho.
  const email = useWatch({ control: form.control, name: "email" })
  const conflict =
    foundConflict && foundConflict.email === normalizedEmail(email) ? foundConflict : null
  const existing = conflict
    ? people.find((person) => person.email === conflict.email)
    : undefined

  useEffect(() => {
    if (step === "details") form.setFocus("name")
  }, [form, step])

  const close = () => onOpenChange(false)

  async function checkAndContinue() {
    if (checking) return
    if (!(await form.trigger("email", { shouldFocus: true }))) return

    const candidate = normalizedEmail(form.getValues("email"))
    setChecking(true)
    try {
      const result = await checkEmail(candidate)
      if (!result.exists) {
        setFoundConflict(null)
        setStep("details")
      } else {
        const kind = !result.hasOrganizationAccess
          ? "elsewhere"
          : result.revoked
            ? "revoked"
            : "here"
        setFoundConflict({ email: candidate, kind })
      }
    } catch (error) {
      form.setError("email", { type: "server", message: errorMessage(t, error) })
    } finally {
      setChecking(false)
    }
  }

  const submitDetails = useFormSubmit(form, async (values) => {
    await createPerson({
      name: values.name.trim(),
      email: normalizedEmail(values.email),
      phone: values.phone || null,
      password: values.password,
      passwordConfirmation: values.passwordConfirmation,
      teamIds: values.teamIds,
      setupOnly: values.setupOnly,
      ...accessToInput(values.access),
    })
    toast.success(t("people.users.create.done", { name: firstName(values.name) }), {
      description: t("people.users.create.doneHint"),
    })
    close()
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (step === "details") {
      void submitDetails(event)
      return
    }
    event.preventDefault()
    void checkAndContinue()
  }

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      title={t("people.users.create.title")}
      description={
        step === "email"
          ? t("people.users.create.emailStep")
          : t("people.users.create.detailsStep")
      }
      size="lg"
      onSubmit={handleSubmit}
      footer={
        step === "email" ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={close}>
              {t("people.common.cancel")}
            </Button>
            <Button
              type="submit"
              aria-busy={checking}
              className="pointer-coarse:h-10"
              disabled={conflict !== null}
            >
              {checking ? <Loader2 className="animate-spin" /> : null}
              {t("people.users.create.continue")}
              {checking ? null : <ArrowRight />}
            </Button>
          </div>
        ) : (
          <FormActions
            form={form}
            submitLabel={t("people.users.create.submit")}
            onCancel={close}
          />
        )
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <TextField
          control={form.control}
          name="email"
          type="email"
          inputMode="email"
          label={t("people.users.fields.email")}
          placeholder={t("people.users.fields.emailPlaceholder")}
          autoComplete="off"
          autoFocus
          disabled={step === "details"}
          action={
            step === "details" ? (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  form.clearErrors("email")
                  setStep("email")
                }}
              >
                {t("people.users.create.changeEmail")}
              </Button>
            ) : undefined
          }
        />

        <AnimatePresence mode="wait" initial={false}>
          {step === "email" ? (
            conflict ? (
              <motion.div key={conflict.kind} {...preset.fade}>
                {conflict.kind === "elsewhere" ? (
                  <Callout tone="warning" role="status" title={t("people.users.create.elsewhereTitle")}>
                    {t("people.users.create.elsewhereDescription")}
                  </Callout>
                ) : conflict.kind === "here" ? (
                  <Callout
                    role="status"
                    title={t("people.users.create.hereTitle")}
                    action={
                      existing ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="pointer-coarse:h-10"
                          onClick={() => onOpenPerson(existing.id)}
                        >
                          {t("people.users.create.openPerson")}
                        </Button>
                      ) : null
                    }
                  >
                    {t("people.users.create.hereDescription")}
                  </Callout>
                ) : (
                  <Callout
                    tone="warning"
                    role="status"
                    title={t("people.users.create.revokedTitle")}
                    action={
                      existing ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="pointer-coarse:h-10"
                          onClick={() => {
                            void restore(existing).then((restored) => {
                              if (restored) onOpenPerson(existing.id)
                            })
                          }}
                        >
                          <RotateCcw />
                          {t("people.users.restore.action")}
                        </Button>
                      ) : null
                    }
                  >
                    {t("people.users.create.revokedDescription")}
                  </Callout>
                )}
              </motion.div>
            ) : null
          ) : (
            <motion.div key="details" {...preset.slideUp} className="flex flex-col gap-5">
              <div className="flex flex-col gap-4">
                <TextField
                  control={form.control}
                  name="name"
                  label={t("people.users.fields.name")}
                  placeholder={t("people.users.fields.namePlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                />
                <PhoneField
                  control={form.control}
                  name="phone"
                  label={t("people.users.fields.phone")}
                  optional
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    control={form.control}
                    name="password"
                    type="password"
                    label={t("people.users.fields.password")}
                    hint={t("people.users.fields.passwordHint")}
                    autoComplete="new-password"
                  />
                  <TextField
                    control={form.control}
                    name="passwordConfirmation"
                    type="password"
                    label={t("people.users.fields.passwordConfirmation")}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4 border-t pt-5">
                <SelectField
                  control={form.control}
                  name="access"
                  label={t("people.users.fields.access")}
                  options={accessOptions(roles, roleName, actor, t("people.users.access.owner"))}
                  clearLabel={t("people.users.access.none")}
                  placeholder={
                    loadingRoles ? t("people.common.loading") : t("people.users.access.none")
                  }
                  hint={t("people.users.fields.accessHint")}
                  disabled={loadingRoles}
                />
                <MultiSelectField
                  control={form.control}
                  name="teamIds"
                  label={t("people.users.fields.teams")}
                  options={teamOptions(teams)}
                  placeholder={t("people.users.fields.teamsPlaceholder")}
                  emptyLabel={t("people.users.fields.teamsEmpty")}
                  optional
                />
                <SwitchField
                  control={form.control}
                  name="setupOnly"
                  label={t("people.users.fields.setupOnly")}
                  hint={t("people.users.fields.setupOnlyHint")}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ResponsiveDialog>
  )
}
