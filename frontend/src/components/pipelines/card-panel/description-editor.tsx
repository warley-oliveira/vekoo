import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSchema } from "@tiptap/core"
import { Image } from "@tiptap/extension-image"
import { Placeholder } from "@tiptap/extension-placeholder"
import { TaskItem } from "@tiptap/extension-task-item"
import { TaskList } from "@tiptap/extension-task-list"
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { useTranslation } from "react-i18next"
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from "lucide-react"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { keepKnownContent, LEGACY_EXTENSIONS } from "./description-schema"

// Em chunk próprio: o Tiptap é grande, e só quem abre o card paga por ele.

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: { openOnClick: false, autolink: true },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  ...LEGACY_EXTENSIONS,
]
const SCHEMA = getSchema(EXTENSIONS)

const SAVE_DELAY_MS = 1_200
const URL_EXAMPLE = "https://"

/** "loja.com.br" vira um endereço de verdade; quem escreveu o esquema sabe o que quer. */
function withScheme(url: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `${URL_EXAMPLE}${url}`
}

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

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn(
        "text-muted-foreground pointer-coarse:size-9",
        active && "bg-muted text-foreground"
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Sem isto, o clique tira a seleção do editor antes do comando rodar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/** Link e imagem pedem um endereço: num popup da própria tela, e não no `prompt` do navegador. */
function UrlTool({
  label,
  active,
  hint,
  initial,
  onApply,
  children,
}: {
  label: string
  active?: boolean
  hint?: string
  initial: () => string
  onApply: (url: string) => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        if (next) setUrl(initial())
        setOpen(next)
      }}
      title={label}
      className="w-80 gap-0 p-2"
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            "text-muted-foreground pointer-coarse:size-9",
            active && "bg-muted text-foreground"
          )}
          aria-label={label}
          aria-pressed={active}
          title={label}
          // A seleção do editor precisa continuar lá para o comando valer sobre ela.
          onMouseDown={(event) => event.preventDefault()}
        >
          {children}
        </Button>
      }
    >
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onApply(url.trim())
          setOpen(false)
        }}
      >
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            inputMode="url"
            value={url}
            aria-label={label}
            placeholder={URL_EXAMPLE}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" size="sm" className="pointer-coarse:h-10">
            {t("pipelines.description.apply")}
          </Button>
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </form>
    </ResponsivePopover>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation()

  function setLink(url: string) {
    if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run()
    else editor.chain().focus().extendMarkRange("link").setLink({ href: withScheme(url) }).run()
  }

  function addImage(url: string) {
    if (url) editor.chain().focus().setImage({ src: withScheme(url) }).run()
  }

  const tool = (key: string) => t(`pipelines.description.tools.${key}`)

  return (
    <div
      role="toolbar"
      aria-label={t("pipelines.description.toolbar")}
      className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1"
    >
      <ToolbarButton label={tool("bold")} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label={tool("italic")} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label={tool("underline")} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline />
      </ToolbarButton>
      <ToolbarButton label={tool("strike")} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough />
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton label={tool("heading2")} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton label={tool("heading3")} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton label={tool("bulletList")} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolbarButton>
      <ToolbarButton label={tool("orderedList")} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton label={tool("taskList")} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks />
      </ToolbarButton>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <ToolbarButton label={tool("quote")} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote />
      </ToolbarButton>
      <ToolbarButton label={tool("code")} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 />
      </ToolbarButton>
      <UrlTool
        label={tool("link")}
        active={editor.isActive("link")}
        hint={t("pipelines.description.linkHint")}
        initial={() => (editor.getAttributes("link").href as string | undefined) ?? ""}
        onApply={setLink}
      >
        <LinkIcon />
      </UrlTool>
      <UrlTool label={tool("image")} initial={() => ""} onApply={addImage}>
        <ImageIcon />
      </UrlTool>
    </div>
  )
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
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const content = useMemo<JSONContent | null>(() => {
    if (value) return keepKnownContent(value as JSONContent, SCHEMA)
    return fallbackText ? plainTextToDoc(fallbackText) : null
  }, [fallbackText, value])

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const pending = useRef<JSONContent | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  if (!editor) return null

  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Toolbar editor={editor} />
        <EditorContent
          editor={editor}
          onBlur={flush}
          className={cn(
            "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
            "[&_.ProseMirror_p]:my-1 [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-1 [&_.ProseMirror_h2]:font-heading [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold",
            "[&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-1 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5",
            "[&_.ProseMirror_ul[data-type=taskList]]:list-none [&_.ProseMirror_ul[data-type=taskList]]:pl-0.5 [&_.ProseMirror_li[data-checked]]:flex [&_.ProseMirror_li[data-checked]]:gap-2 [&_.ProseMirror_li[data-checked=true]>div]:text-muted-foreground [&_.ProseMirror_li[data-checked=true]>div]:line-through",
            "[&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground",
            "[&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:p-2 [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-xs [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-xs",
            "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_img]:my-2 [&_.ProseMirror_img]:max-h-72 [&_.ProseMirror_img]:rounded-md",
            "[&_.ProseMirror_table]:my-2 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_td]:border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:bg-muted [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-medium"
          )}
        />
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
