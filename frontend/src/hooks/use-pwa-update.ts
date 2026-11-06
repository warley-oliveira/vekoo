import { useSyncExternalStore } from "react"

import {
  applyPwaUpdate,
  dismissPwaUpdate,
  getPwaPhase,
  subscribeToPwaPhase,
} from "@/lib/pwa"

/** A fase de atualização do PWA, com as duas ações da pessoa. */
export function usePwaUpdate() {
  const phase = useSyncExternalStore(subscribeToPwaPhase, getPwaPhase)
  return { phase, apply: applyPwaUpdate, dismiss: dismissPwaUpdate }
}
