import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"

import { ColorPicker } from "@/components/shared"
import { CATEGORICAL_COLORS, isToken, resolveColor, TONE_COLORS } from "@/lib/custom-dashboards/palette"
import { cn } from "@/lib/utils"

/** Um assunto do editor: título pequeno, explicação quando precisa, e os campos. */
export function EditorSection({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-[0.95rem] font-semibold">{title}</h3>
            {hint ? <p className="text-xs text-pretty text-muted-foreground">{hint}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

type ColorChoiceProps = {
  value: string | null | undefined
  onChange: (value: string | null) => void
  label: string
  /** Faixas: as cores que querem dizer alguma coisa, em vez da paleta. */
  palette?: "categorical" | "tones"
  /** Oferece voltar à cor automática. */
  allowAuto?: boolean
  className?: string
}

/** As cores do produto, e uma saída para a cor da marca. O que fica guardado é a chave, não o valor. */
export function ColorChoice({ value, onChange, label, palette = "categorical", allowAuto = true, className }: ColorChoiceProps) {
  const { t } = useTranslation()
  const colors = palette === "tones" ? TONE_COLORS : CATEGORICAL_COLORS
  const custom = value && !isToken(value) ? value : null

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {allowAuto ? (
        <button
          type="button"
          aria-pressed={!value}
          onClick={() => onChange(null)}
          className={cn(
            "inline-flex h-7 items-center rounded-md border px-2 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10",
            !value ? "border-foreground font-medium" : "text-muted-foreground"
          )}
        >
          {t("customDashboards.editor.autoColor")}
        </button>
      ) : null}
      {colors.map((color) => {
        const selected = value === color
        return (
          <button
            key={color}
            type="button"
            aria-pressed={selected}
            aria-label={t(`customDashboards.colors.${color}`)}
            title={t(`customDashboards.colors.${color}`)}
            onClick={() => onChange(color)}
            style={{ backgroundColor: resolveColor(color) }}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-white outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-10",
              selected && "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
            )}
          >
            {selected ? <Check aria-hidden className="size-3.5" /> : null}
          </button>
        )
      })}
      {palette === "categorical" ? (
        <ColorPicker
          value={custom}
          onChange={onChange}
          label={t("customDashboards.editor.customColor")}
          placeholder={t("customDashboards.editor.customColor")}
          className="h-7 w-auto gap-1.5 px-2 text-xs pointer-coarse:h-10 [&>span:first-child]:size-3.5"
        />
      ) : null}
    </div>
  )
}
