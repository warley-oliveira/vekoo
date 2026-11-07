import { useMemo, useState, type Ref } from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { useTranslation } from "react-i18next"
import { ChevronDown, Loader2, Plus, X } from "lucide-react"

import type { FieldControlProps } from "@/components/shared"
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
import { useLanguage } from "@/lib/i18n"
import { normalizeSearchText } from "@/lib/search-text"

type Option = { value: string; label: string; create?: boolean }

type CreatableSelectProps = Partial<FieldControlProps> & {
  options: readonly string[]
  value: string | null | undefined
  onChange: (value: string | null) => void
  onBlur?: () => void
  /** Cadastra a opção nova na definição do campo. Sem isto, é um seletor comum. */
  onCreate?: (option: string) => Promise<unknown>
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
}

/**
 * Campo de lista em que a pessoa escolhe ou cadastra a opção ali mesmo, sem sair do item:
 * `SearchableSelect` com a saída "Criar". Digitar o que já existe com outra caixa ou
 * acento escolhe a existente, em vez de duplicar.
 */
export function CreatableSelect({
  options,
  value,
  onChange,
  onBlur,
  onCreate,
  placeholder,
  inputRef,
  id,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: CreatableSelectProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)

  const items = useMemo<Option[]>(() => {
    const base = options.map((option) => ({ value: option, label: option }))
    const typed = query.trim()
    if (!onCreate || !typed) return base

    const key = normalizeSearchText(typed)
    const exists = options.some((option) => normalizeSearchText(option) === key)
    return exists ? base : [...base, { value: typed, label: typed, create: true }]
  }, [onCreate, options, query])

  // Memorizado: um objeto novo a cada render faria o Combobox reescrever o texto a cada tecla.
  const selected = useMemo(() => (value ? { value, label: value } : null), [value])
  const busy = disabled || creating

  async function choose(next: Option | null) {
    if (!next?.create || !onCreate) {
      onChange(next?.value ?? null)
      return
    }
    setCreating(true)
    try {
      await onCreate(next.value)
      onChange(next.value)
    } catch {
      // Quem cadastra avisa o erro; aqui só não escolhe o que não existe.
    } finally {
      setCreating(false)
    }
  }

  return (
    <Combobox<Option>
      items={items}
      value={selected}
      locale={language}
      disabled={busy}
      isItemEqualToValue={(item, current) => item.value === current.value}
      onValueChange={(next) => void choose(next)}
      onInputValueChange={(next, { reason }) => {
        if (reason === "input-change") setQuery(next)
      }}
      onOpenChange={(open) => {
        if (!open) {
          setQuery("")
          onBlur?.()
        }
      }}
    >
      <InputGroup className="w-full">
        <ComboboxPrimitive.Input
          id={id}
          ref={inputRef}
          placeholder={placeholder ?? t("kit.form.searchPlaceholder")}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          render={<InputGroupInput disabled={busy} />}
        />
        <InputGroupAddon align="inline-end">
          {creating ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" />
          ) : selected ? (
            <ComboboxPrimitive.Clear
              aria-label={t("kit.form.clearSelection")}
              render={<InputGroupButton size="icon-xs" disabled={busy} />}
            >
              <X className="pointer-events-none" />
            </ComboboxPrimitive.Clear>
          ) : (
            <ComboboxPrimitive.Trigger
              aria-label={t("kit.form.openOptions")}
              render={<InputGroupButton size="icon-xs" disabled={busy} />}
            >
              <ChevronDown className="pointer-events-none text-muted-foreground" />
            </ComboboxPrimitive.Trigger>
          )}
        </InputGroupAddon>
      </InputGroup>

      <ComboboxContent>
        <ComboboxEmpty>{t("kit.form.noOptions")}</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={`${option.create ? "new" : "known"}-${option.value}`} value={option}>
              {option.create ? (
                <>
                  <Plus aria-hidden className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("kit.creatable.create", { value: option.label })}
                  </span>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
