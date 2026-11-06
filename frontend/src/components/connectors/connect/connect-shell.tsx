import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { ResponsiveDialog } from "@/components/shared"

// A moldura da conexão. O título, o rodapé e o bloqueio de fechar pertencem ao passo que
// está na tela, mas o diálogo é um só: trocar de passo não pode fechar e abrir de novo.
// Por isso cada passo declara o que quer, em vez de montar o próprio diálogo.

type ShellContextValue = {
  setHeader: (header: StepHeader) => void
  setBusy: (busy: boolean) => void
  footerElement: HTMLElement | null
  close: () => void
}

type StepHeader = {
  title: string
  description?: string
}

const ShellContext = createContext<ShellContextValue | null>(null)

function useShell() {
  const context = useContext(ShellContext)
  if (!context) throw new Error("useConnectStep precisa de ConnectShell")
  return context
}

/**
 * O passo diz qual é o título e se está ocupado. Enquanto há um pedido no ar ou a janela
 * da Meta aberta, fechar perderia o que já foi feito.
 */
export function useConnectStep(header: StepHeader, { busy = false }: { busy?: boolean } = {}) {
  const { setHeader, setBusy, close } = useShell()
  const { title, description } = header

  useLayoutEffect(() => {
    setHeader({ title, description })
  }, [setHeader, title, description])

  useLayoutEffect(() => {
    setBusy(busy)
    return () => setBusy(false)
  }, [setBusy, busy])

  return { close }
}

/** Os botões do passo, no rodapé fixo do diálogo. */
export function ConnectFooter({ children }: { children: ReactNode }) {
  const { footerElement } = useShell()
  return footerElement ? createPortal(children, footerElement) : null
}

export type ConnectShellProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function ConnectShell({ open, onClose, children }: ConnectShellProps) {
  const { t } = useTranslation()
  const [header, setHeader] = useState<StepHeader>({ title: t("connectors.connect.title") })
  const [footerElement, setFooterElement] = useState<HTMLElement | null>(null)
  const busy = useRef(false)

  const value = useMemo<ShellContextValue>(
    () => ({
      setHeader,
      setBusy: (next) => {
        busy.current = next
      },
      footerElement,
      close: onClose,
    }),
    [footerElement, onClose]
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy.current) onClose()
      }}
      title={header.title}
      description={header.description}
      size="lg"
      // Um toque fora não pode perder o QR code que a pessoa estava lendo.
      disablePointerDismissal
      footer={<div ref={setFooterElement} className="contents" />}
    >
      <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
    </ResponsiveDialog>
  )
}
