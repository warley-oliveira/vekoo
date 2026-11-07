import { useState, type ClipboardEvent, type KeyboardEvent, type Ref } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  FormField,
  TagChip,
  type FieldControlProps,
  type FormFieldBaseProps,
} from "@/components/shared"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"

const SEPARATORS = /[,;\n]/

type ChipsInputProps = Partial<FieldControlProps> & {
  /** Nome para leitor de tela, quando o rótulo não aparece. */
  "aria-label"?: string
  value: string[] | null | undefined
  onChange: (value: string[]) => void
  onBlur?: () => void
  placeholder?: string
  /** Teto da lista: as tags têm 50 na API. */
  max?: number
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/**
 * Lista livre de textos: tags de um item, opções de um campo. Enter ou vírgula confirma,
 * Backspace tira a última, e colar uma lista separada por vírgula vira vários de uma vez.
 */
export function ChipsInput({
  value,
  onChange,
  onBlur,
  placeholder,
  max,
  inputRef,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: ChipsInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const chips = value ?? []

  function add(raw: string) {
    const known = new Set(chips.map(normalizeSearchText))
    const added: string[] = []
    raw
      .split(SEPARATORS)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const key = normalizeSearchText(part)
        if (!known.has(key)) {
          known.add(key)
          added.push(part)
        }
      })
    if (added.length > 0) {
      const next = [...chips, ...added]
      onChange(max ? next.slice(0, max) : next)
    }
    setText("")
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter aqui confirma o texto, e não envia o formulário em volta.
      event.preventDefault()
      add(text)
    } else if (event.key === "Backspace" && !text && chips.length > 0) {
      onChange(chips.slice(0, -1))
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text")
    if (SEPARATORS.test(pasted)) {
      event.preventDefault()
      add(`${text}${pasted}`)
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 pointer-coarse:min-h-10",
        disabled && "cursor-not-allowed bg-input/50 opacity-50",
        className
      )}
    >
      {chips.map((chip) => (
        <TagChip
          key={chip}
          onRemove={disabled ? undefined : () => onChange(chips.filter((item) => item !== chip))}
          removeLabel={t("kit.chips.remove", { name: chip })}
        >
          {chip}
        </TagChip>
      ))}
      <input
        id={id}
        ref={inputRef}
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        enterKeyHint="done"
        autoCapitalize="off"
        placeholder={chips.length === 0 ? placeholder : undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          add(text)
          onBlur?.()
        }}
        className="min-w-20 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
      />
    </div>
  )
}

type ChipsFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> & Pick<ChipsInputProps, "placeholder" | "max">

export function ChipsField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  placeholder,
  max,
  ...fieldProps
}: ChipsFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <ChipsInput
          {...controlProps}
          inputRef={field.ref}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          max={max}
        />
      )}
    </FormField>
  )
}
