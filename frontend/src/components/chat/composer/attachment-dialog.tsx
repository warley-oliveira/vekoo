import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Plus, SendHorizontal, X } from "lucide-react"
import { toast } from "sonner"

import { FileTypeIcon, ResponsiveDialog } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ApiError } from "@/lib/api"
import { sendFiles } from "@/lib/chat/actions"
import { formatFileSize } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** O teto de `/attachments`. */
const MAX_FILE_BYTES = 100 * 1024 * 1024

export const ACCEPTED_FILES = "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"

type Item = { id: string; file: File; preview: string }

export type AttachmentDialogHandle = {
  /** Abre o seletor de arquivos do sistema. */
  pick: () => void
  /** Arquivos colados ou arrastados: abre direto a prévia. */
  add: (files: File[]) => void
}

function kindOf(file: File): "image" | "video" | "audio" | "other" {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  if (file.type.startsWith("audio/")) return "audio"
  return "other"
}

/**
 * Prévia e envio de anexos: veja o que vai, tire o que não quer, e acompanhe o progresso. O
 * envio pode ser cancelado. Se um arquivo falhar no meio, os que já saíram não voltam, e a tela diz
 * o que aconteceu com cada um.
 */
export const AttachmentDialog = memo(function AttachmentDialog({
  chatId,
  onSent,
  ref,
}: {
  chatId: string
  onSent: () => void
  ref?: Ref<AttachmentDialogHandle>
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [rejected, setRejected] = useState<string[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploading = progress !== null
  const current = items.find((item) => item.id === currentId) ?? items[0]

  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })
  useEffect(
    () => () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
    },
    []
  )

  const add = useCallback((files: File[]) => {
    if (files.length === 0) return

    const accepted = files.filter((file) => file.size <= MAX_FILE_BYTES)
    setRejected(files.filter((file) => file.size > MAX_FILE_BYTES).map((file) => file.name))

    const next = accepted.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
    }))
    setItems((list) => [...list, ...next])
    if (next[0]) setCurrentId(next[0].id)
    setError(null)
    setOpen(true)
  }, [])

  useImperativeHandle(ref, () => ({ pick: () => input.current?.click(), add }), [add])

  const reset = useCallback(() => {
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview))
    setItems([])
    setCurrentId(null)
    setRejected([])
    setError(null)
    setProgress(null)
    setOpen(false)
  }, [])

  const remove = (id: string) => {
    setItems((list) => {
      const target = list.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      const rest = list.filter((item) => item.id !== id)
      if (rest.length === 0) setOpen(false)
      return rest
    })
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    add(Array.from(event.target.files ?? []))
    // Limpa para o mesmo arquivo poder ser escolhido de novo.
    event.target.value = ""
  }

  const send = async () => {
    if (items.length === 0 || uploading) return

    controller.current = new AbortController()
    setProgress(0)
    setError(null)

    try {
      await sendFiles(
        chatId,
        items.map((item) => item.file),
        { onProgress: setProgress, signal: controller.current.signal }
      )
      onSent()
      reset()
    } catch (failure) {
      setProgress(null)
      if (failure instanceof DOMException && failure.name === "AbortError") return

      if (failure instanceof ApiError && failure.code === "attachmentSendFailed") {
        const details = failure.details as unknown as {
          files?: { name?: string; file?: string }[]
          sentMessageIds?: string[]
        }
        const sent = details?.sentMessageIds?.length ?? 0
        if (sent > 0) onSent()
        setError(t("chat.attachments.partialFailure", { count: details?.files?.length ?? 1, sent }))
        const failedNames = new Set(
          (details?.files ?? []).map((entry) => entry.name ?? entry.file).filter(Boolean)
        )
        if (failedNames.size > 0) {
          setItems((list) => list.filter((item) => failedNames.has(item.file.name)))
        }
        return
      }

      setError(
        failure instanceof ApiError && failure.serverMessage
          ? failure.serverMessage
          : t("chat.attachments.failed")
      )
      toast.error(t("chat.attachments.failed"))
    }
  }

  const count = items.length

  return (
    <>
      <input
        ref={input}
        hidden
        multiple
        type="file"
        accept={ACCEPTED_FILES}
        onChange={onInput}
        aria-label={t("chat.composer.attach")}
      />

      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (next) return
          if (uploading) controller.current?.abort()
          reset()
        }}
        size="lg"
        disablePointerDismissal
        title={t("chat.attachments.title", { count })}
        footer={
          <div className="flex w-full flex-col gap-2">
            {uploading ? (
              <Progress
                value={Math.round((progress ?? 0) * 100)}
                aria-label={t("chat.attachments.progress")}
              />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (uploading) controller.current?.abort()
                  else reset()
                }}
              >
                {t("chat.attachments.cancel")}
              </Button>
              <Button type="button" disabled={uploading || count === 0} onClick={() => void send()}>
                {uploading ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
                {uploading
                  ? t("chat.attachments.sending", {
                      percent: Math.round((progress ?? 0) * 100),
                    })
                  : t("chat.attachments.send", { count })}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {rejected.length > 0 ? (
            <p role="alert" className="text-sm text-status-warning">
              {t("chat.attachments.tooLarge", {
                count: rejected.length,
                names: rejected.join(", "),
                limit: formatFileSize(MAX_FILE_BYTES, language),
              })}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}

          {current ? (
            <div className="flex h-64 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {kindOf(current.file) === "image" ? (
                <img src={current.preview} alt={current.file.name} className="max-h-full max-w-full object-contain" />
              ) : kindOf(current.file) === "video" ? (
                <video src={current.preview} controls className="max-h-full max-w-full" />
              ) : kindOf(current.file) === "audio" ? (
                <audio src={current.preview} controls className="w-4/5" />
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 text-center">
                  <FileTypeIcon
                    mediaType={current.file.type}
                    fileName={current.file.name}
                    className="size-8 text-muted-foreground"
                  />
                  <p className="max-w-full truncate text-sm font-medium">{current.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(current.file.size, language)}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((item) => (
              <div key={item.id} className="group/tile relative shrink-0">
                <button
                  type="button"
                  aria-label={item.file.name}
                  aria-current={item.id === current?.id ? "true" : undefined}
                  disabled={uploading}
                  onClick={() => setCurrentId(item.id)}
                  className={cn(
                    "flex size-14 items-center justify-center overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    item.id === current?.id && "ring-2 ring-primary"
                  )}
                >
                  {kindOf(item.file) === "image" ? (
                    <img src={item.preview} alt="" className="size-full object-cover" />
                  ) : (
                    <FileTypeIcon
                      mediaType={item.file.type}
                      fileName={item.file.name}
                      className="size-5 text-muted-foreground"
                    />
                  )}
                </button>
                {!uploading ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    aria-label={t("chat.attachments.remove", { name: item.file.name })}
                    onClick={() => remove(item.id)}
                    className="absolute -top-1.5 -right-1.5 size-5 rounded-full border shadow-xs"
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            ))}
            {!uploading ? (
              <Button
                type="button"
                variant="outline"
                className="size-14 shrink-0 border-dashed text-muted-foreground"
                aria-label={t("chat.attachments.addMore")}
                onClick={() => input.current?.click()}
              >
                <Plus />
              </Button>
            ) : null}
          </div>
        </div>
      </ResponsiveDialog>
    </>
  )
})
