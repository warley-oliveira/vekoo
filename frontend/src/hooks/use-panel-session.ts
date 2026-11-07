import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { useConfirm } from "@/components/shared"

// O que os modais de edição têm em comum: a seleção da tela e a vida do modal
// não andam juntas. Ele continua na tela enquanto anima a saída, e cada abertura precisa
// nascer do zero.

/**
 * O último valor não nulo. Um painel que está fechando continua mostrando o registro até a
 * animação terminar, mesmo que a tela já tenha soltado a seleção.
 */
export function useRetained<T>(value: T | null | undefined): T | null {
  const [retained, setRetained] = useState<T | null>(value ?? null)
  if (value && value !== retained) {
    setRetained(value)
    return value
  }
  return retained
}

/**
 * Conta as aberturas, para servir de `key` do painel: sem isso, reabrir o mesmo registro
 * mostraria o que foi digitado e abandonado na vez anterior.
 */
export function useOpenCount(open: boolean): number {
  const [count, setCount] = useState(open ? 1 : 0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setCount(count + 1)
  }
  return count
}

/**
 * Fechar pelo X, pelo Esc ou clicando fora pergunta antes de perder o que foi digitado. O
 * botão Cancelar não passa por aqui: quem clicou nele já respondeu.
 */
export function useGuardedClose(isDirty: boolean, close: () => void) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  return useCallback(async () => {
    if (isDirty) {
      const leave = await confirm({
        title: t("kit.unsaved.title"),
        description: t("kit.unsaved.description"),
        confirmLabel: t("kit.unsaved.leave"),
        cancelLabel: t("kit.unsaved.stay"),
        destructive: true,
      })
      if (!leave) return
    }
    close()
  }, [close, confirm, isDirty, t])
}
