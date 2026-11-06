import { useEffect, useRef, useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const CONFIRMATION_MS = 1500

async function writeToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    // Sem permissão ou fora de HTTPS: o caminho antigo ainda funciona.
  }

  const area = document.createElement("textarea")
  area.value = value
  area.setAttribute("readonly", "")
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand("copy")
  document.body.removeChild(area)
  if (!copied) throw new Error("copy")
}

export type CopyButtonProps = Omit<
  ComponentProps<typeof Button>,
  "value" | "children" | "onClick"
> & {
  value: string
  /** Texto visível. Sem ele o botão é só o ícone. */
  label?: string
}

/** Copia um valor (link, token, telefone) e confirma ali mesmo, sem toast. */
export function CopyButton({
  value,
  label,
  variant = "ghost",
  size,
  className,
  ...props
}: CopyButtonProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await writeToClipboard(value)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), CONFIRMATION_MS)
    } catch {
      toast.error(t("kit.copy.failed"))
    }
  }

  const text = copied ? t("kit.copy.copied") : (label ?? t("kit.copy.copy"))
  const icon = copied ? <Check className="text-status-success" /> : <Copy />

  if (label) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={copy}
        {...props}
      >
        {icon}
        <span aria-live="polite">{text}</span>
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size ?? "icon-sm"}
            aria-label={text}
            className={cn("text-muted-foreground", className)}
            onClick={copy}
            {...props}
          />
        }
      >
        {icon}
        <span aria-live="polite" className="sr-only">
          {copied ? text : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
