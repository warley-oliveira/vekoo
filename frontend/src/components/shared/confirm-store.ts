import type { ConfirmOptions } from "./confirm-dialog"

// A pergunta em aberto de `useConfirm`, uma por vez. Vive fora do React para valer também
// fora de componente, e o anfitrião só a observa.

type Question = {
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

let question: Question | null = null
let open = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const getQuestion = () => question
export const getIsOpen = () => open

/** Responde a pergunta. Ela continua guardada para o diálogo não perder o texto ao sair. */
export function answer(confirmed: boolean) {
  question?.resolve(confirmed)
  open = false
  emit()
}

/** Faz a pergunta. Uma nova substitui a que estiver aberta, que responde `false`. */
export function ask(options: ConfirmOptions): Promise<boolean> {
  question?.resolve(false)

  return new Promise<boolean>((resolve) => {
    question = { options, resolve }
    open = true
    emit()
  })
}
