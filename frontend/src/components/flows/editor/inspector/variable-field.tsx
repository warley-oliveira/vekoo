import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Braces } from "lucide-react"

import { Textarea } from "@/components/ui/textarea"
import { useCustomFields } from "@/hooks/chat/use-chat-refs"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { collectVariables, INTERPOLATION, type VariableOption } from "@/lib/flows/variables"

import { useEditorApi } from "../store"

// O texto com variáveis. Quem sabe o nome digita `{{`; quem não sabe clica em "Variável" e escolhe pelo
// nome de gente. As variáveis ficam realçadas no próprio texto: o realce é um espelho atrás de um
// campo transparente, que mantém o `<textarea>` de verdade, com teclado virtual, seleção e corretor.

const OPENING = /\{\{\s*([\w.-]*)$/

type Suggestion = { query: string; start: number }

function highlighted(value: string): ReactNode[] {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const match of value.matchAll(INTERPOLATION)) {
    const index = match.index ?? 0
    parts.push(value.slice(cursor, index))
    parts.push(<mark key={index}>{match[0]}</mark>)
    cursor = index + match[0].length
  }
  parts.push(value.slice(cursor))
  // Com uma quebra no fim, o espelho precisa de mais uma linha, como o campo.
  parts.push("​")
  return parts
}

export type VariableFieldProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  /** Enter não quebra a linha. */
  singleLine?: boolean
  mono?: boolean
  disabled?: boolean
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

export function VariableField({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
  singleLine,
  mono,
  disabled,
  ...aria
}: VariableFieldProps) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const { customFields } = useCustomFields()
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)

  // A lista sai na hora de abrir, e não a cada tecla do bloco.
  const [variables, setVariables] = useState<VariableOption[]>([])
  const loadVariables = () => {
    const { nodes, fields } = api.getState()
    setVariables(
      collectVariables(
        {
          nodes,
          fields,
          customFields: customFields.map((field) => ({ key: field.key, label: field.name })),
        },
        t
      )
    )
  }

  const matches = useMemo(() => {
    if (!suggestion) return []
    const needle = normalizeSearchText(suggestion.query)
    return variables.filter((variable) =>
      !needle || normalizeSearchText(`${variable.label} ${variable.path}`).includes(needle)
    )
  }, [suggestion, variables])

  const syncSuggestion = (text: string, caret: number) => {
    const opening = OPENING.exec(text.slice(0, caret))
    if (!opening) {
      setSuggestion(null)
      return
    }
    if (!suggestion) loadVariables()
    setSuggestion({ query: opening[1], start: opening.index })
    setActive(0)
    setRect(textareaRef.current?.getBoundingClientRect() ?? null)
  }

  const insert = (variable: VariableOption) => {
    const element = textareaRef.current
    if (!element || !suggestion) return
    const caret = element.selectionStart
    const token = `{{${variable.path}}}`
    onChange(value.slice(0, suggestion.start) + token + value.slice(caret))
    pendingCaret.current = suggestion.start + token.length
    setSuggestion(null)
  }

  // O botão escreve `{{` onde está o cursor, e a lista abre como se a pessoa tivesse digitado.
  const openFromButton = () => {
    const element = textareaRef.current
    if (!element) return
    const caret = element.selectionStart ?? value.length
    onChange(`${value.slice(0, caret)}{{${value.slice(caret)}`)
    pendingCaret.current = caret + 2
    loadVariables()
    setSuggestion({ query: "", start: caret })
    setActive(0)
    setRect(element.getBoundingClientRect())
  }

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !textareaRef.current) return
    textareaRef.current.focus()
    textareaRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  })

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestion && matches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActive((current) => (current + 1) % matches.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActive((current) => (current - 1 + matches.length) % matches.length)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        insert(matches[active])
        return
      }
    }
    if (event.key === "Escape" && suggestion) {
      event.stopPropagation()
      setSuggestion(null)
      return
    }
    if (singleLine && event.key === "Enter") event.preventDefault()
  }

  const listId = id ? `${id}-variables` : undefined
  const open = Boolean(suggestion && matches.length > 0 && rect)
  const typography = cn("px-2.5 py-2 text-base md:text-sm", mono && "font-mono md:text-[13px]")

  return (
    <div className="group/variable relative">
      <div className="grid">
        <div aria-hidden className={cn("flow-var-mirror col-start-1 row-start-1 border border-transparent", typography)}>
          {highlighted(value)}
        </div>
        <Textarea
          {...aria}
          ref={textareaRef}
          id={id}
          value={value}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onChange(event.target.value)
            syncSuggestion(event.target.value, event.target.selectionStart)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setSuggestion(null), 120)}
          className={cn("relative col-start-1 row-start-1 min-h-0 resize-none pr-8", typography, singleLine && "whitespace-pre-wrap")}
          style={{ minHeight: `calc(${rows}lh + 1rem + 2px)` }}
        />
      </div>

      {!disabled ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("flows.variables.insert")}
          title={t("flows.variables.insert")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openFromButton}
          className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Braces className="size-3.5" aria-hidden />
        </button>
      ) : null}

      {open && rect
        ? createPortal(
            <VariableList
              id={listId}
              rect={rect}
              matches={matches}
              active={active}
              onHover={setActive}
              onPick={insert}
            />,
            document.body
          )
        : null}
    </div>
  )
}

function VariableList({
  id,
  rect,
  matches,
  active,
  onHover,
  onPick,
}: {
  id?: string
  rect: DOMRect
  matches: VariableOption[]
  active: number
  onHover: (index: number) => void
  onPick: (variable: VariableOption) => void
}) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLUListElement>(null)
  const below = window.innerHeight - rect.bottom > 240
  let lastGroup: string | null = null

  useLayoutEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={t("flows.variables.title")}
      className="fixed z-[60] max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
      style={{
        left: rect.left,
        width: rect.width,
        ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
      }}
    >
      {matches.map((variable, index) => {
        const heading = variable.group !== lastGroup
        lastGroup = variable.group
        return (
          <li
            key={variable.path}
            id={id ? `${id}-${index}` : undefined}
            data-index={index}
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(variable)
            }}
          >
            {heading ? (
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {t(`flows.variables.groups.${variable.group}`)}
              </p>
            ) : null}
            <div className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5", index === active && "bg-muted")}>
              <span className="truncate text-sm">{variable.label}</span>
              <span className="shrink-0 truncate font-mono text-[11px] text-muted-foreground">{variable.path}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
