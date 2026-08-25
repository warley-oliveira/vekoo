import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"

import { ListMarker } from "@/components/editor/blocks/block-list"
import { ROLE_CLASS } from "@/components/editor/blocks/block-text"
import {
  inkClass,
  inkStyle,
  JUSTIFY_ALIGN,
  TEXT_ALIGN,
} from "@/components/editor/blocks/shared"
import { CardBlockView } from "@/components/editor/card-art"
import { useEditor } from "@/components/editor/editor-store"
import { SlashMenu } from "@/components/editor/slash-menu"
import {
  spansAreEmpty,
  type BadgeBlock,
  type Block,
  type ButtonBlock,
  type CarouselTheme,
  type ListBlock,
  type QuoteBlock,
  type StatBlock,
  type StepsBlock,
  type TableBlock,
  type TestimonialBlock,
  type TextBlock,
  type TextSpan,
} from "@/lib/doc"
import {
  htmlToSpans,
  insertPlainText,
  spansToHtml,
} from "@/lib/rich-text"
import { cn } from "@/lib/utils"

// Edição no lugar: cada editor veste exatamente as classes do bloco que
// substitui, para o texto não pular nem mudar de corpo ao entrar em edição.
// Convenções: Enter confirma (Shift+Enter quebra linha), Esc descarta, sair do
// bloco (blur) confirma.
//
// Texto, citação, lista, passos e depoimento usam contenteditable — é o que
// permite selecionar meia frase e marcá-la. Os campos curtos (número, rótulo,
// selo, células) continuam em <input>, onde marca não faria sentido.

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
    case "testimonial":
      return <TestimonialEditor block={block} theme={theme} />
    case "stat":
      return <StatEditor block={block} theme={theme} />
    case "button":
      return <ButtonEditor block={block} theme={theme} />
    case "badge":
      return <BadgeEditor block={block} theme={theme} />
    case "list":
    case "steps":
      return <SpanListEditor block={block} theme={theme} />
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

// ---------------------------------------------------------------------------
// Campo de texto com marcas

export type RichTextHandle = {
  read: () => TextSpan[]
  focus: () => void
}

type RichTextProps = {
  ref?: Ref<RichTextHandle>
  spans: TextSpan[]
  placeholder?: string
  className?: string
  style?: CSSProperties
  autoFocus?: boolean
  onCommit: () => void
  onCancel: () => void
  /** Enter sem Shift: se existir, manda nele em vez de confirmar o bloco. */
  onEnter?: () => void
  /** Backspace num campo já vazio — a lista usa para remover o item. */
  onBackspaceEmpty?: () => void
  /** "/" num campo vazio abre o menu de blocos, ancorado no cursor. */
  onSlash?: (anchor: DOMRect) => void
}

/**
 * Contenteditable não controlado: o HTML entra uma vez e quem manda no cursor
 * daí em diante é o navegador. React nunca reescreve o conteúdo enquanto se
 * digita — é isso que impede o cursor de pular.
 */
function RichText({
  ref,
  spans,
  placeholder,
  className,
  style,
  autoFocus = false,
  onCommit,
  onCancel,
  onEnter,
  onBackspaceEmpty,
  onSlash,
}: RichTextProps) {
  const element = useRef<HTMLDivElement>(null)
  const initialHtml = useRef(spansToHtml(spans))
  const [empty, setEmpty] = useState(spansAreEmpty(spans))

  useImperativeHandle(ref, () => ({
    read: () => htmlToSpans(element.current?.innerHTML ?? ""),
    focus: () => element.current?.focus(),
  }))

  useEffect(() => {
    const el = element.current
    if (!el || !autoFocus) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // só na montagem: o cursor vai para o fim do texto existente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function isBlank(): boolean {
    return (element.current?.textContent ?? "").trim() === ""
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (onEnter) onEnter()
      else onCommit()
      return
    }
    if (e.key === "Backspace" && onBackspaceEmpty && isBlank()) {
      e.preventDefault()
      onBackspaceEmpty()
      return
    }
    if (e.key === "/" && onSlash && isBlank()) {
      e.preventDefault()
      const rect = element.current?.getBoundingClientRect()
      if (rect) onSlash(rect)
    }
  }

  return (
    <div className={cn("relative", className)} style={style}>
      {empty && placeholder && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
        >
          {placeholder}
        </span>
      )}
      <div
        ref={element}
        data-rich-text=""
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        spellCheck
        onInput={() => setEmpty(isBlank())}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          e.preventDefault()
          insertPlainText(e.clipboardData.getData("text/plain"))
          setEmpty(isBlank())
        }}
        className="relative outline-none"
        dangerouslySetInnerHTML={{ __html: initialHtml.current }}
      />
    </div>
  )
}

