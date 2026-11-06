import { createElement } from "react"
import { createRoot } from "react-dom/client"

import type { ConfirmOptions } from "./confirm-dialog"
import { ConfirmHost } from "./confirm-host"
import { ask } from "./confirm-store"

// Nada a montar no `main.tsx`: o anfitrião nasce sozinho na primeira chamada, e esquecer
// de montá-lo não deixaria a promessa pendurada para sempre. A raiz própria não perde
// nada, porque o diálogo só depende de i18n, que é global.
let hostMounted = false

function mountHost() {
  if (hostMounted) return
  hostMounted = true

  const container = document.createElement("div")
  container.dataset.slot = "confirm-host"
  document.body.appendChild(container)
  createRoot(container).render(createElement(ConfirmHost))
}

/**
 * Pergunta e espera: resolve `true` se a pessoa confirmou. Serve também fora de
 * componente. Uma pergunta nova substitui a que estiver aberta, que responde `false`.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  mountHost()
  return ask(options)
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
