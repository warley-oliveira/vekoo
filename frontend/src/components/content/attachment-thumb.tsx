import { useState } from "react"

import { FileTypeIcon } from "@/components/shared"
import { apiAssetUrl } from "@/lib/api"
import { previewKindOf } from "@/lib/content/attachment-file"
import type { AttachmentFile } from "@/lib/content/types"
import { cn } from "@/lib/utils"

type AttachmentThumbProps = {
  file: AttachmentFile | null
  /** Só a miniatura de imagem é conteúdo; o ícone é decoração, com o nome ao lado. */
  alt?: string
  className?: string
  iconClassName?: string
}

/** A imagem do anexo, ou o ícone do tipo quando não há imagem ou o link quebrou. */
export function AttachmentThumb({ file, alt = "", className, iconClassName }: AttachmentThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const url = file && previewKindOf(file) === "image" ? apiAssetUrl(file.url) : null

  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setFailedUrl(url)}
        className={cn("size-full object-cover", className)}
      />
    )
  }

  return (
    <span
      className={cn(
        "flex size-full items-center justify-center bg-muted text-muted-foreground",
        className
      )}
    >
      <FileTypeIcon
        mediaType={file?.contentType}
        fileName={file?.filename}
        className={cn("size-4", iconClassName)}
      />
    </span>
  )
}
