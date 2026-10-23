import { useEffect, useState } from "react"

import { useAuth } from "@/lib/auth"
import { subscribe } from "@/lib/cable"

export type LiveStatus = "connecting" | "online" | "offline"

/**
 * O "motor no ar" do topo: a conexão em tempo real com o servidor. É por ela
 * que chegam as peças prontas e as respostas do agente — caiu, a tela não
 * fica sabendo do que terminou até recarregar. Assina o canal do agente só
 * para ouvir o estado; as mensagens ficam com quem já as trata.
 */
export function useLiveStatus(): LiveStatus {
  const { session } = useAuth()
  const [status, setStatus] = useState<LiveStatus>("connecting")

  useEffect(() => {
    if (!session) return
    const unsubscribe = subscribe("AgentChannel", {
      received: () => {},
      connected: () => setStatus("online"),
      disconnected: () => setStatus("offline"),
    })
    if (!unsubscribe) setStatus("offline")
    return () => unsubscribe?.()
  }, [session])

  return status
}
