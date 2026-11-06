import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"

export type ConfirmOptions = {
  title: ReactNode
  description?: ReactNode
  /** Verbo da ação, nunca "OK": "Excluir contato". */
  confirmLabel?: string
  cancelLabel?: string
  /** Pinta o botão de vermelho e começa com o foco em cancelar. */
  destructive?: boolean
  /** Texto que a pessoa precisa digitar para liberar o botão, em ações irreversíveis. */
  requireText?: string
  /**
   * O trabalho em si. O diálogo espera e mostra "carregando"; se rejeitar, continua
   * aberto com a mensagem do erro, para a pessoa poder tentar de novo.
   */
  onConfirm?: () => void | Promise<unknown>
}

export type ConfirmDialogProps = ConfirmOptions & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Avisa que a pessoa confirmou, depois de `onConfirm` terminar. */
  onConfirmed?: () => void
}

/**
 * Confirmação de ação destrutiva, na forma declarativa. Na maior parte dos casos
 * `useConfirm()` é mais curto. Use este quando a tela já controla o estado aberto.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirmed,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  requireText,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cada abertura começa do zero: não sobra o texto nem o erro da vez anterior.
  useEffect(() => {
    if (open) {
      setTyped("")
      setBusy(false)
      setError(null)
    }
  }, [open])

  const locked = requireText !== undefined && typed.trim() !== requireText

  async function confirm() {
    if (busy || locked) return

    setBusy(true)
    setError(null)
    try {
      await onConfirm?.()
      onConfirmed?.()
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.serverMessage
          ? cause.serverMessage
          : t("kit.confirm.failed")
      )
    } finally {
      setBusy(false)
    }
  }

  // Em ação destrutiva o foco nasce no caminho seguro, para um Enter distraído não
  // apagar nada. Com texto a digitar, nasce no campo.
  const initialFocus = requireText !== undefined ? inputRef : destructive ? cancelRef : undefined

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <AlertDialogContent
        initialFocus={initialFocus}
        // Vindo de `useConfirm`, o diálogo está fora da árvore React de um painel aberto
        // embaixo dele, e o Esc que chega ao `document` fecharia os dois. Quem responde
        // é só este diálogo, e nunca com a operação em andamento.
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            if (!busy) onOpenChange(false)
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {requireText !== undefined ? (
          <form
            className="space-y-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            <Label htmlFor={inputId} className="block font-normal text-muted-foreground">
              {t("kit.confirm.typeToConfirm", { text: requireText })}
            </Label>
            <Input
              id={inputId}
              ref={inputRef}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
          </form>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel
            ref={cancelRef}
            disabled={busy}
            className="pointer-coarse:h-10"
          >
            {cancelLabel ?? t("kit.actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy || locked}
            aria-busy={busy}
            className="pointer-coarse:h-10"
            onClick={() => void confirm()}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel ?? t("kit.actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
