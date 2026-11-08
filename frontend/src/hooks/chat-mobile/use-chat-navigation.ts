import { useCallback, useEffect, useLayoutEffect } from "react"
import { useNavigate } from "@/lib/router"

import { closeLayersThen } from "@/lib/back-stack"

/** Em que posição do histórico a lista ficou. Sobrevive a recarregar a página, e nada mais. */
const LIST_ENTRY_KEY = "vekoo.chat.list-entry"

function entryIndex(): number | null {
  const index = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof index === "number" ? index : null
}

function readListEntry(): number | null {
  try {
    const raw = window.sessionStorage.getItem(LIST_ENTRY_KEY)
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}

function writeListEntry(index: number | null) {
  try {
    if (index === null) window.sessionStorage.removeItem(LIST_ENTRY_KEY)
    else window.sessionStorage.setItem(LIST_ENTRY_KEY, String(index))
  } catch {
    // Sem sessionStorage a seta só deixa de reaproveitar a entrada: continua indo para a lista.
  }
}

/** Uma vez por carregamento: remontar a tela não pode empilhar outra lista. */
let seededList = false

/**
 * A pilha da conversa no celular: lista embaixo, conversa em cima.
 *
 * - Voltar da conversa e a seta do cabeçalho são o mesmo passo: a seta reaproveita a entrada que abrir
 *   a conversa empilhou, em vez de empilhar outra lista. Sem isso, voltar depois da seta reabria a
 *   conversa.
 * - Quem chegou por link (notificação, atalho) entra direto na conversa, e a lista é posta embaixo,
 *   para voltar levar a ela em vez de fechar o app. Quem veio de outra tela do app volta para lá.
 */
export function useChatNavigation(chatId: string | null) {
  const navigate = useNavigate()

  useLayoutEffect(() => {
    if (!chatId) writeListEntry(entryIndex())
  }, [chatId])

  useEffect(() => {
    if (seededList || !chatId) return
    seededList = true
    if (entryIndex() !== 0) return

    navigate("/chat", { replace: true })
    writeListEntry(0)
    navigate({ pathname: `/chat/${chatId}`, search: window.location.search })
    // Só na montagem: é o retrato de como a pessoa chegou aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goToList = useCallback(() => {
    closeLayersThen(() => {
      const index = entryIndex()
      const list = readListEntry()
      if (index !== null && list !== null && index === list + 1) navigate(-1)
      else navigate("/chat", { replace: true })
    })
  }, [navigate])

  return { goToList }
}
