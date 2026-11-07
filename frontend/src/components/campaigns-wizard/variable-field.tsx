import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"
import { Braces } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { BUILT_IN_VARIABLES, asToken, offeredVariables } from "@/lib/campaigns-wizard/variables"
import type { RecipientVariable } from "@/lib/campaigns-wizard/types"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"

// Campo de texto que entende variável. Digitar `/` ou abrir chaves mostra o menu, e as setas, Enter, Tab
// e Esc funcionam como na origem. Para quem está no dedo, os botões logo abaixo inserem onde está o
// cursor, em vez de jogar no fim do texto.

type Option = { name: string; label: string }

type Trigger = { query: string; start: number; end: number }

const SLASH_TRIGGER = /(?:^|[\s([])(\/[\p{L}\d_]*)$/u
const BRACE_TRIGGER = /(\{\{?[\p{L}\d_]*)$/u

function triggerAt(value: string, cursor: number | null): Trigger | null {
  if (cursor === null) return null

  const before = value.slice(0, cursor)
  const slash = SLASH_TRIGGER.exec(before)?.[1]
  const brace = BRACE_TRIGGER.exec(before)?.[1]
  const command = brace && (!slash || brace.length >= slash.length) ? brace : slash
  if (!command) return null

  return {
    query: normalizeSearchText(command.replace(/^[/{]+/, "")),
    start: cursor - command.length,
    end: cursor,
  }
}

export type VariableFieldProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  variables: RecipientVariable[]
  placeholder?: string
  multiline?: boolean
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  inputRef?: Ref<HTMLTextAreaElement & HTMLInputElement>
  /** Esconde os botões de variável, quando o campo é parte de uma lista compacta. */
  hideShortcuts?: boolean
  className?: string
}

export function VariableField({
  id,
  value,
  onChange,
  onBlur,
  variables,
  placeholder,
  multiline = false,
  hideShortcuts = false,
  inputRef,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: VariableFieldProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const menuId = useId()
  const fieldRef = useRef<(HTMLTextAreaElement & HTMLInputElement) | null>(null)
  const cursorRef = useRef<number | null>(null)
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [active, setActive] = useState(0)

  // No mesmo quadro em que o texto novo entra: o React põe o cursor no fim ao trocar o valor, e a próxima
  // tecla não pode cair lá.
  useLayoutEffect(() => {
    if (cursorRef.current === null) return

    const field = fieldRef.current
    field?.focus()
    field?.setSelectionRange(cursorRef.current, cursorRef.current)
    cursorRef.current = null
  }, [value])

  const options = useMemo<Option[]>(() => {
    const builtIn = BUILT_IN_VARIABLES.map((name) => ({
      name,
      label: t(`campaignsWizard.variables.${name}`),
    }))
    return [
      ...builtIn,
      ...offeredVariables(variables).map(({ name }) => ({
        name,
        // O que veio de uma busca tem nome em inglês; o que veio de uma planilha já é o nome da coluna.
        label: t(`campaignsWizard.variables.known.${name}`, { defaultValue: name.replace(/_/g, " ") }),
      })),
    ]
  }, [t, variables])

  const visible = useMemo(() => {
    if (!trigger) return []
    return options.filter(
      (option) =>
        !trigger.query ||
        normalizeSearchText(option.name).startsWith(trigger.query) ||
        normalizeSearchText(option.label).startsWith(trigger.query)
    )
  }, [options, trigger])

  const open = visible.length > 0
  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0))

  const sync = useCallback((text: string, cursor: number | null) => {
    setTrigger(triggerAt(text, cursor))
    setActive(0)
  }, [])

  /** Troca o intervalo pelo marcador e devolve o cursor para logo depois dele. */
  const insert = useCallback(
    (name: string, range?: { start: number; end: number }) => {
      const field = fieldRef.current
      const start = range?.start ?? field?.selectionStart ?? value.length
      const end = range?.end ?? field?.selectionEnd ?? value.length
      const token = asToken(name)
      const needsSpace = !range && start > 0 && !/\s/.test(value[start - 1])
      const inserted = `${needsSpace ? " " : ""}${token}`

      cursorRef.current = start + inserted.length
      onChange(`${value.slice(0, start)}${inserted}${value.slice(end)}`)
      setTrigger(null)
    },
    [onChange, value]
  )

  function handleChange(event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    onChange(event.target.value)
    sync(event.target.value, event.target.selectionStart)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (!open || !trigger) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((activeIndex + 1) % visible.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((activeIndex - 1 + visible.length) % visible.length)
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      insert(visible[activeIndex].name, trigger)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setTrigger(null)
    }
  }

  const setRefs = useCallback(
    (node: (HTMLTextAreaElement & HTMLInputElement) | null) => {
      fieldRef.current = node
      if (typeof inputRef === "function") inputRef(node)
      else if (inputRef) (inputRef as { current: typeof node }).current = node
    },
    [inputRef]
  )

  const fieldProps = {
    id,
    value,
    placeholder,
    "aria-label": ariaLabel,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    "aria-autocomplete": "list" as const,
    "aria-controls": open ? menuId : undefined,
    "aria-activedescendant": open ? `${menuId}-${activeIndex}` : undefined,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onKeyUp: (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
        sync(event.currentTarget.value, event.currentTarget.selectionStart)
      }
    },
    onClick: (event: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) =>
      sync(event.currentTarget.value, event.currentTarget.selectionStart),
    onBlur: () => {
      // O clique numa opção não pode fechar o menu antes de valer: ela previne o foco.
      setTrigger(null)
      onBlur?.()
    },
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="relative">
        {multiline ? (
          <Textarea {...fieldProps} ref={setRefs} rows={4} className="min-h-24 resize-y" />
        ) : (
          <Input {...fieldProps} ref={setRefs} />
        )}

        {open ? (
          // Com o teclado do celular aberto, a metade de baixo não existe: o menu sobe.
          <ul
            id={menuId}
            role="listbox"
            aria-label={t("campaignsWizard.variables.menu")}
            className={cn(
              "absolute inset-x-0 z-20 max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md",
              isMobile ? "bottom-full mb-1" : "top-full mt-1"
            )}
          >
            {visible.map((option, index) => (
              <li
                key={option.name}
                id={`${menuId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onPointerDown={(event) => {
                  event.preventDefault()
                  insert(option.name, trigger ?? undefined)
                }}
                onPointerEnter={() => setActive(index)}
                className={cn(
                  "flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                  index === activeIndex && "bg-muted"
                )}
              >
                <span className="truncate">{option.label}</span>
                <code className="shrink-0 text-xs text-muted-foreground">{asToken(option.name)}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {hideShortcuts ? null : (
        <div className="flex flex-wrap items-center gap-1">
          <Braces aria-hidden className="mr-0.5 size-3.5 text-muted-foreground" />
          {options.slice(0, 8).map((option) => (
            <Button
              key={option.name}
              type="button"
              variant="outline"
              size="xs"
              className="font-normal pointer-coarse:h-8"
              // Sem isso o foco sairia do campo, e o cursor junto.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insert(option.name)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
