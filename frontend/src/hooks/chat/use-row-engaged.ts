import { useCallback, useState } from "react"

/**
 * Se a linha do histórico já foi usada. Cada bolha na tela teria um menu e um popover: montar as
 * ações só quando o ponteiro ou o foco chegam evita que rolar uma conversa longa monte dezenas por
 * segundo sem ninguém abrir nenhum.
 */
export function useRowEngaged() {
  const [engaged, setEngaged] = useState(false)
  const engage = useCallback(() => setEngaged(true), [])
  return { engaged, engage }
}
