import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react"
import { useTranslation } from "react-i18next"

import { ListMarker } from "@/components/editor/blocks/block-list"
import { ROLE_CLASS } from "@/components/editor/blocks/block-text"
import { inkClass, inkStyle, TEXT_ALIGN } from "@/components/editor/blocks/shared"
import { CardBlockView } from "@/components/editor/card-art"
import { useEditor } from "@/components/editor/editor-store"
import type {
  Block,
  ButtonBlock,
  CarouselTheme,
  ListBlock,
  QuoteBlock,
  StatBlock,
  TableBlock,
  TextBlock,
} from "@/lib/doc"
import { cn } from "@/lib/utils"

// Edição no lugar: cada editor veste exatamente as classes do bloco que
// substitui, para o texto não pular nem mudar de corpo ao entrar em edição.
// Convenções: Enter confirma (Shift+Enter quebra linha), Esc descarta,
// sair do bloco (blur) confirma.

export function BlockEditor({
  block,
  theme,
}: {
  block: Block
  theme: CarouselTheme
}) {
  switch (block.type) {
    case "text":
      return <TextEditor block={block} theme={theme} />
    case "quote":
      return <QuoteEditor block={block} theme={theme} />
    case "stat":
      return <StatEditor block={block} theme={theme} />
    case "button":
      return <ButtonEditor block={block} theme={theme} />
    case "list":
      return <ListEditor block={block} theme={theme} />
    case "table":
      return <TableEditor block={block} />
    case "image":
    case "divider":
      return <CardBlockView block={block} theme={theme} />
  }
}

/** Sai do modo de edição sem gravar o rascunho. */
function useCancel() {
  const { dispatch } = useEditor()
  return () => dispatch({ type: "block/edit", editing: false })
}

/** Blur que só confirma quando o foco sai do editor inteiro. */
function blurOutside(handler: () => void) {
  return (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) handler()
  }
}

type GrowingTextareaProps = {
  value: string
  onValueChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  autoFocus?: boolean
}

/** Textarea que cresce com o conteúdo e mantém a tipografia do bloco. */
function GrowingTextarea({
  value,
  onValueChange,
  onCommit,
  onCancel,
  placeholder,
  className,
  style,
  autoFocus = false,
}: GrowingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (el && autoFocus) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    // roda só na montagem: coloca o cursor no fim do texto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          onCommit()
        }
        if (e.key === "Escape") onCancel()
      }}
      className={cn(
        "block w-full resize-none overflow-hidden bg-transparent p-0 outline-none placeholder:opacity-40",
        className
      )}
      style={style}
    />
  )
}

