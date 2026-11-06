import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Paperclip, Send, X } from "lucide-react"
import { toast } from "sonner"

import { FileTypeIcon, UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useIsTouch } from "@/hooks/use-media-query"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { apiAssetUrl } from "@/lib/api"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import type { PersonOption } from "@/lib/pipelines/types"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

const MAX_BODY = 20_000
const MAX_FILES = 10
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_MENTION_OPTIONS = 8

type ComposerProps = {
  placeholder: string
  submitLabel: string
  /** Responder não anexa arquivo: é só uma linha, como na origem. */
  allowFiles?: boolean
  autoFocus?: boolean
  initialBody?: string
  onSubmit: (body: string, files: File[]) => Promise<void>
  onCancel?: () => void
}

function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const { t } = useTranslation()
  // Criado e soltado no mesmo efeito: guardar o endereço em `useMemo` o deixaria morto depois do
  // efeito rodar duas vezes no modo estrito.
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file.type.startsWith("image/")) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <span className="relative inline-flex max-w-48 items-center gap-1.5 rounded-md bg-muted py-1 pr-6 pl-1.5 text-xs">
      {preview ? (
        <img src={preview} alt="" className="size-6 rounded object-cover" />
      ) : (
        <FileTypeIcon mediaType={file.type} fileName={file.name} className="size-4" />
      )}
      <span className="truncate">{file.name}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-1/2 right-0.5 size-5 -translate-y-1/2 text-muted-foreground pointer-coarse:size-8"
        aria-label={t("pipelines.comments.removeFile", { name: file.name })}
        onClick={onRemove}
      >
        <X />
      </Button>
    </span>
  )
}

/**
 * Onde se escreve um comentário: menção com @, anexo por botão ou colando, Enter envia e Shift+Enter
 * pula linha. No toque, Enter é só linha nova: o teclado do celular não tem Shift à mão.
 */
export function CommentComposer({
  placeholder,
  submitLabel,
  allowFiles = true,
  autoFocus = false,
  initialBody = "",
  onSubmit,
  onCancel,
}: ComposerProps) {
  const { t } = useTranslation()
  const isTouch = useIsTouch()
  const { people } = usePeopleOptions()

  const [body, setBody] = useState(initialBody)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const mentionOptions = useMemo(
    () =>
      mentionQuery === null
        ? []
        : people
            .filter((person) => !mentionQuery || matchesSearch(person.name, mentionQuery))
            .slice(0, MAX_MENTION_OPTIONS),
    [mentionQuery, people]
  )

  // A altura acompanha o texto, até o limite do CSS.
  useEffect(() => {
    const node = inputRef.current
    if (!node) return
    node.style.height = "auto"
    node.style.height = `${node.scrollHeight}px`
  }, [body])

  function updateMention(value: string, caret: number) {
    const match = value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u)
    setMentionQuery(match ? (match[1] ?? "") : null)
    setMentionIndex(0)
  }

  function pickMention(person: PersonOption) {
    const node = inputRef.current
    const caret = node?.selectionStart ?? body.length
    const before = body.slice(0, caret)
    const at = before.lastIndexOf("@")
    const next = `${body.slice(0, at)}@${person.name} ${body.slice(caret)}`
    setBody(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      node?.focus()
      const position = at + person.name.length + 2
      node?.setSelectionRange(position, position)
    })
  }

  function addFiles(selected: File[]) {
    const accepted = selected.filter((file) => file.size <= MAX_FILE_BYTES)
    if (accepted.length < selected.length) {
      toast.error(t("pipelines.comments.fileTooLarge"))
    }
    setFiles((current) => {
      const next = [...current, ...accepted]
      if (next.length > MAX_FILES) {
        toast.error(t("pipelines.comments.tooManyFiles", { count: MAX_FILES }))
      }
      return next.slice(0, MAX_FILES)
    })
  }

  async function submit() {
    const text = body.trim()
    if ((!text && files.length === 0) || busy) return
    setBusy(true)
    try {
      await onSubmit(text, files)
      setBody("")
      setFiles([])
      setMentionQuery(null)
    } catch (error) {
      toast.error(pipelineErrorText(t, error, "pipelines.errors.commentFailed"))
    } finally {
      setBusy(false)
    }
  }

  const canSend = (body.trim().length > 0 || files.length > 0) && !busy

  return (
    <div className="relative flex flex-col gap-2">
      {mentionOptions.length > 0 ? (
        <ul
          role="listbox"
          aria-label={t("pipelines.comments.mention")}
          className="absolute bottom-full left-0 z-20 mb-1 max-h-52 w-64 overflow-y-auto rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10"
        >
          {mentionOptions.map((person, index) => (
            <li key={person.id} role="option" aria-selected={index === mentionIndex}>
              <button
                type="button"
                onMouseDown={(event) => {
                  // Sem isto o campo perde o foco e a lista some antes do clique valer.
                  event.preventDefault()
                  pickMention(person)
                }}
                className={cn(
                  "flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm pointer-coarse:min-h-10",
                  index === mentionIndex && "bg-accent text-accent-foreground"
                )}
              >
                <UserAvatar
                  size="sm"
                  name={person.name}
                  src={person.avatarUrl ? apiAssetUrl(person.avatarUrl) : null}
                />
                <span className="truncate">{person.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <PendingFile
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() =>
                setFiles((current) => current.filter((_, position) => position !== index))
              }
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        {allowFiles ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground pointer-coarse:size-10"
              aria-label={t("pipelines.comments.attach")}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip />
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []))
                event.target.value = ""
              }}
            />
          </>
        ) : null}

        <textarea
          ref={inputRef}
          autoFocus={autoFocus}
          rows={1}
          value={body}
          maxLength={MAX_BODY}
          aria-label={placeholder}
          placeholder={placeholder}
          disabled={busy}
          onChange={(event) => {
            setBody(event.target.value)
            updateMention(event.target.value, event.target.selectionStart)
          }}
          onPaste={(event) => {
            if (!allowFiles) return
            const pasted = Array.from(event.clipboardData.items)
              .filter((item) => item.kind === "file")
              .flatMap((item) => item.getAsFile() ?? [])
            if (pasted.length > 0) addFiles(pasted)
          }}
          onKeyDown={(event) => {
            if (mentionOptions.length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setMentionIndex((index) => (index + 1) % mentionOptions.length)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setMentionIndex(
                  (index) => (index - 1 + mentionOptions.length) % mentionOptions.length
                )
                return
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault()
                const person = mentionOptions[mentionIndex]
                if (person) pickMention(person)
                return
              }
              if (event.key === "Escape") {
                event.stopPropagation()
                setMentionQuery(null)
                return
              }
            }
            if (event.key === "Enter" && !event.shiftKey && !isTouch) {
              event.preventDefault()
              void submit()
            }
            if (event.key === "Escape" && onCancel) {
              event.stopPropagation()
              onCancel()
            }
          }}
          className="max-h-32 min-h-8 min-w-0 flex-1 resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
        />

        <Button
          type="button"
          size="icon"
          className="shrink-0 pointer-coarse:size-10"
          disabled={!canSend}
          aria-label={submitLabel}
          aria-busy={busy}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground pointer-coarse:size-10"
            aria-label={t("pipelines.actions.cancel")}
            onClick={onCancel}
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
