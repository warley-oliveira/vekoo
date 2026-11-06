/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from "virtual:pwa-register"

import { isChunkLoadError } from "@/lib/chunk-error"

// O ciclo de atualização do PWA, fora do React.
//
// O SW novo baixa em segundo plano e fica em "waiting". O app só avisa, sem bloquear
// nada; a troca acontece quando a pessoa clica em "Atualizar agora": aí vai o
// SKIP_WAITING e, quando o novo assume, a página recarrega. Sem atualização forçada,
// não há tela branca ao dar F5 no meio de um update.

/** `idle`: nada a fazer. `waiting`: há versão nova. `applying`: trocando agora. */
export type PwaPhase = "idle" | "waiting" | "applying"

const UPDATE_CHECK_MS = 60_000
/** Rede de segurança: o reload não veio, então devolve o botão em vez de ficar preso. */
const APPLY_TIMEOUT_MS = 8_000

let phase: PwaPhase = "idle"
const listeners = new Set<() => void>()
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined

function setPhase(next: PwaPhase) {
  if (phase === next) return
  phase = next
  listeners.forEach((listener) => listener())
}

export function getPwaPhase(): PwaPhase {
  return phase
}

export function subscribeToPwaPhase(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Aba visível recarrega na hora; aba em segundo plano espera a pessoa voltar, para não
 * jogar fora o que estava preenchido em outra aba quando esta atualizou.
 */
function reloadWhenVisible() {
  if (document.visibilityState === "visible") {
    window.location.reload()
    return
  }
  const onVisible = () => {
    if (document.visibilityState !== "visible") return
    document.removeEventListener("visibilitychange", onVisible)
    window.location.reload()
  }
  document.addEventListener("visibilitychange", onVisible)
}

/**
 * Um chunk que não veio costuma ser deploy novo. Se há SW esperando, mostra o aviso; se
 * não, procura por um. A rota que falhou já mostra a própria mensagem (RouteBoundary).
 */
function checkForUpdateAfterChunkError() {
  if (registration?.waiting) setPhase("waiting")
  else void registration?.update().catch(() => {})
}

/** Registra o service worker. Uma vez só, na abertura; em desenvolvimento não há SW. */
export function startPwa(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return

  applyUpdate = registerSW({
    immediate: true,
    onRegisteredSW(_url, swRegistration) {
      registration = swRegistration
      window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void swRegistration?.update().catch(() => {})
        }
      }, UPDATE_CHECK_MS)
    },
    onNeedRefresh() {
      setPhase("waiting")
    },
    onNeedReload: reloadWhenVisible,
    onRegisterError(error) {
      console.error("[pwa]", error)
    },
  })

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) checkForUpdateAfterChunkError()
  })
}

/** "Atualizar agora": SKIP_WAITING no SW que espera. O reload vem do `controlling`. */
export function applyPwaUpdate(): void {
  if (!applyUpdate && import.meta.env.PROD) return
  setPhase("applying")
  void applyUpdate?.(true)
  window.setTimeout(() => {
    if (phase === "applying") setPhase("waiting")
  }, APPLY_TIMEOUT_MS)
}

/** "Agora não": some até a próxima abertura, em que o SW ainda estará esperando. */
export function dismissPwaUpdate(): void {
  setPhase("idle")
}

/** Só para a página interna `/dev/shell`, onde não há service worker. */
export function simulatePwaPhase(next: PwaPhase): void {
  if (import.meta.env.DEV) setPhase(next)
}
