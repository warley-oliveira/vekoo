import { useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { ResponsiveDialog } from "@/components/shared"
import { ShellContext, useShell, type ShellContextValue, type StepHeader } from "./connect-step"

// A moldura da conexão. O título, o rodapé e o bloqueio de fechar pertencem ao passo que
// está na tela, mas o diálogo é um só: trocar de passo não pode fechar e abrir de novo.
// Por isso cada passo declara o que quer (`useConnectStep`), em vez de montar o próprio
// diálogo.

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
  const dismiss = useRef<(() => void) | null>(null)

  const value = useMemo<ShellContextValue>(
    () => ({
      setHeader,
      setBusy: (next) => {
        busy.current = next
      },
      setDismiss: (handler) => {
        dismiss.current = handler
      },
      footerElement,
      close: () => {
        dismiss.current?.()
        onClose()
      },
    }),
    [footerElement, onClose]
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy.current) value.close()
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
