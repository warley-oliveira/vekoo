import { useEffect, useRef } from "react"
import { useSWRConfig } from "swr"

import { isPieceKey, pieceKey } from "@/hooks/use-pieces"
import { useAuth } from "@/lib/auth"
import { subscribe } from "@/lib/cable"
import type { Piece } from "@/lib/engines"

export type PieceEvent = { event: "updated"; piece: Piece }

/**
 * As peças ao vivo: quando o job termina (pronta ou com falha), a lista e a
 * peça aberta recebem o estado novo pelo canal, sem recarregar.
 */
export function usePiecesLive(onEvent?: (event: PieceEvent) => void) {
  const { session } = useAuth()
  const { mutate } = useSWRConfig()
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!session) return

    const unsubscribe = subscribe<PieceEvent>("PieceChannel", {
      received: (message) => {
        void mutate(pieceKey(message.piece.id), message.piece, { revalidate: false })
        void mutate(isPieceKey, undefined, { revalidate: true })
        handler.current?.(message)
      },
    })

    return () => unsubscribe?.()
  }, [session, mutate])
}
