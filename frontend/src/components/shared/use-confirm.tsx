import { useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"

import { ConfirmDialog, type ConfirmOptions } from "./confirm-dialog"

// Uma pergunta por vez, fora da árvore de quem pergunta. Nada a montar no `main.tsx`:
// o anfitrião nasce sozinho na primeira chamada, e esquecer de montá-lo não faz a
// promessa ficar pendurada para sempre. A raiz própria não perde nada, porque o
// diálogo só depende de i18n, que é global.

type Question = {
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

let question: Question | null = null
let open = false
let hostMounted = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function answer(confirmed: boolean) {
  question?.resolve(confirmed)
  // `question` fica para o diálogo não perder o texto durante a animação de saída.
  open = false
  emit()
}

function ConfirmHost() {
  const current = useSyncExternalStore(subscribe, () => question)
  const isOpen = useSyncExternalStore(subscribe, () => open)

  if (!current) return null

  return (
    <ConfirmDialog
      {...current.options}
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) answer(false)
      }}
      onConfirmed={() => answer(true)}
    />
  )
}

function mountHost() {
  if (hostMounted) return
  hostMounted = true

  const container = document.createElement("div")
  container.dataset.slot = "confirm-host"
  document.body.appendChild(container)
  createRoot(container).render(<ConfirmHost />)
}

/**
 * Pergunta e espera: resolve `true` se a pessoa confirmou. Serve também fora de
 * componente. Uma pergunta nova substitui a que estiver aberta, que responde `false`.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  mountHost()
  question?.resolve(false)

  return new Promise<boolean>((resolve) => {
    question = { options, resolve }
    open = true
    emit()
  })
}

/**
 * ```ts
 * const confirm = useConfirm()
 * if (await confirm({ title, destructive: true, confirmLabel })) remove()
 * ```
 */
export function useConfirm() {
  return confirm
}
