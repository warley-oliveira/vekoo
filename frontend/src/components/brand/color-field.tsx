import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Input } from "@/components/ui/input"
import { HEX_RE, normalizeHex } from "@/lib/brand-core"
import { cn } from "@/lib/utils"

type ColorFieldProps = {
  value: string
  onChange: (hex: string) => void
  invalid?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
  id?: string
}

/**
 * Amostra + seletor nativo + hex digitável. O seletor do navegador é o
 * melhor color picker que existe em cada aparelho — não vale a pena
 * reinventar; o que vale é o hex sempre visível e editável.
 */
export function ColorField({
  value,
  onChange,
  invalid,
  disabled,
  className,
  id,
  ...aria
}: ColorFieldProps) {
  const { t } = useTranslation()
  const pickerId = useId()
  const valid = HEX_RE.test(value)

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label
        htmlFor={pickerId}
        className={cn(
          "relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-input shadow-xs transition-shadow focus-within:ring-3 focus-within:ring-ring/50",
          !valid && "bg-[repeating-linear-gradient(45deg,var(--muted)_0_6px,transparent_6px_12px)]",
          disabled && "cursor-not-allowed opacity-50"
        )}
        style={valid ? { backgroundColor: value } : undefined}
        title={t("brand.colors.pickColor")}
      >
        <input
          id={pickerId}
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={t("brand.colors.pickColor")}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(normalizeHex(e.target.value))}
        spellCheck={false}
        inputMode="text"
        maxLength={7}
        placeholder="#7c3aed"
        aria-invalid={invalid}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        className="w-28 font-mono uppercase"
      />
    </div>
  )
}
