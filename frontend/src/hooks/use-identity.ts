import { useAuth, type Identity } from "@/lib/auth"

/** A pessoa garantida — para telas que só existem depois de entrar (escolha de organização). */
export function useIdentity(): Identity {
  const { identity } = useAuth()
  if (!identity) throw new Error("useIdentity usado fora de uma área autenticada")
  return identity
}