/** Campo curto: sem marcas, mas com as mesmas convenções de teclado. */
function ShortField({
  value,
  onValueChange,
  onCommit,
  onCancel,
  placeholder,
  className,
  style,
  autoFocus = false,
}: {
  value: string
  onValueChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  autoFocus?: boolean
}) {
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onCommit()
        }
        if (e.key === "Escape") onCancel()
      }}
      className={cn(
        "block w-full bg-transparent p-0 outline-none placeholder:opacity-40",
        className
      )}
      style={style}
    />
  )
}

/** O menu "/" que qualquer editor de texto pode abrir. */
function useSlashMenu(blockId: string) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const node = anchor ? (
    <SlashMenu
      anchor={anchor}
      replaceBlockId={blockId}
      onClose={() => setAnchor(null)}
    />
  ) : null
  return { open: setAnchor, node }
}

// ---------------------------------------------------------------------------

function TextEditor({ block, theme }: { block: TextBlock; theme: CarouselTheme }) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const field = useRef<RichTextHandle>(null)
  const slash = useSlashMenu(block.id)

  function commit() {
    const spans = field.current?.read() ?? block.spans
    if (JSON.stringify(spans) !== JSON.stringify(block.spans)) {
      dispatch({ type: "block/update", block: { ...block, spans } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  return (
    <>
      <div onBlur={blurOutside(commit)}>
        <RichText
          ref={field}
          autoFocus
          spans={block.spans}
          onCommit={commit}
          onCancel={cancel}
          onSlash={slash.open}
          placeholder={t("editor.canvas.textPlaceholder")}
          className={cn(
            ROLE_CLASS[block.role],
            TEXT_ALIGN[block.align],
            inkClass(block.color)
          )}
          style={inkStyle(block.color, theme)}
        />
      </div>
      {slash.node}
    </>
  )
}

function QuoteEditor({ block, theme }: { block: QuoteBlock; theme: CarouselTheme }) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const field = useRef<RichTextHandle>(null)
  const [attribution, setAttribution] = useState(block.attribution ?? "")

  function commit() {
    const spans = field.current?.read() ?? block.spans
    const nextAttribution = attribution.trim() === "" ? undefined : attribution
    if (
      JSON.stringify(spans) !== JSON.stringify(block.spans) ||
      nextAttribution !== block.attribution
    ) {
      dispatch({
        type: "block/update",
        block: { ...block, spans, attribution: nextAttribution },
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
      <RichText
        ref={field}
        autoFocus
        spans={block.spans}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.textPlaceholder")}
        className="text-[5.4cqw] leading-[1.32] font-medium"
      />
      <ShortField
        value={attribution}
        onValueChange={setAttribution}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.quoteAttributionPlaceholder")}
        className="mt-[2.2cqw] text-[3.8cqw] opacity-75"
      />
    </blockquote>
  )
}

function TestimonialEditor({
  block,
  theme,
}: {
  block: TestimonialBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()
  const field = useRef<RichTextHandle>(null)
  const [name, setName] = useState(block.name)
  const [role, setRole] = useState(block.role ?? "")

  function commit() {
    const spans = field.current?.read() ?? block.spans
    const nextRole = role.trim() === "" ? undefined : role
    if (
      JSON.stringify(spans) !== JSON.stringify(block.spans) ||
      name !== block.name ||
      nextRole !== block.role
    ) {
      dispatch({
        type: "block/update",
        block: { ...block, spans, name, role: nextRole },
      })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  return (
    <figure
      className={cn("flex flex-col gap-[3cqw]", inkClass(block.color))}
      onBlur={blurOutside(commit)}
    >
      <RichText
        ref={field}
        autoFocus
        spans={block.spans}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.testimonialQuotePlaceholder")}
        className="text-[4.8cqw] leading-[1.38] font-medium"
      />
      <figcaption className="flex items-center gap-[2.8cqw]">
        <span
          aria-hidden
          className="size-[9cqw] shrink-0 rounded-full"
          style={{ backgroundColor: theme.accent }}
        />
        <span className="min-w-0 flex-1">
          <ShortField
            value={name}
            onValueChange={setName}
            onCommit={commit}
            onCancel={cancel}
            placeholder={t("editor.canvas.testimonialNamePlaceholder")}
            className="text-[3.9cqw] font-semibold"
          />
          <ShortField
            value={role}
            onValueChange={setRole}
            onCommit={commit}
            onCancel={cancel}
            placeholder={t("editor.canvas.testimonialRolePlaceholder")}
            className="text-[3.4cqw] opacity-70"
          />
        </span>
      </figcaption>
    </figure>
  )
}

function StatEditor({ block, theme }: { block: StatBlock; theme: CarouselTheme }) {
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

  return (
    <div onBlur={blurOutside(commit)}>
      <ShortField
        autoFocus
        value={value}
        onValueChange={setValue}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.statValuePlaceholder")}
        className={cn(
          "font-heading text-[13cqw] leading-none font-bold tracking-tight",
          TEXT_ALIGN[block.align]
        )}
        style={block.color === "accent" ? { color: theme.accent } : undefined}
      />
      <ShortField
        value={label}
        onValueChange={setLabel}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.statLabelPlaceholder")}
        className={cn(
          "mt-[2cqw] text-[4.2cqw] leading-[1.35] opacity-80",
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
    <div
      onBlur={blurOutside(commit)}
      className={cn("flex w-full", JUSTIFY_ALIGN[block.align])}
    >
      <ShortField
        autoFocus
        value={label}
        onValueChange={setLabel}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.buttonLabelPlaceholder")}
        className={cn(
          "w-auto min-w-[36cqw] rounded-full px-[5.5cqw] py-[2.4cqw] text-[4.2cqw] font-semibold tracking-tight",
          block.variant === "outline" && "border-[0.6cqw]"
        )}
        style={
          block.variant === "solid"
            ? { backgroundColor: theme.accent, color: theme.accentInk }
            : { borderColor: theme.accent }
        }
      />
    </div>
  )
}

function BadgeEditor({ block, theme }: { block: BadgeBlock; theme: CarouselTheme }) {
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
    <div
      onBlur={blurOutside(commit)}
      className={cn("flex w-full", JUSTIFY_ALIGN[block.align])}
    >
      <ShortField
        autoFocus
        value={label}
        onValueChange={setLabel}
        onCommit={commit}
        onCancel={cancel}
        placeholder={t("editor.canvas.badgeLabelPlaceholder")}
        className="w-auto min-w-[24cqw] rounded-full px-[3.4cqw] py-[1.2cqw] text-[3.2cqw] font-semibold tracking-[0.1em] uppercase"
        style={
          block.variant === "solid"
            ? { backgroundColor: theme.accent, color: theme.accentInk }
            : {
                backgroundColor: `color-mix(in oklab, ${theme.accent} 16%, transparent)`,
                color: theme.accent,
              }
        }
      />
    </div>
  )
}

/**
 * Lista e passos compartilham o editor: uma pilha de campos com marcas, onde
 * Enter cria o próximo item e Backspace num item vazio remove.
 */
function SpanListEditor({
  block,
  theme,
}: {
  block: ListBlock | StepsBlock
  theme: CarouselTheme
}) {
  const { t } = useTranslation()
  const { dispatch } = useEditor()
  const cancel = useCancel()

  const nextKey = useRef(block.items.length)
  const [rows, setRows] = useState(() =>
    (block.items.length > 0 ? block.items : [[]]).map((spans, index) => ({
      key: index,
      spans,
    }))
  )
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const fields = useRef(new Map<number, RichTextHandle | null>())

  useEffect(() => {
    if (focusKey === null) return
    fields.current.get(focusKey)?.focus()
    setFocusKey(null)
  }, [focusKey])

  /** Lê os campos vivos — a fonte da verdade enquanto se edita é o DOM. */
  function readRows() {
    return rows.map((row) => fields.current.get(row.key)?.read() ?? row.spans)
  }

  function commit() {
    const cleaned = readRows().filter((spans) => !spansAreEmpty(spans))
    const items = cleaned.length > 0 ? cleaned : [[]]
    if (JSON.stringify(items) !== JSON.stringify(block.items)) {
      dispatch({ type: "block/update", block: { ...block, items } })
    }
    dispatch({ type: "block/edit", editing: false })
  }

  function addAfter(index: number) {
    const current = readRows()
    const key = nextKey.current++
    const next = rows.map((row, i) => ({ key: row.key, spans: current[i] }))
    next.splice(index + 1, 0, { key, spans: [] })
    setRows(next)
    setFocusKey(key)
  }

  function removeAt(index: number) {
    if (rows.length <= 1) return
    const current = readRows()
    const next = rows
      .map((row, i) => ({ key: row.key, spans: current[i] }))
      .filter((_, i) => i !== index)
    setRows(next)
    setFocusKey(next[Math.max(0, index - 1)]?.key ?? null)
  }

  const isSteps = block.type === "steps"

  return (
    <ol
      className={cn(
        "flex flex-col",
        isSteps ? "gap-[3cqw]" : "gap-[2.4cqw]",
        inkClass(block.color)
      )}
      onBlur={blurOutside(commit)}
    >
      {rows.map((row, index) => (
        <li
          key={row.key}
          className={cn(
            "flex gap-[2.6cqw]",
            isSteps
              ? "items-baseline gap-[3cqw] text-[4.4cqw] leading-[1.35]"
              : "items-start text-[4.4cqw] leading-[1.35]"
          )}
        >
          {isSteps ? (
            <span
              aria-hidden
              className="font-heading w-[7cqw] shrink-0 text-[7cqw] leading-none font-bold tabular-nums"
              style={{ color: theme.accent }}
            >
              {index + 1}
            </span>
          ) : (
            <ListMarker style={block.style} index={index} theme={theme} />
          )}
          <RichText
            ref={(handle) => {
              fields.current.set(row.key, handle)
            }}
            autoFocus={index === 0 && focusKey === null}
            spans={row.spans}
            onCommit={commit}
            onCancel={cancel}
            onEnter={() => addAfter(index)}
            onBackspaceEmpty={() => removeAt(index)}
            placeholder={t("editor.canvas.listItemPlaceholder")}
            className="min-w-0 flex-1"
          />
        </li>
      ))}
    </ol>
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
        ri === rowIndex ? row.map((cell, ci) => (ci === colIndex ? value : cell)) : row
      )
    )
  }

  const [header, ...body] = rows
  if (!header) return null

  const cell = (rowIndex: number, colIndex: number, value: string) => (
    <ShortField
      autoFocus={rowIndex === 0 && colIndex === 0}
      value={value}
      onValueChange={(next) => setCell(rowIndex, colIndex, next)}
      onCommit={commit}
      onCancel={cancel}
    />
  )

  return (
    <table
      className="w-full border-collapse text-[3.7cqw] leading-[1.3]"
      onBlur={blurOutside(commit)}
    >
      <thead>
        <tr>
          {header.map((value, ci) => (
            <th
              key={ci}
              className="border-b-[0.5cqw] border-current/40 pr-[2.5cqw] pb-[1.7cqw] text-left font-semibold last:pr-0"
            >
              {cell(0, ci, value)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>
            {row.map((value, ci) => (
              <td
                key={ci}
                className="border-b-[0.3cqw] border-current/15 py-[1.8cqw] pr-[2.5cqw] last:pr-0"
              >
                {cell(ri + 1, ci, value)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
