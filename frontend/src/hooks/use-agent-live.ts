import { useEffect, useRef } from "react"
import { useSWRConfig } from "swr"

import { isConversationKey } from "@/hooks/use-conversations"
import { isPieceKey } from "@/hooks/use-pieces"
import { useAuth } from "@/lib/auth"
import { subscribe } from "@/lib/cable"
import type { AgentTurn } from "@/lib/agent"

export type AgentEvent = { event: "turnUpdated"; conversationId: string; turn: AgentTurn }

/**
 * O turno ao vivo: o agente termina de pensar e a conversa recebe as
 * variações (ou a pergunta, ou a falha) sem recarregar.
 *
 * São dois tempos e dois canais de propósito: este avisa que o **agente**
 * decidiu; o `PieceChannel` avisa que a **imagem** ficou pronta. Quem
 * assistir aos dois vê o texto aparecer primeiro e a arte preencher depois —
 * que é exatamente a ordem em que as coisas acontecem no servidor.
 */
export function useAgentLive(onEvent?: (event: AgentEvent) => void) {
  const { session } = useAuth()
  const { mutate } = useSWRConfig()
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!session) return

    const unsubscribe = subscribe<AgentEvent>("AgentChannel", {
      received: (message) => {
        // A conversa e a lista voltam do servidor: o turno traz peças novas, e
        // a lista traz a data do último turno.
        void mutate(isConversationKey, undefined, { revalidate: true })
        // As peças nascem com o turno — a galeria precisa saber delas.
        void mutate(isPieceKey, undefined, { revalidate: true })
        handler.current?.(message)
      },
    })

    return () => unsubscribe?.()
  }, [session, mutate])
}
