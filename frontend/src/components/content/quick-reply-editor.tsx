import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Slice } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import {
  EditorContent,
  Extension,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  nodeInputRule,
  useEditor,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Braces, Loader2, Paperclip, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { FileTypeIcon } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useAttachmentMutations } from "@/hooks/content/use-attachments"
import { attachmentKindOf } from "@/lib/content/attachment-file"
import { contentErrorMessage } from "@/lib/content/error-message"
import { visibleLength } from "@/lib/content/quick-reply-content"
import { ATTACHMENT_KINDS, type Attachment } from "@/lib/content/types"
import { formatFileSize, getFileExtension } from "@/lib/file-utils"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { AttachmentThumb } from "./attachment-thumb"
import { InsertPicker, type PickerGroup } from "./insert-picker"
import {
  ATTACHMENT_NODE,
  VARIABLE_NODE,
  attachmentNode,
  contentToDoc,
  docToContent,
  variableNode,
  type AttachmentChipAttrs,
  type ContentResolvers,
  type VariableChipAttrs,
} from "./quick-reply-doc"

export const QUICK_REPLY_MAX_LENGTH = 4000
const MAX_FILE_BYTES = 100 * 1024 * 1024

/** O texto antes do cursor: `/` no começo da linha ou depois de espaço, e o que veio depois. */
const SLASH_QUERY = /(?:^|[\s￼])\/([^/\n￼]{0,40})$/
const OBJECT_REPLACEMENT = "￼"
const SLASH_LIMIT = 8

export type VariableOption = {
  key: string
  label: string
  group: "contact" | "team" | "fields"
}

export type QuickReplyEditorHandle = { focus: () => void }

type QuickReplyEditorProps = {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** A biblioteca de anexos. Já carregada: o editor nasce com o nome de cada citação. */
  attachments: Attachment[]
  variables: VariableOption[]
  resolvers: ContentResolvers
  label: string
  placeholder: string
  id?: string
  disabled?: boolean
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  editorRef?: Ref<QuickReplyEditorHandle>
}

/* ---------- blocos dentro do texto ---------- */

function Chip({
  tone = "neutral",
  selected,
  icon,
  children,
  removeLabel,
  onRemove,
}: {
  tone?: "neutral" | "danger" | "warning"
  selected: boolean
  icon: ReactNode
  children: ReactNode
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <NodeViewWrapper
      as="span"
      className={cn(
        "mx-px inline-flex max-w-full items-center gap-1 rounded-md py-px pr-0.5 pl-1.5 align-baseline text-[0.8125rem] leading-5 font-medium [&_svg]:size-3 [&_svg]:shrink-0",
        tone === "neutral" && "bg-muted text-foreground",
        tone === "danger" && "bg-status-danger-soft text-status-danger",
        tone === "warning" && "bg-status-warning-soft text-status-warning",
        selected && "ring-2 ring-ring/50"
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="relative flex size-4 shrink-0 items-center justify-center rounded-sm opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
      >
        <X />
      </button>
    </NodeViewWrapper>
  )
}

function AttachmentChipView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const { t } = useTranslation()
  const attrs = node.attrs as AttachmentChipAttrs

  return (
    <Chip
      tone={attrs.missing ? "danger" : "neutral"}
      selected={selected}
      icon={
        attrs.missing ? (
          <AlertTriangle aria-hidden />
        ) : (
          <FileTypeIcon mediaType={attrs.mediaType} fileName={attrs.fileName} />
        )
      }
      removeLabel={t("content.quickReplies.editor.removeChip", { name: attrs.label })}
      onRemove={deleteNode}
    >
      {attrs.label}
    </Chip>
  )
}

function VariableChipView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const { t } = useTranslation()
  const attrs = node.attrs as VariableChipAttrs

  return (
    <Chip
      tone={attrs.unknown ? "warning" : "neutral"}
      selected={selected}
      icon={attrs.unknown ? <AlertTriangle aria-hidden /> : <Braces aria-hidden />}
      removeLabel={t("content.quickReplies.editor.removeChip", { name: attrs.label })}
      onRemove={deleteNode}
    >
      {attrs.label}
    </Chip>
  )
}

