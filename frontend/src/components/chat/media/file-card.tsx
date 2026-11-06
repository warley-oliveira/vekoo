import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, Loader2 } from "lucide-react"

import { FileTypeIcon } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { formatDuration, formatFileSize, getFileExtension, toBytes } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { downloadMedia } from "@/lib/chat/media"
import type { ChatMessage } from "@/lib/chat/types"

/** O arquivo de um anexo não traz propriedades: o nome está no fim do endereço. */
function nameFromUrl(url: string | null | undefined): string | null {
  const last = url?.split("?")[0].split("/").pop()
  if (!last?.includes(".")) return null
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/** Um documento: tipo, nome, tamanho e baixar, pelo proxy da API. */
export const FileCard = memo(function FileCard({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [downloading, setDownloading] = useState(false)

  const properties = message.mediaProperties
  const realName = properties?.fileName ?? nameFromUrl(message.mediaUrl)
  const fileName = realName ?? t("chat.media.file")
  const extension = getFileExtension(realName)
  const bytes = toBytes(properties?.fileLength)
  const details = [
    extension,
    bytes > 0 ? formatFileSize(bytes, language) : null,
    properties?.seconds ? formatDuration(properties.seconds) : null,
  ].filter(Boolean)

  const download = async () => {
    if (!message.mediaUrl || downloading) return
    setDownloading(true)
    try {
      await downloadMedia(message.mediaUrl, realName)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5 rounded-xl bg-foreground/[0.04] p-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
        <FileTypeIcon
          mediaType={message.mediaType}
          fileName={realName}
          className="size-4"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={fileName}>
          {fileName}
        </span>
        {details.length > 0 ? (
          <span className="block truncate text-xs text-muted-foreground">
            {details.join(" · ")}
          </span>
        ) : null}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="pointer-coarse:size-10"
        disabled={!message.mediaUrl || downloading}
        aria-label={t("chat.media.download", { name: fileName })}
        onClick={() => void download()}
      >
        {downloading ? <Loader2 className="animate-spin" /> : <Download />}
      </Button>
    </div>
  )
})
