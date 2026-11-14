import { useThreadStore, type ContactPresence } from "@/lib/chat/thread-store"

/**
 * Se o contato está digitando ou gravando, numa conversa cujo histórico está aberto. O canal só
 * conta isso a quem assina a conversa: para as outras linhas da lista, a resposta é sempre `null`.
 */
export function useContactPresence(key: string | null | undefined): ContactPresence {
  return useThreadStore((state) => (key ? (state.threads[key]?.presence ?? null) : null))
}
