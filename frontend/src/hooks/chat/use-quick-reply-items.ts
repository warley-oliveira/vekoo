import { useEffect, useMemo } from "react"
import { useSWRConfig } from "swr"

import { ATTACHMENT_LIBRARY_KEY } from "@/hooks/content/use-attachments"
import { QUICK_REPLIES_KEY, useQuickReplies } from "@/hooks/content/use-quick-replies"
import type { QuickReply } from "@/lib/content/types"
import { matchesSearch } from "@/lib/search-text"

/** A lista rola: o limite só poupa desenho numa organização com centenas de mensagens. */
const MAX_ITEMS = 50

const NO_REPLIES: QuickReply[] = []

/** O que casa com o que foi digitado, e a lista conferida por trás ao abrir. */
export function useQuickReplyItems(query: string) {
  const { quickReplies = NO_REPLIES, isLoading, error, reload } = useQuickReplies()

  // Abriu: mostra o que já tem, e confere por trás se alguém mudou alguma coisa.
  const { mutate } = useSWRConfig()
  useEffect(() => {
    void mutate(QUICK_REPLIES_KEY)
    void mutate(ATTACHMENT_LIBRARY_KEY)
  }, [mutate])

  const items = useMemo(
    () =>
      quickReplies
        .filter((reply) => !query || matchesSearch(`${reply.trigger} ${reply.name}`, query))
        .slice(0, MAX_ITEMS),
    [query, quickReplies]
  )

  return { items, total: quickReplies.length, isLoading, error, reload }
}
