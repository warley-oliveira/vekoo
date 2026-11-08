import type { Account } from "@/lib/auth"
import type { Person } from "./types"

// As regras de `Access::ManagePerson`, para a tela não oferecer o que a API vai recusar.
// A API continua sendo quem garante: isto só evita o botão que dá erro.

export type PersonRules = {
  isSelf: boolean
  isOwner: boolean
  /** Quem não é dono não mexe no dono: a ficha fica só para leitura. */
  isLocked: boolean
  /** A organização nunca fica sem um dono com acesso. */
  isLastOwner: boolean
  canEdit: boolean
  /** Nome, e-mail e telefone: só de quem não está em outra organização. */
  canEditIdentity: boolean
  canChangeAccess: boolean
  /** A própria senha só muda no perfil, onde a senha atual é pedida. */
  canChangePassword: boolean
  canRevoke: boolean
  canRestore: boolean
  canDelete: boolean
  /** Passar a posse: dono (ou o suporte) para alguém ativo que ainda não é dono. */
  canTransferOwnership: boolean
}

export function activeOwners(people: Person[]): Person[] {
  return people.filter((person) => person.role === "owner" && !person.revokedAt)
}

export function rulesFor(
  person: Person,
  actor: Pick<Account, "id" | "role" | "support">,
  people: Person[]
): PersonRules {
  const isSelf = person.id === actor.id
  const isOwner = person.role === "owner"
  const isRevoked = Boolean(person.revokedAt)
  // O suporte do Vekoo age como dono (a API confere igual).
  const actsAsOwner = actor.role === "owner" || actor.support
  const isLocked = isOwner && !actsAsOwner
  const shared = Boolean(person.identityShared)
  const isLastOwner = isOwner && !isRevoked && activeOwners(people).length <= 1
  const canAct = !isLocked

  return {
    isSelf,
    isOwner,
    isLocked,
    isLastOwner,
    canEdit: canAct,
    canEditIdentity: canAct && !shared,
    canChangeAccess: canAct && !isLastOwner,
    canChangePassword: canAct && !isSelf && !shared,
    canRevoke: canAct && !isSelf && !isRevoked && !isLastOwner,
    canRestore: canAct && isRevoked,
    canDelete: canAct && !isSelf && !isLastOwner,
    canTransferOwnership: actsAsOwner && !isSelf && !isOwner && !isRevoked,
  }
}

/** O primeiro nome, para os recados não soarem como formulário: "Camila", não "Camila Rocha". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}
