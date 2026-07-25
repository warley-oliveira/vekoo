import { useId, useState, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// Camada de composição dos formulários: rótulo, campo, dica e erro sempre no
// mesmo lugar, com aria-invalid e aria-describedby ligados sem ninguém ter que
// lembrar. Qualquer formulário novo do app usa isto — não HTML solto.

type FieldProps = {
  label: string
  /** Texto de apoio abaixo do campo; escondido quando há erro. */
  hint?: ReactNode
  error?: string
  /** Link ou ação alinhada à direita do rótulo (ex.: "Esqueci a senha"). */
  action?: ReactNode
  className?: string
  children: (props: {
    id: string
    "aria-invalid": boolean
    "aria-describedby": string | undefined
  }) => ReactNode
}

export function Field({
  label,
  hint,
  error,
  action,
  className,
  children,
}: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const hasMessage = Boolean(error || hint)

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": hasMessage ? messageId : undefined,
      })}
      {hasMessage && (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn(
            "text-xs leading-snug",
            error ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

/** Campo de senha com alternância de visibilidade (o padrão de todo SaaS). */
export function PasswordInput({ className, ...props }: ComponentProps<"input">) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={
          visible ? t("auth.fields.hidePassword") : t("auth.fields.showPassword")
        }
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
