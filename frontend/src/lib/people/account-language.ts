import { SUPPORTED_LANGUAGES, type Language } from "@/lib/i18n"
import { safeLocalStorage } from "@/lib/safe-local-storage"

// O idioma da pessoa anda com a conta (`account.locale`), e a escolha continua valendo
// na hora, neste aparelho, mesmo sem rede. Quando a gravação falha, a escolha fica aqui
// esperando: na próxima sessão ela é a mais recente, e não a que veio do servidor.
//
// Módulo sem idioma: só códigos.

const PENDING_KEY = "vekoo.lang.pending"

type PendingChoice = { accountId: string; language: string }

/** O que a API guardou, se for um idioma que o app fala. */
export function supportedLanguage(value: string | null | undefined): Language | null {
  return SUPPORTED_LANGUAGES.find((language) => language === value) ?? null
}

/** A escolha desta conta, feita neste aparelho, que ainda não chegou ao servidor. */
export function pendingLanguage(accountId: string): Language | null {
  const stored = safeLocalStorage.getItem(PENDING_KEY)
  if (!stored) return null

  try {
    const pending = JSON.parse(stored) as PendingChoice
    return pending.accountId === accountId ? supportedLanguage(pending.language) : null
  } catch {
    return null
  }
}

export function rememberPendingLanguage(accountId: string, language: string): void {
  const pending: PendingChoice = { accountId, language }
  safeLocalStorage.setItem(PENDING_KEY, JSON.stringify(pending))
}

export function forgetPendingLanguage(): void {
  safeLocalStorage.removeItem(PENDING_KEY)
}
