import { useState, type Ref } from "react"
import { HexColorPicker } from "react-colorful"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { COLOR_SWATCHES, getReadableTextColor, isHexColor } from "@/lib/tag-color"
import { cn } from "@/lib/utils"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"
import { ResponsivePopover } from "./responsive-popover"

function normalizeHex(value: string) {
  const hex = value.trim().replace("#", "").toLowerCase()
  return `#${hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex}`
}

export type ColorPickerProps = Partial<FieldControlProps> & {
  /** Hex: "#7c3aed". */
  value: string | null | undefined
  onChange: (value: string) => void
  onBlur?: () => void
  /** Título do painel no celular. */
  label?: string
  placeholder?: string
  swatches?: readonly string[]
  triggerRef?: Ref<HTMLButtonElement>
  className?: string
}

/** Escolher uma cor: amostras prontas, seletor livre e hex para quem tem o código da marca. */
export function ColorPicker({
  value,
  onChange,
  onBlur,
  label,
  placeholder,
  swatches = COLOR_SWATCHES,
  triggerRef,
  className,
  ...aria
}: ColorPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // O campo de texto aceita hex incompleto enquanto a pessoa digita.
  const [draft, setDraft] = useState<string | null>(null)

  const hasColor = Boolean(value && isHexColor(value))
  const color = hasColor ? normalizeHex(value!) : swatches[0]

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setDraft(null)
        if (!next) onBlur?.()
      }}
      title={label ?? t("kit.color.pick")}
      className="w-64 gap-3 p-3"
      trigger={
        <Button
          {...aria}
          ref={triggerRef}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start px-2.5 font-normal pointer-coarse:h-10",
            !hasColor && "text-muted-foreground",
            className
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-4 shrink-0 rounded-sm ring-1 ring-foreground/10",
              !hasColor && "bg-muted"
            )}
            style={hasColor ? { backgroundColor: color } : undefined}
          />
          <span className="truncate tabular-nums">
            {hasColor ? color : (placeholder ?? t("kit.color.pick"))}
          </span>
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <HexColorPicker
          color={color}
          onChange={(next) => {
            setDraft(null)
            onChange(next)
          }}
          style={{ width: "100%", height: "9rem" }}
        />
        <div role="group" aria-label={t("kit.color.swatches")} className="grid grid-cols-5 gap-1.5">
          {swatches.map((swatch) => {
            const selected = hasColor && normalizeHex(swatch) === color
            return (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={selected}
                style={{ backgroundColor: swatch, color: getReadableTextColor(swatch) }}
                className="flex h-8 items-center justify-center rounded-md ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-10"
                onClick={() => {
                  setDraft(null)
                  onChange(normalizeHex(swatch))
                }}
              >
                {selected ? <Check aria-hidden className="size-3.5" /> : null}
              </button>
            )
          })}
        </div>
        <Input
          aria-label={t("kit.color.hex")}
          value={draft ?? (hasColor ? color : "")}
          placeholder={String(swatches[0])}
          spellCheck={false}
          autoComplete="off"
          className="tabular-nums"
          // Quase sempre se cola um código inteiro no lugar do atual.
          onFocus={(event) => event.target.select()}
          // Código pela metade não fica na tela contradizendo a cor escolhida.
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            const text = event.target.value
            setDraft(text)
            if (isHexColor(text)) onChange(normalizeHex(text))
          }}
        />
      </div>
    </ResponsivePopover>
  )
}

export type ColorFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<ColorPickerProps, "placeholder" | "swatches">

/** `ColorPicker` em formulário: cor de etiqueta, pasta, marca. */
export function ColorField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({ placeholder, swatches, ...fieldProps }: ColorFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <ColorPicker
          {...controlProps}
          triggerRef={field.ref}
          label={fieldProps.label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          swatches={swatches}
        />
      )}
    </FormField>
  )
}
