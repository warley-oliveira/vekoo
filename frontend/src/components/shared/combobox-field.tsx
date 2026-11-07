import { useCallback, useMemo, useRef, useState, type Ref } from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ChevronDown, Loader2, X } from "lucide-react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { FormField, type FieldControlProps, type FormFieldBaseProps } from "./form-field"
import type { SelectOption } from "./select-field"

const SEARCH_DEBOUNCE = 250

export type LoadOptions = (query: string, signal: AbortSignal) => Promise<SelectOption[]>

export type SearchableSelectProps = Partial<FieldControlProps> & {
  /** Nome para leitor de tela, quando o rótulo não aparece. */
  "aria-label"?: string
  value: string | null | undefined
  onChange: (value: string | null, option: SelectOption | null) => void
  onBlur?: () => void
  /** Lista conhecida: filtra aqui, ignorando acento e caixa. */
  options?: SelectOption[]
  /** Busca no servidor, com atraso e cancelamento da busca anterior. */
  loadOptions?: LoadOptions
  /** Opção do valor atual, para mostrar o rótulo antes de qualquer busca. */
  selectedOption?: SelectOption | null
  placeholder?: string
  emptyLabel?: string
  /** Mostra o X para esvaziar. */
  clearable?: boolean
  inputRef?: Ref<HTMLInputElement>
  className?: string
}

/** Escolher uma entre muitas opções, digitando. Lista fixa ou busca assíncrona. */
export function SearchableSelect({
  value,
  onChange,
  onBlur,
  options,
  loadOptions,
  selectedOption,
  placeholder,
  emptyLabel,
  clearable = false,
  inputRef,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SearchableSelectProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isAsync = Boolean(loadOptions)

  const [results, setResults] = useState<SelectOption[]>([])
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  // O rótulo do escolhido sobrevive à próxima busca, que não precisa trazê-lo de novo.
  const [picked, setPicked] = useState<SelectOption | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  const search = useCallback(
    async (query: string) => {
      if (!loadOptions) return

      inFlight.current?.abort()
      const controller = new AbortController()
      inFlight.current = controller

      setSearching(true)
      setFailed(false)
      try {
        const found = await loadOptions(query, controller.signal)
        if (!controller.signal.aborted) setResults(found)
      } catch {
        if (!controller.signal.aborted) {
          setResults([])
          setFailed(true)
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    },
    [loadOptions]
  )
  const debouncedSearch = useDebouncedCallback(search, SEARCH_DEBOUNCE)

  const selected = useMemo(() => {
    if (value === null || value === undefined || value === "") return null
    return (
      options?.find((option) => option.value === value) ??
      (selectedOption?.value === value ? selectedOption : null) ??
      (picked?.value === value ? picked : null) ??
      results.find((option) => option.value === value) ??
      null
    )
  }, [options, picked, results, selectedOption, value])

  const items = useMemo(() => {
    if (!isAsync) return options ?? []
    return selected && !results.some((option) => option.value === selected.value)
      ? [...results, selected]
      : results
  }, [isAsync, options, results, selected])

  const emptyMessage = failed
    ? t("kit.form.searchFailed")
    : (emptyLabel ?? t("kit.form.noOptions"))

  return (
    <Combobox<SelectOption>
      items={items}
      value={selected}
      locale={language}
      disabled={disabled}
      filter={isAsync ? null : undefined}
      isItemEqualToValue={(item, current) => item.value === current.value}
      onValueChange={(next) => {
        setPicked(next)
        onChange(next?.value ?? null, next)
      }}
      onInputValueChange={(query, { reason }) => {
        // Preencher o campo com o escolhido não é uma busca.
        if (isAsync && reason === "input-change") {
          setSearching(true)
          debouncedSearch(query)
        }
      }}
      onOpenChange={(open) => {
        if (open && isAsync && results.length === 0) void search("")
        if (!open) onBlur?.()
      }}
    >
      <InputGroup className={cn("w-full", className)}>
        <ComboboxPrimitive.Input
          id={id}
          ref={inputRef}
          placeholder={placeholder ?? t("kit.form.searchPlaceholder")}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          render={<InputGroupInput disabled={disabled} />}
        />
        <InputGroupAddon align="inline-end">
          {searching ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" />
          ) : null}
          {clearable && selected ? (
            <ComboboxPrimitive.Clear
              aria-label={t("kit.form.clearSelection")}
              render={<InputGroupButton size="icon-xs" disabled={disabled} />}
            >
              <X className="pointer-events-none" />
            </ComboboxPrimitive.Clear>
          ) : (
            <ComboboxPrimitive.Trigger
              aria-label={t("kit.form.openOptions")}
              render={<InputGroupButton size="icon-xs" disabled={disabled} />}
            >
              <ChevronDown className="pointer-events-none text-muted-foreground" />
            </ComboboxPrimitive.Trigger>
          )}
        </InputGroupAddon>
      </InputGroup>

      <ComboboxContent aria-busy={searching || undefined}>
        <ComboboxEmpty className={cn(failed && "text-destructive")}>
          {searching && items.length === 0 ? t("kit.form.searching") : emptyMessage}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: SelectOption) => (
            <ComboboxItem key={option.value} value={option} disabled={option.disabled}>
              {option.icon}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.description ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export type ComboboxFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = FormFieldBaseProps<TValues, TName> &
  Pick<
    SearchableSelectProps,
    "options" | "loadOptions" | "selectedOption" | "placeholder" | "emptyLabel" | "clearable"
  >

/** `SearchableSelect` em formulário: contato, responsável, produto. */
export function ComboboxField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  options,
  loadOptions,
  selectedOption,
  placeholder,
  emptyLabel,
  clearable,
  ...fieldProps
}: ComboboxFieldProps<TValues, TName>) {
  return (
    <FormField {...fieldProps}>
      {({ field, controlProps }) => (
        <SearchableSelect
          {...controlProps}
          inputRef={field.ref}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          options={options}
          loadOptions={loadOptions}
          selectedOption={selectedOption}
          placeholder={placeholder}
          emptyLabel={emptyLabel}
          clearable={clearable}
        />
      )}
    </FormField>
  )
}
