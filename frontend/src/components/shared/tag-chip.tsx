import { useMemo, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getTagStyle } from "@/lib/tag-color"
import { cn } from "@/lib/utils"

export type TagChipProps = Omit<ComponentProps<"span">, "children" | "color"> & {
  children: ReactNode
  /** Cor escolhida pela pessoa, em hex. O contraste do texto é calculado. Sem cor, sai neutra. */
  color?: string | null
  variant?: "soft" | "solid"
  icon?: ReactNode
  /** Mostra o X. Passe também `removeLabel`, com o nome da etiqueta. */
  onRemove?: () => void
  removeLabel?: string
}

/** Etiqueta com a cor que a pessoa escolheu. Para estado do sistema, use `StatusBadge`. */
export function TagChip({
  children,
  color,
  variant = "soft",
  icon,
  onRemove,
  removeLabel,
  className,
  style,
  ...props
}: TagChipProps) {
  const { t } = useTranslation()
  const tagStyle = useMemo(
    () => (color ? getTagStyle(color, variant) : undefined),
    [color, variant]
  )

  return (
    <span
      data-slot="tag-chip"
      style={{ ...tagStyle, ...style }}
      className={cn(
        "inline-flex h-6 w-fit max-w-full items-center gap-1 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0",
        !color && "border-transparent bg-status-neutral-soft text-status-neutral",
        onRemove && "pr-0.5",
        className
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={removeLabel ?? t("kit.tag.remove")}
          className="size-5 rounded-sm text-current hover:bg-current/10 hover:text-current"
        >
          <X />
        </Button>
      ) : null}
    </span>
  )
}