function TextEditor({
  block,
  theme,
}: {
  block: TextBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const [draft, setDraft] = useState(block.text)

  function commit() {
    if (draft !== block.text) {
      dispatch({ type: "block/update", block: { ...block, text: draft } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  return (
    <GrowingTextarea
      autoFocus
      value={draft}
      onValueChange={setDraft}
      onCommit={commit}
      onCancel={cancel}
      placeholder={t("editor.canvas.textPlaceholder")}
      className={cn(
        ROLE_CLASS[block.role],
        TEXT_ALIGN[block.align],
        inkClass(block.color)
      )}
      style={inkStyle(block.color, theme)}
    />
  )
}

function QuoteEditor({
  block,
  theme,
}: {
  block: QuoteBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const [text, setText] = useState(block.text)
  const [attribution, setAttribution] = useState(block.attribution ?? "")

  function commit() {
    const nextAttribution =
      attribution.trim() === "" ? undefined : attribution
    if (text !== block.text || nextAttribution !== block.attribution) {
      dispatch({
        type: "block/update",
        block: { ...block, text, attribution: nextAttribution },
      })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  return (
    <blockquote
      className={cn("border-l-[1cqw] pl-[4.5cqw]", inkClass(block.color))}
      style={{ borderColor: theme.accent }}
      onBlur={blurOutside(commit)}
    >
      <GrowingTextarea
        autoFocus
        value={text}
        onValueChange={setText}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.textPlaceholder")}
        className="text-[5.4cqw] leading-[1.32] font-medium"
      />
      <input
        value={attribution}
        onChange={(e) => setAttribution(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") cancel()
        }}
        placeholder={t("editor.canvas.quoteAttributionPlaceholder")}
        className="mt-[2.2cqw] block w-full bg-transparent opacity-75 outline-none placeholder:opacity-40 text-[3.8cqw]"
      />
    </blockquote>
  )
}

function StatEditor({
  block,
  theme,
}: {
  block: StatBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const [value, setValue] = useState(block.value)
  const [label, setLabel] = useState(block.label)

  function commit() {
    if (value !== block.value || label !== block.label) {
      dispatch({ type: "block/update", block: { ...block, value, label } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  function keys(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit()
    if (e.key === "Escape") cancel()
  }

  return (
    <div onBlur={blurOutside(commit)}>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={keys}
        placeholder={t("editor.canvas.statValuePlaceholder")}
        className={cn(
          "block w-full bg-transparent font-heading text-[13cqw] leading-none font-bold tracking-tight outline-none placeholder:opacity-40",
          TEXT_ALIGN[block.align]
        )}
        style={block.color === "accent" ? { color: theme.accent } : undefined}
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={keys}
        placeholder={t("editor.canvas.statLabelPlaceholder")}
        className={cn(
          "mt-[2cqw] block w-full bg-transparent text-[4.2cqw] leading-[1.35] opacity-80 outline-none placeholder:opacity-40",
          TEXT_ALIGN[block.align]
        )}
      />
    </div>
  )
}

function ButtonEditor({
  block,
  theme,
}: {
  block: ButtonBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const [label, setLabel] = useState(block.label)

  function commit() {
    if (label !== block.label) {
      dispatch({ type: "block/update", block: { ...block, label } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  return (
    <input
      autoFocus
      value={label}
      onChange={(e) => setLabel(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") cancel()
      }}
      placeholder={t("editor.canvas.buttonLabelPlaceholder")}
      className={cn(
        "block w-full rounded-full bg-transparent px-[5.5cqw] py-[2.4cqw] text-[4.2cqw] font-semibold tracking-tight outline-none placeholder:opacity-40",
        block.variant === "outline" && "border-[0.6cqw]"
      )}
      style={
        block.variant === "solid"
          ? { backgroundColor: theme.accent, color: theme.accentInk }
          : { borderColor: theme.accent }
      }
    />
  )
}

function ListEditor({
  block,
  theme,
}: {
  block: ListBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const [items, setItems] = useState<string[]>(
    block.items.length > 0 ? block.items : [""]
  )
  const [focusIndex, setFocusIndex] = useState(0)
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    refs.current[focusIndex]?.focus()
  }, [focusIndex, items.length])

  function commit() {
    const cleaned = items.filter((item) => item.trim() !== "")
    const next = cleaned.length > 0 ? cleaned : [""]
    if (JSON.stringify(next) !== JSON.stringify(block.items)) {
      dispatch({ type: "block/update", block: { ...block, items: next } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  return (
    <ul
      className={cn("flex flex-col gap-[2.4cqw]", inkClass(block.color))}
      onBlur={blurOutside(commit)}
    >
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-[2.6cqw] text-[4.4cqw] leading-[1.35]"
        >
          <ListMarker style={block.style} index={index} theme={theme} />
          <input
            ref={(el) => {
              refs.current[index] = el
            }}
            value={item}
            onChange={(e) =>
              setItems(items.map((it, i) => (i === index ? e.target.value : it)))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                const next = [...items]
                next.splice(index + 1, 0, "")
                setItems(next)
                setFocusIndex(index + 1)
              } else if (
                e.key === "Backspace" &&
                item === "" &&
                items.length > 1
              ) {
                e.preventDefault()
                setItems(items.filter((_, i) => i !== index))
                setFocusIndex(Math.max(0, index - 1))
              } else if (e.key === "Escape") {
                cancel()
              }
            }}
            placeholder={t("editor.canvas.listItemPlaceholder")}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:opacity-40"
          />
        </li>
      ))}
    </ul>
  )
}

function TableEditor({ block }: { block: TableBlock }) {
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const [rows, setRows] = useState<string[][]>(block.rows)

  function commit() {
    if (JSON.stringify(rows) !== JSON.stringify(block.rows)) {
      dispatch({ type: "block/update", block: { ...block, rows } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  function setCell(rowIndex: number, colIndex: number, value: string) {
    setRows(
      rows.map((row, ri) =>
        ri === rowIndex
          ? row.map((cell, ci) => (ci === colIndex ? value : cell))
          : row
      )
    )
  }

  const [header, ...body] = rows
  if (!header) return null

  const cellInput = (rowIndex: number, colIndex: number, value: string) => (
    <input
      autoFocus={rowIndex === 0 && colIndex === 0}
      value={value}
      onChange={(e) => setCell(rowIndex, colIndex, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") cancel()
      }}
      className="w-full min-w-0 bg-transparent outline-none placeholder:opacity-40"
    />
  )

  return (
    <table
      className="w-full border-collapse text-[3.7cqw] leading-[1.3]"
      onBlur={blurOutside(commit)}
    >
      <thead>
        <tr>
          {header.map((cell, ci) => (
            <th
              key={ci}
              className="border-b-[0.5cqw] border-current/40 pr-[2.5cqw] pb-[1.7cqw] text-left font-semibold last:pr-0"
            >
              {cellInput(0, ci, cell)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td
                key={ci}
                className="border-b-[0.3cqw] border-current/15 py-[1.8cqw] pr-[2.5cqw] last:pr-0"
              >
                {cellInput(ri + 1, ci, cell)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
