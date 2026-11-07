import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { Control, FieldPath } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Braces } from "lucide-react"

import { FormField } from "@/components/shared"
import { Textarea } from "@/components/ui/textarea"
import { normalizeSearchText } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import type { ReceivedField } from "@/lib/webhooks/fields"
import type { WebhookFormValues } from "@/lib/webhooks/form"
import { LITERAL } from "@/lib/webhooks/literal"

import { useReceivedGroups } from "./fields-context"

// O texto com variáveis. Quem sabe o caminho digita `{{`; quem não sabe clica no botão e escolhe entre o que já chegou;
// e dá para arrastar um campo da lista ao lado, porque um `<textarea>` aceita soltar texto no cursor. As variáveis ficam
// realçadas no próprio texto, por um espelho atrás do campo, que continua sendo um `<textarea>` de verdade.

const VARIABLE = /\{\{[^{}]*\}\}/g
const OPENING = /\{\{\s*([\w.-]*)$/

type Suggestion = { query: string; start: number }

function highlighted(value: string): ReactNode[] {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const match of value.matchAll(VARIABLE)) {
    const index = match.index ?? 0
    parts.push(value.slice(cursor, index))
    parts.push(
      <mark key={index} className="rounded-[3px] bg-accent text-transparent shadow-[0_0_0_1px_var(--accent)]">
        {match[0]}
      </mark>
    )
    cursor = index + match[0].length
  }
  parts.push(value.slice(cursor))
  // Com uma quebra no fim, o espelho precisa de mais uma linha, como o campo.
  parts.push("​")
  return parts
}

export type TemplateInputProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
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

export function TemplateInput({
  id,
  value,
  onChange,
  onBlur,
  rows = 1,
  placeholder,
  singleLine = false,
  mono = false,
  disabled,
  ...aria
}: TemplateInputProps) {
  const { t } = useTranslation()
  const groups = useReceivedGroups()
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)

  const flat = useMemo(() => groups.flatMap((group) => group.fields.map((field) => ({ ...field, group: group.group }))), [groups])

  const matches = useMemo(() => {
    if (!suggestion) return []
    const needle = normalizeSearchText(suggestion.query)
    return flat.filter((field) => !needle || normalizeSearchText(`${field.key} ${field.value}`).includes(needle))
  }, [flat, suggestion])

  const syncSuggestion = (text: string, caret: number) => {
    const opening = OPENING.exec(text.slice(0, caret))
    if (!opening) {
      setSuggestion(null)
      return
    }
    setSuggestion({ query: opening[1], start: opening.index })
    setActive(0)
    setRect(textareaRef.current?.getBoundingClientRect() ?? null)
  }

  const insert = (field: ReceivedField) => {
    const element = textareaRef.current
    if (!element || !suggestion) return
    const caret = element.selectionStart
    const token = `{{${field.key}}}`
    // Se a pessoa já tinha fechado as chaves, não fecha de novo.
    const after = value.slice(caret).replace(/^\}\}/, "")
    onChange(value.slice(0, suggestion.start) + token + after)
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

  const listId = id ? `${id}-fields` : undefined
  const open = Boolean(suggestion && rect)
  const hasOptions = matches.length > 0
  // O espelho e o campo precisam quebrar a linha no mesmo lugar. A folga da direita é do botão.
  const typography = cn("py-2 pr-9 pl-2.5 text-base md:text-sm", mono && "font-mono md:text-[13px]")

  return (
    <div className="relative">
      <div className="grid">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none col-start-1 row-start-1 border border-transparent whitespace-pre-wrap text-transparent [overflow-wrap:anywhere]",
            typography
          )}
        >
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
          // Numa linha só quase sempre vai uma variável ou um endereço: o corretor só atrapalharia.
          spellCheck={singleLine || mono ? false : undefined}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && hasOptions}
          aria-controls={open && hasOptions ? listId : undefined}
          aria-activedescendant={open && hasOptions ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onChange(singleLine ? event.target.value.replace(/\n/g, " ") : event.target.value)
            syncSuggestion(event.target.value, event.target.selectionStart)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            onBlur?.()
            window.setTimeout(() => setSuggestion(null), 120)
          }}
          className={cn("relative col-start-1 row-start-1 min-h-0 resize-none bg-transparent", typography)}
          style={{ minHeight: `calc(${rows}lh + 1rem + 2px)` }}
        />
      </div>

      {!disabled ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("webhooks.template.insert")}
          title={t("webhooks.template.insert")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openFromButton}
          className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-8"
        >
          <Braces className="size-3.5" aria-hidden />
        </button>
      ) : null}

      {open && rect
        ? createPortal(
            <FieldList
              id={listId}
              rect={rect}
              matches={matches}
              hasAny={flat.length > 0}
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

function FieldList({
  id,
  rect,
  matches,
  hasAny,
  active,
  onHover,
  onPick,
}: {
  id?: string
  rect: DOMRect
  matches: (ReceivedField & { group: string })[]
  hasAny: boolean
  active: number
  onHover: (index: number) => void
  onPick: (field: ReceivedField) => void
}) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLUListElement>(null)
  const below = window.innerHeight - rect.bottom > 240
  let lastGroup: string | null = null

  useLayoutEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  const position = {
    left: rect.left,
    width: rect.width,
    ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
  }

  if (matches.length === 0) {
    return (
      <p
        role="status"
        className="fixed z-[60] rounded-xl border bg-popover p-3 text-xs text-pretty text-muted-foreground shadow-lg"
        style={position}
      >
        {t(hasAny ? "webhooks.template.noMatches" : "webhooks.template.nothingYet", LITERAL)}
      </p>
    )
  }

  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={t("webhooks.template.listLabel")}
      className="fixed z-[60] max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
      style={position}
    >
      {matches.map((field, index) => {
        const heading = field.group !== lastGroup
        lastGroup = field.group
        return (
          <li
            key={field.key}
            id={id ? `${id}-${index}` : undefined}
            data-index={index}
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(field)
            }}
          >
            {heading ? (
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t(`webhooks.fields.groups.${field.group}`, { defaultValue: field.group })}</p>
            ) : null}
            <div className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2 py-1.5", index === active && "bg-muted")}>
              <span className="min-w-0 truncate font-mono text-xs">{field.name}</span>
              <span className="min-w-0 truncate text-xs text-muted-foreground">{field.value}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Um campo do formulário das ações com variáveis. */
export function TemplateField({
  control,
  name,
  label,
  hint,
  optional,
  rows,
  singleLine,
  mono,
  placeholder,
  className,
}: {
  control: Control<WebhookFormValues>
  name: FieldPath<WebhookFormValues>
  label: string
  hint?: ReactNode
  optional?: boolean
  rows?: number
  singleLine?: boolean
  mono?: boolean
  placeholder?: string
  className?: string
}) {
  return (
    <FormField control={control} name={name} label={label} hint={hint} optional={optional} className={className}>
      {({ field, controlProps }) => (
        <TemplateInput
          {...controlProps}
          value={(field.value as string | null | undefined) ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          rows={rows}
          singleLine={singleLine}
          mono={mono}
          placeholder={placeholder}
        />
      )}
    </FormField>
  )
}
