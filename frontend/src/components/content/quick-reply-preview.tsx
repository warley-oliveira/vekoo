import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"

import { FileTypeIcon } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import { previewKindOf } from "@/lib/content/attachment-file"
import {
  splitMessageParts,
  tokenizeContent,
  variableValue,
  type MessagePart,
  type QuickReplyContext,
} from "@/lib/content/quick-reply-content"
import type { Attachment, CustomField } from "@/lib/content/types"
import { formatTime } from "@/lib/date-format"
import { formatFileSize, getFileExtension } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { deriveCustomFieldKey } from "@/lib/content/normalization"

type QuickReplyPreviewProps = {
  content: string
  attachments: Attachment[] | undefined
  customFields: CustomField[] | undefined
  /** Os dados de exemplo no lugar das variáveis. */
  context: QuickReplyContext
}

const BUBBLE =
  "max-w-[85%] rounded-lg rounded-tr-sm bg-status-success-soft text-sm shadow-xs"

/**
 * Como o contato recebe a mensagem, uma bolha por parte, na ordem do envio. É uma aproximação
 * do WhatsApp em tons do próprio tema: o que interessa é o texto, a ordem e o que vai junto.
 */
export function QuickReplyPreview({
  content,
  attachments,
  customFields,
  context,
}: QuickReplyPreviewProps) {
  const { t } = useTranslation()
  const language = useLanguage()

  const parts = useMemo(() => splitMessageParts(content), [content])
  const attachmentsById = useMemo(
    () => new Map((attachments ?? []).map((item) => [item.id, item])),
    [attachments]
  )
  const fieldsByKey = useMemo(
    () => new Map((customFields ?? []).map((field) => [field.key, field])),
    [customFields]
  )

  /** Valor de exemplo, com o nome do campo quando não há exemplo de verdade para mostrar. */
  function sample(key: string) {
    const known = variableValue(key, context)
    if (known) return { text: known, placeholder: false }
    const field = fieldsByKey.get(key) ?? fieldsByKey.get(deriveCustomFieldKey(key))
    if (field?.defaultValue) return { text: field.defaultValue, placeholder: false }
    return { text: field?.name ?? key, placeholder: true }
  }

  if (parts.length === 0) {
    return (
      <div className="rounded-xl bg-muted/70 px-4 py-8 text-center text-sm text-pretty text-muted-foreground">
        {t("content.quickReplies.preview.empty")}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5 rounded-xl bg-muted/70 p-3">
      {parts.map((part, index) => (
        <Part
          key={`${part.kind}-${index}`}
          part={part}
          attachment={
            part.kind === "attachment" ? attachmentsById.get(part.id) : undefined
          }
          libraryLoaded={attachments !== undefined}
          renderText={(text) =>
            tokenizeContent(text).map((token, position) => {
              if (token.type === "variable") {
                const value = sample(token.key)
                return (
                  <span
                    key={position}
                    className={
                      value.placeholder
                        ? "rounded-sm bg-foreground/10 px-1 text-muted-foreground"
                        : "underline decoration-foreground/30 decoration-dotted underline-offset-2"
                    }
                  >
                    {value.text}
                  </span>
                )
              }
              return <span key={position}>{token.type === "text" ? token.text : null}</span>
            })
          }
        />
      ))}
      <span className="pr-1 text-[0.6875rem] text-muted-foreground tabular-nums">
        {formatTime(new Date(), language)}
      </span>
    </div>
  )
}

function Part({
  part,
  attachment,
  libraryLoaded,
  renderText,
}: {
  part: MessagePart
  attachment: Attachment | undefined
  libraryLoaded: boolean
  renderText: (text: string) => ReactNode
}) {
  const { t } = useTranslation()
  const language = useLanguage()

  if (part.kind === "text") {
    return (
      <p className={`${BUBBLE} px-2.5 py-1.5 whitespace-pre-wrap wrap-anywhere`}>
        {renderText(part.text)}
      </p>
    )
  }

  if (part.kind === "imageLink") {
    return (
      <div className={`${BUBBLE} overflow-hidden p-1`}>
        <img src={part.url} alt="" className="max-h-48 w-56 max-w-full rounded-md object-cover" />
      </div>
    )
  }

  const file = attachment?.file

  if (!file) {
    if (!libraryLoaded) return null
    return (
      <div className={`${BUBBLE} flex items-start gap-2 px-2.5 py-2 text-status-danger`}>
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 text-pretty">{t("content.quickReplies.preview.missing")}</span>
      </div>
    )
  }

  const url = apiAssetUrl(file.url)

  switch (previewKindOf(file)) {
    case "image":
      return (
        <div className={`${BUBBLE} overflow-hidden p-1`}>
          <img
            src={url}
            alt={attachment.name}
            loading="lazy"
            className="max-h-48 w-56 max-w-full rounded-md object-cover"
          />
        </div>
      )
    case "video":
      return (
        <div className={`${BUBBLE} overflow-hidden p-1`}>
          <video src={url} controls preload="metadata" className="max-h-48 rounded-md" />
        </div>
      )
    case "audio":
      return (
        <div className={`${BUBBLE} w-full p-1.5`}>
          <audio src={url} controls preload="metadata" className="h-10 w-full" />
        </div>
      )
    default:
      return (
        <div className={`${BUBBLE} flex items-center gap-2.5 px-2.5 py-2`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background/70 text-muted-foreground">
            <FileTypeIcon mediaType={file.contentType} fileName={file.filename} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{file.filename}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {[getFileExtension(file.filename), formatFileSize(file.byteSize, language)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </div>
      )
  }
}
