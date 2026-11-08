import type { TFunction } from "i18next"
import { z } from "zod"

import type { SelectOption } from "@/components/shared"
import type { Account } from "@/lib/auth"
import { isValidPhone } from "@/lib/format-phone"
import type { AccessRole, Person, Team } from "@/lib/people/types"

// O que o painel de criar e o de editar têm em comum. Módulo sem componente, para os dois
// importarem sem depender um do outro.

/** "Dono" não é um grupo, mas para quem escolhe é a mesma pergunta: o que esta pessoa pode? */
export const OWNER_ACCESS = "owner"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

export function emailSchema(t: TFunction) {
  return z
    .string()
    .trim()
    .min(1, t("people.users.fields.emailRequired"))
    .regex(EMAIL_RE, t("people.users.fields.emailInvalid"))
}

const baseShape = (t: TFunction) => ({
  name: z
    .string()
    .trim()
    .min(2, t("people.users.fields.nameRequired"))
    .max(60, t("people.users.fields.nameTooLong")),
  email: emailSchema(t),
  phone: z
    .string()
    .refine((phone) => !phone || isValidPhone(phone), t("people.users.fields.phoneInvalid")),
  access: z.string().nullable(),
  teamIds: z.array(z.string()),
  setupOnly: z.boolean(),
})

/** Ao criar, a senha é obrigatória. */
export function createPersonSchema(t: TFunction) {
  return z
    .object({
      ...baseShape(t),
      password: z.string().min(MIN_PASSWORD, t("people.users.fields.passwordTooShort")),
      passwordConfirmation: z.string(),
    })
    .refine((values) => values.password === values.passwordConfirmation, {
      path: ["passwordConfirmation"],
      message: t("people.users.fields.passwordMismatch"),
    })
}

/**
 * Convidar quem já tem conta no Vekoo: nome, telefone e senha são da pessoa e não se pedem. Só o
 * que é do vínculo (grupo, departamentos, "não atende") vale.
 */
export function invitePersonSchema(t: TFunction) {
  return z.object({
    ...baseShape(t),
    name: z.string(),
    phone: z.string(),
    password: z.string(),
    passwordConfirmation: z.string(),
  })
}

/** Ao editar, a senha só conta se a pessoa abriu a seção de trocar. */
export function editPersonSchema(t: TFunction) {
  return z
    .object({
      ...baseShape(t),
      password: z
        .string()
        .refine(
          (password) => !password || password.length >= MIN_PASSWORD,
          t("people.users.fields.passwordTooShort")
        ),
      passwordConfirmation: z.string(),
    })
    .refine((values) => values.password === values.passwordConfirmation, {
      path: ["passwordConfirmation"],
      message: t("people.users.fields.passwordMismatch"),
    })
}

export type PersonFormValues = z.infer<ReturnType<typeof editPersonSchema>>

export function accessValueOf(person: Pick<Person, "role" | "accessRoleId">): string | null {
  return person.role === "owner" ? OWNER_ACCESS : person.accessRoleId
}

/** Só quem é dono cria outro dono, mas o dono que já existe precisa aparecer selecionado. */
export function accessOptions(
  roles: AccessRole[] | undefined,
  roleName: (role: AccessRole) => string,
  actor: Pick<Account, "role" | "support">,
  ownerLabel: string,
  includeOwner = false
): SelectOption[] {
  const groups = (roles ?? []).map((role) => ({ value: role.id, label: roleName(role) }))
  // O suporte do Vekoo pode tudo, inclusive dar a posse (a API confere do mesmo jeito).
  return actor.role === "owner" || actor.support || includeOwner
    ? [{ value: OWNER_ACCESS, label: ownerLabel }, ...groups]
    : groups
}

/** Departamento desativado não entra para gente nova, mas continua na ficha de quem já está. */
export function teamOptions(teams: Team[] | undefined, current: string[] = []): SelectOption[] {
  return (teams ?? [])
    .filter((team) => team.active || current.includes(team.id))
    .map((team) => ({ value: team.id, label: team.name }))
}

/** O que `role` e `accessRoleId` viram na API. */
export function accessToInput(access: string | null) {
  return access === OWNER_ACCESS
    ? { role: "owner" as const, accessRoleId: null }
    : { role: "member" as const, accessRoleId: access }
}
