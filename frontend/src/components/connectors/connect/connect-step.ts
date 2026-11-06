import { createContext, useContext, useLayoutEffect } from "react"

export type StepHeader = {
  title: string
  description?: string
}

export type ShellContextValue = {
  setHeader: (header: StepHeader) => void
  setBusy: (busy: boolean) => void
  /** Roda ao fechar, por qualquer caminho: botão, X ou Esc. */
  setDismiss: (handler: (() => void) | null) => void
  footerElement: HTMLElement | null
  close: () => void
}

export const ShellContext = createContext<ShellContextValue | null>(null)

export function useShell() {
  const context = useContext(ShellContext)
  if (!context) throw new Error("useConnectStep precisa de ConnectShell")
  return context
}

/**
 * O passo diz qual é o título e se está ocupado. Enquanto há um pedido no ar ou a janela
 * da Meta aberta, fechar perderia o que já foi feito.
 */
export function useConnectStep(
  header: StepHeader,
  { busy = false, onDismiss }: { busy?: boolean; onDismiss?: () => void } = {}
) {
  const { setHeader, setBusy, setDismiss, close } = useShell()
  const { title, description } = header

  useLayoutEffect(() => {
    setHeader({ title, description })
  }, [setHeader, title, description])

  useLayoutEffect(() => {
    setBusy(busy)
    return () => setBusy(false)
  }, [setBusy, busy])

  useLayoutEffect(() => {
    setDismiss(onDismiss ?? null)
    return () => setDismiss(null)
  })

  return { close }
}
