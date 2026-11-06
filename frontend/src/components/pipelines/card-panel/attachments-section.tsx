import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Paperclip, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { FileTypeIcon, RelativeTime, useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCardAttachments } from "@/hooks/pipelines/use-card-detail"
import { apiAssetUrl } from "@/lib/api"
import { formatFileSize } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import type { CardAttachment } from "@/lib/pipelines/types"

const MAX_FILE_BYTES = 25 * 1024 * 1024

/** Os arquivos do card: enviar, abrir, apagar. */
export function AttachmentsSection({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const confirm = useConfirm()
  const { attachments, isLoading, upload, remove } = useCardAttachments(boardId, cardId)
  const [uploading, setUploading] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function send(files: File[]) {
    const accepted = files.filter((file) => file.size <= MAX_FILE_BYTES)
    if (accepted.length < files.length) toast.error(t("pipelines.attachments.tooLarge"))

    setUploading((count) => count + accepted.length)
    await Promise.all(
      accepted.map((file) =>
        upload(file)
          .catch((error: unknown) =>
            toast.error(pipelineErrorText(t, error, "pipelines.attachments.failed"))
          )
          .finally(() => setUploading((count) => count - 1))
      )
    )
  }

  async function removeOne(attachment: CardAttachment) {
    const confirmed = await confirm({
      title: t("pipelines.attachments.deleteTitle"),
      description: t("pipelines.attachments.deleteHint", { name: attachment.fileName ?? "" }),
      confirmLabel: t("pipelines.attachments.delete"),
      destructive: true,
      onConfirm: () => remove(attachment.id),
    })
    if (confirmed) toast.success(t("pipelines.attachments.deleted"))
  }

  return (
    <section aria-labelledby="card-attachments-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-attachments-title" className="text-sm font-medium">
          {t("pipelines.attachments.title")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground pointer-coarse:h-10"
          onClick={() => inputRef.current?.click()}
        >
          {uploading > 0 ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {t("pipelines.attachments.add")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            void send(Array.from(event.target.files ?? []))
            event.target.value = ""
          }}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : attachments.length === 0 && uploading === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pipelines.attachments.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="group/file flex min-h-10 items-center gap-2 rounded-lg px-1.5 hover:bg-muted/50"
            >
              <FileTypeIcon
                mediaType={attachment.contentType}
                fileName={attachment.fileName}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <a
                href={apiAssetUrl(attachment.url)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm underline-offset-2 outline-none hover:underline focus-visible:underline"
              >
                {attachment.fileName}
              </a>
              <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                {attachment.fileSize ? formatFileSize(attachment.fileSize, language) : null}
                {attachment.createdAt ? <RelativeTime value={attachment.createdAt} /> : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground opacity-0 group-focus-within/file:opacity-100 group-hover/file:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100"
                aria-label={t("pipelines.attachments.deleteOf", { name: attachment.fileName ?? "" })}
                onClick={() => void removeOne(attachment)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