const AttachmentCitation = Node.create({
  name: ATTACHMENT_NODE,
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: "" },
      label: { default: "" },
      mediaType: { default: null },
      fileName: { default: null },
      missing: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-attachment-citation]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-attachment-citation": "" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentChipView)
  },
})

const MessageVariable = Node.create<{ resolve: (key: string) => VariableChipAttrs }>({
  name: VARIABLE_NODE,
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return { resolve: (key) => ({ key, label: key, unknown: true }) }
  },

  addAttributes() {
    return {
      key: { default: "" },
      label: { default: "" },
      unknown: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-message-variable]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-message-variable": "" })]
  },

  // Quem escreve `{{nome}}` à mão recebe o mesmo bloco de quem escolheu na lista.
  addInputRules() {
    return [
      // Sem grupo de captura: com um, a regra troca só o que foi capturado e deixa as chaves.
      nodeInputRule({
        find: /\{\{\s*[^{}]+?\s*\}\}$/,
        type: this.type,
        getAttributes: (match) => this.options.resolve(match[0].slice(2, -2).trim()),
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableChipView)
  },
})

// Sem quebra "macia": cada linha é um parágrafo, e Shift+Enter faz o mesmo que Enter.
const LineBreaks = Extension.create({
  name: "quickReplyLineBreaks",
  addKeyboardShortcuts() {
    return { "Shift-Enter": () => this.editor.commands.splitBlock() }
  },
})

const EDITOR_CLASS =
  "min-h-28 max-h-72 overflow-y-auto px-2.5 py-2 text-base leading-6 outline-none md:text-sm [&_p]:m-0 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"

type SlashState = { query: string; from: number; to: number; top: number; left: number }
type SlashItem = { id: string; insert: () => void; leading: ReactNode; label: string; description?: string }

/**
 * O campo de texto da mensagem rápida. Anexos e variáveis são blocos que não se quebram:
 * inserem-se pela barra, por `/` no meio do texto, colando ou arrastando um arquivo, e saem
 * pelo X ou pelo Backspace. Na API o texto segue como a origem deixou.
 */
export function QuickReplyEditor({
  value,
  onChange,
  onBlur,
  attachments,
  variables,
  resolvers,
  label,
  placeholder,
  id,
  disabled = false,
  "aria-invalid": ariaInvalid = false,
  "aria-describedby": ariaDescribedBy,
  editorRef,
}: QuickReplyEditorProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { uploadAttachment } = useAttachmentMutations()

  const frameRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number }[]>([])

  // As extensões e os atalhos nascem uma vez só: leem sempre a versão atual por aqui.
  const latest = useRef({ resolvers, onChange, slashItems: [] as SlashItem[] })
  latest.current.resolvers = resolvers
  latest.current.onChange = onChange

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder }),
      AttachmentCitation,
      MessageVariable.configure({ resolve: (key) => latest.current.resolvers.variable(key) }),
      LineBreaks,
    ],
    [placeholder]
  )

  const editorInstance = useRef<Editor | null>(null)

  /* ---------- enviar arquivo de dentro do texto ---------- */

  const insertAttachment = useCallback((attachment: Attachment) => {
    const editor = editorInstance.current
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent(
        attachmentNode({
          id: attachment.id,
          label: attachment.name,
          mediaType: attachment.file?.contentType ?? null,
          fileName: attachment.file?.filename ?? null,
          missing: false,
        })
      )
      .run()
  }, [])

  const uploadFiles = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        if (file.size > MAX_FILE_BYTES) {
          toast.error(t("content.attachments.upload.tooLarge", { name: file.name }))
          return
        }
        const uploadId = crypto.randomUUID()
        setUploads((current) => [...current, { id: uploadId, name: file.name, progress: 0 }])
        uploadAttachment(file, {
          onProgress: (progress) =>
            setUploads((current) =>
              current.map((item) => (item.id === uploadId ? { ...item, progress } : item))
            ),
        })
          .then(insertAttachment)
          .catch((cause: unknown) => toast.error(contentErrorMessage(t, cause)))
          .finally(() =>
            setUploads((current) => current.filter((item) => item.id !== uploadId))
          )
      })
    },
    [insertAttachment, t, uploadAttachment]
  )

  /* ---------- `/` no meio do texto ---------- */

  const [slash, setSlash] = useState<SlashState | null>(null)
  const [highlight, setHighlight] = useState(0)
  // Os atalhos de teclado nascem uma vez só, e leem o estado atual por aqui.
  const slashRef = useRef(slash)
  slashRef.current = slash
  const highlightRef = useRef(highlight)
  highlightRef.current = highlight
  // Esc fecha a lista, e ela não volta para esta mesma barra enquanto a pessoa continua digitando.
  const dismissedAt = useRef<number | null>(null)

  const syncSlash = useCallback((editor: Editor) => {
    const { selection } = editor.state
    if (!selection.empty) {
      setSlash(null)
      return
    }

    const { $from } = selection
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, OBJECT_REPLACEMENT)
    const match = SLASH_QUERY.exec(before)
    if (!match) {
      dismissedAt.current = null
      setSlash(null)
      return
    }

    const to = $from.pos
    const from = to - match[1].length - 1
    if (dismissedAt.current === from) {
      setSlash(null)
      return
    }

    const frame = frameRef.current?.getBoundingClientRect()
    const caret = editor.view.coordsAtPos(from)
    setSlash({
      query: match[1],
      from,
      to,
      top: frame ? caret.bottom - frame.top + 4 : 0,
      left: frame ? Math.max(0, Math.min(caret.left - frame.left, frame.width - 288)) : 0,
    })
    setHighlight(0)
  }, [])

  const editorProps = useMemo(
    () => ({
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        "aria-invalid": String(ariaInvalid),
        ...(ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {}),
        class: EDITOR_CLASS,
      },
      handleKeyDown: (_view: EditorView, event: KeyboardEvent) => {
        if (
          event.key.toLowerCase() === "a" &&
          event.shiftKey &&
          (event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault()
          setAttachmentsOpen(true)
          return true
        }

        const items = latest.current.slashItems
        const menu = slashRef.current
        if (!menu) return false

        if (event.key === "Escape") {
          // Fecha só a lista, não o painel em volta.
          event.stopPropagation()
          dismissedAt.current = menu.from
          setSlash(null)
          return true
        }
        if (items.length === 0) return false

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1
          setHighlight((current) => (current + step + items.length) % items.length)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          items[highlightRef.current]?.insert()
          return true
        }
        return false
      },
      handlePaste: (view: EditorView, event: ClipboardEvent) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (files.length > 0) {
          uploadFiles(files)
          return true
        }
        // Sempre como texto: formatação de fora não existe aqui, e `{{nome}}` colado vira bloco.
        const text = event.clipboardData?.getData("text/plain")
        if (!text) return false
        const doc = view.state.schema.nodeFromJSON(contentToDoc(text, latest.current.resolvers))
        view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(doc.content)).scrollIntoView())
        return true
      },
      handleDrop: (_view: EditorView, event: DragEvent) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (files.length === 0) return false
        event.preventDefault()
        uploadFiles(files)
        return true
      },
      clipboardTextSerializer: (slice: Slice) => docToContent(slice.content),
    }),
    [ariaDescribedBy, ariaInvalid, id, label, uploadFiles]
  )

  const [initialContent] = useState(() => contentToDoc(value, resolvers))

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !disabled,
    editorProps,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: current }) => {
      latest.current.onChange(docToContent(current.state.doc.content))
      syncSlash(current)
    },
    onSelectionUpdate: ({ editor: current }) => syncSlash(current),
    onBlur: () => {
      setSlash(null)
      onBlur?.()
    },
  })
  editorInstance.current = editor

  useImperativeHandle(editorRef, () => ({ focus: () => editor?.commands.focus() }), [editor])

  // O formulário mudou o valor por fora (`form.reset`): o documento acompanha.
  useEffect(() => {
    if (!editor || value === docToContent(editor.state.doc.content)) return
    editor.commands.setContent(contentToDoc(value, latest.current.resolvers), {
      emitUpdate: false,
    })
  }, [editor, value])

  // O rótulo de um campo próprio não sabe focar um `contenteditable`: fazemos por ele.
  useEffect(() => {
    if (!id || !editor) return
    const labelElement = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
    if (!labelElement) return
    const focus = () => editor.commands.focus()
    labelElement.addEventListener("click", focus)
    return () => labelElement.removeEventListener("click", focus)
  }, [editor, id])

  /* ---------- o que entra pela barra e por `/` ---------- */

  const insertVariable = useCallback(
    (option: VariableOption, range?: { from: number; to: number }) => {
      const current = editorInstance.current
      if (!current) return
      const node = variableNode({ key: option.key, label: option.label, unknown: false })
      const chain = current.chain().focus()
      if (range) chain.deleteRange(range)
      chain.insertContent(node).run()
    },
    []
  )

  const insertAttachmentAt = useCallback(
    (attachment: Attachment, range: { from: number; to: number }) => {
      editorInstance.current?.chain().focus().deleteRange(range).run()
      insertAttachment(attachment)
    },
    [insertAttachment]
  )

  const describeFile = useCallback(
    (attachment: Attachment) =>
      [
        getFileExtension(attachment.file?.filename),
        attachment.file ? formatFileSize(attachment.file.byteSize, language) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [language]
  )

  const slashItems = useMemo<SlashItem[]>(() => {
    if (!slash) return []
    const range = { from: slash.from, to: slash.to }

    const variableItems = variables
      .filter((option) => matchesSearch(`${option.label} ${option.key}`, slash.query))
      .map((option) => ({
        id: `variable-${option.key}`,
        insert: () => insertVariable(option, range),
        leading: (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Braces aria-hidden className="size-3.5" />
          </span>
        ),
        label: option.label,
        description: t("content.quickReplies.editor.variableItem"),
      }))

    const attachmentItems = attachments
      .filter((item) =>
        matchesSearch(`${item.name} ${item.file?.filename ?? ""}`, slash.query)
      )
      .map((item) => ({
        id: `attachment-${item.id}`,
        insert: () => insertAttachmentAt(item, range),
        leading: (
          <span className="size-7 shrink-0 overflow-hidden rounded-md">
            <AttachmentThumb file={item.file} iconClassName="size-3.5" />
          </span>
        ),
        label: item.name,
        description: describeFile(item),
      }))

    return [...attachmentItems, ...variableItems].slice(0, SLASH_LIMIT)
  }, [attachments, describeFile, insertAttachmentAt, insertVariable, slash, t, variables])

  latest.current.slashItems = slashItems

  // Uma lista sem resultado e um espaço no meio é texto comum, não mais uma busca.
  const showSlash = slash && (slashItems.length > 0 || !slash.query.includes(" "))

  const variableGroups = useMemo<PickerGroup[]>(() => {
    const toItem = (option: VariableOption) => ({
      id: option.key,
      label: option.label,
      description: `{{${option.key}}}`,
      onSelect: () => insertVariable(option),
    })
    return (["contact", "team", "fields"] as const)
      .map((group) => ({
        id: group,
        label: t(`content.quickReplies.editor.variableGroups.${group}`),
        items: variables.filter((option) => option.group === group).map(toItem),
      }))
      .filter((group) => group.items.length > 0)
  }, [insertVariable, t, variables])

  const attachmentGroups = useMemo<PickerGroup[]>(
    () =>
      ATTACHMENT_KINDS.map((kind) => ({
        id: kind,
        label: t(`content.attachments.kinds.${kind}`),
        items: attachments
          .filter((item) => attachmentKindOf(item.file) === kind)
          .map((item) => ({
            id: item.id,
            label: item.name,
            description: describeFile(item),
            leading: (
              <span className="size-8 shrink-0 overflow-hidden rounded-md">
                <AttachmentThumb file={item.file} />
              </span>
            ),
            onSelect: () => insertAttachment(item),
          })),
      })).filter((group) => group.items.length > 0),
    [attachments, describeFile, insertAttachment, t]
  )

  const length = visibleLength(value)
  const uploading = uploads.length > 0

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={frameRef}
        className={cn(
          "relative rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          ariaInvalid &&
            "border-destructive ring-3 ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
          disabled && "opacity-60"
        )}
      >
        <div className="flex flex-wrap items-center gap-1 border-b px-1.5 py-1">
          <InsertPicker
            open={variablesOpen}
            onOpenChange={setVariablesOpen}
            title={t("content.quickReplies.editor.insertVariable")}
            groups={variableGroups}
            searchPlaceholder={t("content.quickReplies.editor.searchVariable")}
            emptyLabel={t("content.quickReplies.editor.noVariables")}
            trigger={
              <Button type="button" variant="ghost" size="sm" disabled={disabled} className="text-muted-foreground">
                <Braces />
                {t("content.quickReplies.editor.variable")}
              </Button>
            }
          />
          <InsertPicker
            open={attachmentsOpen}
            onOpenChange={setAttachmentsOpen}
            title={t("content.quickReplies.editor.insertAttachment")}
            groups={attachmentGroups}
            searchPlaceholder={t("content.quickReplies.editor.searchAttachment")}
            emptyLabel={t("content.quickReplies.editor.noAttachments")}
            trigger={
              <Button type="button" variant="ghost" size="sm" disabled={disabled} className="text-muted-foreground">
                <Paperclip />
                {t("content.quickReplies.editor.attachment")}
                {attachments.length > 0 ? (
                  <span className="text-xs tabular-nums">
                    {formatNumber(attachments.length, language)}
                  </span>
                ) : null}
              </Button>
            }
            footer={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-10"
                onClick={() => {
                  setAttachmentsOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                <Upload />
                {t("content.quickReplies.editor.uploadNew")}
              </Button>
            }
          />
          <span className="ml-auto hidden px-1.5 text-xs text-muted-foreground sm:inline">
            {t("content.quickReplies.editor.slashHint")}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            uploadFiles(Array.from(event.target.files ?? []))
            // Escolher o mesmo arquivo de novo precisa disparar o evento.
            event.target.value = ""
          }}
        />

        <EditorContent editor={editor} />

        {showSlash ? (
          <div
            role="listbox"
            aria-label={t("content.quickReplies.editor.slashLabel")}
            // Sem isto o clique tiraria o foco do texto antes de inserir.
            onMouseDown={(event) => event.preventDefault()}
            style={{ top: slash.top, left: slash.left }}
            className="absolute z-20 w-72 max-w-full overflow-hidden rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
          >
            {slashItems.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("content.picker.noMatch")}
              </p>
            ) : (
              slashItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  onClick={item.insert}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left outline-none pointer-coarse:min-h-11",
                    index === highlight && "bg-muted"
                  )}
                >
                  {item.leading}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {uploading ? (
        <ul aria-live="polite" className="flex flex-col gap-1">
          {uploads.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 aria-hidden className="size-3 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1 truncate">
                {t("content.quickReplies.editor.uploading", { name: item.name })}
              </span>
              <Progress
                value={Math.round(item.progress * 100)}
                aria-label={t("content.quickReplies.editor.uploading", { name: item.name })}
                className="w-16 gap-0"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <p
        className={cn(
          "self-end text-xs tabular-nums",
          length > QUICK_REPLY_MAX_LENGTH
            ? "text-destructive"
            : length >= QUICK_REPLY_MAX_LENGTH * 0.9
              ? "text-status-warning"
              : "text-muted-foreground"
        )}
      >
        {formatNumber(length, language)}/{formatNumber(QUICK_REPLY_MAX_LENGTH, language)}
      </p>
    </div>
  )
}
