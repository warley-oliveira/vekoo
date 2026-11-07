import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { getSchema } from "@tiptap/core"
import { Color } from "@tiptap/extension-color"
import { Highlight } from "@tiptap/extension-highlight"
import { Image } from "@tiptap/extension-image"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import { TaskItem } from "@tiptap/extension-task-item"
import { TaskList } from "@tiptap/extension-task-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { TextStyle } from "@tiptap/extension-text-style"
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useIsTouch } from "@/hooks/use-media-query"
import { keepKnownContent } from "./description-schema"
import { SlashCommands } from "./description-slash"
import { DescriptionBubble, DescriptionToolbar } from "./description-toolbar"
import "./description-editor.css"

// Em chunk próprio: o Tiptap é grande, e só quem abre o card paga por ele. As extensões são as mesmas
// da plataforma antiga, com os mesmos nomes no documento: o que foi escrito lá abre e volta igual.

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
]
const SCHEMA = getSchema(EXTENSIONS)

const SAVE_DELAY_MS = 1_200
/** Descrição longa não empurra o resto do card para longe. Editando, ela abre inteira. */
const COLLAPSED_MAX_PX = 220
const COLLAPSE_SLACK_PX = 12

/** Card que nasceu de gatilho ou automação só tem texto puro: vira parágrafos no editor. */
function plainTextToDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((paragraph) =>
        paragraph
          ? { type: "paragraph", content: [{ type: "text", text: paragraph }] }
          : { type: "paragraph" }
      ),
  }
}

type DescriptionEditorProps = {
  /** A descrição que está salva. Mudou e a pessoa não está digitando: o editor acompanha. */
  value: Record<string, unknown> | null
  /** Texto puro, para o card que ainda não tem descrição rica. */
  fallbackText: string | null
  onSave: (doc: Record<string, unknown>) => Promise<unknown>
}

/** A descrição do card, salva sozinha um instante depois de parar de digitar, e ao fechar. */
export default function DescriptionEditor({ value, fallbackText, onSave }: DescriptionEditorProps) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [imageOpen, setImageOpen] = useState(false)

  const content = useMemo<JSONContent | null>(() => {
    if (value) return keepKnownContent(value as JSONContent, SCHEMA)
    return fallbackText ? plainTextToDoc(fallbackText) : null
  }, [fallbackText, value])

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const pending = useRef<JSONContent | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  // A extensão nasce uma vez só, e a língua pode mudar depois: ela pergunta aqui na hora de mostrar.
  const translate = useRef(t)
  translate.current = t

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const doc = pending.current
    if (!doc) return
    pending.current = null
    setStatus("saving")
    onSaveRef.current(doc as Record<string, unknown>).then(
      () => setStatus("saved"),
      () => setStatus("error")
    )
  }, [])

  const editor = useEditor({
    extensions: [
      ...EXTENSIONS,
      Placeholder.configure({ placeholder: t("pipelines.description.placeholder") }),
      SlashCommands.configure({
        describe: (id) => ({
          label: translate.current(`pipelines.description.slash.${id}.label`),
          hint: translate.current(`pipelines.description.slash.${id}.hint`),
        }),
        onRequestImage: () => setImageOpen(true),
      }),
    ],
    content,
    immediatelyRender: true,
    // Só o editor se redesenha a cada tecla: o resto do painel não fica sabendo.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        "aria-label": t("pipelines.description.label"),
        class: "min-h-24 px-3 py-2 text-sm outline-none",
      },
    },
    onFocus: () => setEditing(true),
    onBlur: () => setEditing(false),
    onUpdate: ({ editor: current }) => {
      pending.current = current.getJSON()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY_MS)
    },
  })

  // Outra pessoa mudou a descrição. Com edição em andamento, quem está digitando vence.
  useEffect(() => {
    // `isDestroyed`: o Tiptap solta a instância de um render que o React descartou, e ela ainda
    // chega até aqui uma vez. `eq`, e não o texto do JSON: o banco devolve as chaves em outra ordem,
    // e regravar o conteúdo à toa apagaria o desfazer.
    if (!editor || editor.isDestroyed || editor.isFocused || pending.current || !content) return
    if (!editor.state.doc.eq(editor.schema.nodeFromJSON(content))) {
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  // Fechar o card salva o que falta.
  useEffect(() => () => flush(), [flush])

  // Antes de pintar, para o conteúdo inteiro não piscar antes de recolher.
  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) return
    const measure = () => setOverflowing(element.offsetHeight > COLLAPSED_MAX_PX + COLLAPSE_SLACK_PX)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!editor) return null

  const collapsed = overflowing && !expanded && !editing

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={frameRef}
        className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      >
        <DescriptionToolbar editor={editor} imageOpen={imageOpen} onImageOpenChange={setImageOpen} />
        {/* Com dedo, a seleção já traz o menu do aparelho, e a barra de cima tem as mesmas ações. */}
        {isTouch ? null : <DescriptionBubble editor={editor} frameRef={frameRef} />}
        <div
          // `clip`, e não `hidden`: o que está escondido não pode ser rolado por dentro, por um cursor
          // ou pela busca da página, o que levaria o "Mostrar mais" para o meio do texto.
          className={collapsed ? "relative overflow-clip" : undefined}
          style={collapsed ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
        >
          <div ref={contentRef}>
            <EditorContent editor={editor} onBlur={flush} className="description-editor" />
          </div>
          {collapsed ? (
            <div className="absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-linear-to-t from-background to-transparent pb-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary pointer-coarse:h-10"
                onClick={() => setExpanded(true)}
              >
                <ChevronDown />
                {t("pipelines.description.showMore")}
              </Button>
            </div>
          ) : null}
        </div>
        {overflowing && expanded && !editing ? (
          <div className="flex justify-center border-t py-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary pointer-coarse:h-10"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp />
              {t("pipelines.description.showLess")}
            </Button>
          </div>
        ) : null}
      </div>
      <p aria-live="polite" className="h-4 text-xs text-muted-foreground">
        {status === "saving"
          ? t("pipelines.description.saving")
          : status === "saved"
            ? t("pipelines.description.saved")
            : status === "error"
              ? t("pipelines.description.saveFailed")
              : null}
      </p>
    </div>
  )
}
