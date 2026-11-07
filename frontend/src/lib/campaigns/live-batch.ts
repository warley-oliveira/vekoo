// Agrupa o que chega em rajada: uma campanha pode mandar vários eventos por segundo, e a tela só
// precisa mudar uma vez a cada intervalo. O primeiro evento arma o relógio, os seguintes só se somam
// ao lote, e ao vencer sai tudo de uma vez.

export type Batcher = {
  /** Pede uma descarga. Se já há uma armada, não faz nada: o lote só cresceu. */
  schedule: () => void
  /** Descarrega agora, por exemplo ao reconectar. */
  flush: () => void
  cancel: () => void
}

export function createBatcher(interval: number, onFlush: () => void): Batcher {
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    schedule() {
      if (!timer) {
        timer = setTimeout(() => {
          timer = null
          onFlush()
        }, interval)
      }
    },
    flush() {
      cancel()
      onFlush()
    },
    cancel,
  }
}
