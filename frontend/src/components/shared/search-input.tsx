import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Search, X } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { useDebouncedCallback } from "@/hooks/use-debounced-value"
import { useIsTouch } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

export type SearchInputProps = {
  value: string
  /** Chamado depois do atraso, ou na hora ao limpar. */
  onChange: (value: string) => void
  placeholder?: string
  /** Atraso em ms. Com filtro local, 0 responde a cada tecla. */
  debounce?: number
  /** Tecla que foca o campo de qualquer lugar da tela. `false` desliga. */
  shortcut?: string | false
  /** Mostra o giro enquanto a busca está no ar. */
  loading?: boolean
  autoFocus?: boolean
  "aria-label"?: string
  className?: string
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return Boolean(
    element?.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox']")
  )
}

/** Campo de busca de listas: atraso, limpar, Esc e o atalho "/". */
export function SearchInput({
  value,
  onChange,
  placeholder,
  debounce = 300,
  shortcut = "/",
  loading = false,
  autoFocus,
  "aria-label": ariaLabel,
  className,
}: SearchInputProps) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const input = useRef<HTMLInputElement>(null)

  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)

  // O que vem de fora (limpar filtros, trocar de aba) substitui o texto, mas só quando
  // é diferente do que este campo mesmo emitiu.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  const emit = useDebouncedCallback((next: string) => onChange(next), debounce)

  useEffect(() => {
    if (!shortcut) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === shortcut &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTyping(event.target)
      ) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [shortcut])

  function clear() {
    emit.cancel()
    setText("")
    onChange("")
  }

  const label = placeholder ?? t("kit.search.placeholder")

  return (
    <InputGroup className={cn("w-full", className)}>
      <InputGroupInput
        ref={input}
        role="searchbox"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={label}
        aria-label={ariaLabel ?? label}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (debounce > 0) emit(next)
          else onChange(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) {
            // Dentro de um painel, o primeiro Esc limpa o campo, não fecha o painel.
            event.stopPropagation()
            clear()
          }
          if (event.key === "Enter") {
            event.preventDefault()
            emit.flush()
          }
        }}
      />
      <InputGroupAddon align="inline-start">
        {loading ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <Search aria-hidden />
        )}
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        {text ? (
          <InputGroupButton
            size="icon-xs"
            aria-label={t("kit.search.clear")}
            onClick={() => {
              clear()
              input.current?.focus()
            }}
          >
            <X />
          </InputGroupButton>
        ) : shortcut && !focused && !isTouch ? (
          <Kbd aria-hidden>{shortcut}</Kbd>
        ) : null}
      </InputGroupAddon>
    </InputGroup>
  )
}
