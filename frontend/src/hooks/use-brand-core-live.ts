import { useEffect, useRef } from "react"
import { useSWRConfig } from "swr"

import { BRAND_CORE_KEY, BRAND_VERSIONS_KEY } from "@/hooks/use-brand-core"
import { useAuth } from "@/lib/auth"
import type { BrandCompleteness, BrandStatus } from "@/lib/brand-core"
import { getClientId, subscribe } from "@/lib/cable"

/** O que `BrandCoreChannel` transmite (ver `BrandCoreSerializer.event`). */
export type BrandCoreEvent = {
  event: "updated" | "published" | "assetsChanged"
  brandCoreId: string
  status: BrandStatus
  completeness: BrandCompleteness
  currentVersion: number
  updatedAt: number
  accountId: string | null
  accountName: string | null
  clientId: string | null
}

/**
 * Mantém o Brandcore vivo entre abas e pessoas: quando outra aba salva,
 * publica ou troca um ativo, esta recarrega pelo SWR. O eco da própria aba
 * é ignorado — recarregar por cima do que a pessoa digita seria pior do que
 * não ter canal.
 */
export function useBrandCoreLive(onEvent?: (event: BrandCoreEvent) => void) {
  const { session } = useAuth()
  const { mutate } = useSWRConfig()
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!session) return

    const unsubscribe = subscribe<BrandCoreEvent>("BrandCoreChannel", {
      received: (message) => {
        if (message.clientId && message.clientId === getClientId()) return
        void mutate(BRAND_CORE_KEY)
        if (message.event === "published") void mutate(BRAND_VERSIONS_KEY)
        handler.current?.(message)
      },
    })

    return () => unsubscribe?.()
  }, [session, mutate])
}
