import { useState } from "react"
import { useTranslation } from "react-i18next"
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react"

import { FileTypeIcon } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsTouch } from "@/hooks/use-media-query"
import { apiAssetUrl } from "@/lib/api"
import { previewKindOf } from "@/lib/content/attachment-file"
import type { AttachmentFile } from "@/lib/content/types"
import { formatFileSize, getFileExtension } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

/** Ver o arquivo sem baixar: imagem com zoom, vídeo, áudio e PDF. O resto diz o que é. */
export function AttachmentViewer({ file, name }: { file: AttachmentFile; name: string }) {
  const isTouch = useIsTouch()
  const [failed, setFailed] = useState(false)
  const kind = previewKindOf(file)
  const url = apiAssetUrl(file.url)

  if (failed) return <NoPreview file={file} />

  switch (kind) {
    case "image":
      return <ImageViewer src={url} alt={name} onError={() => setFailed(true)} />
    case "video":
      return (
        <video
          src={url}
          controls
          preload="metadata"
          onError={() => setFailed(true)}
          className="max-h-[60dvh] w-full rounded-lg bg-muted"
        />
      )
    case "audio":
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-muted px-4 py-6">
          <span className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground">
            <FileTypeIcon mediaType={file.contentType} fileName={file.filename} className="size-5" />
          </span>
          <audio
            src={url}
            controls
            preload="metadata"
            onError={() => setFailed(true)}
            className="w-full max-w-sm"
          />
        </div>
      )
    case "pdf":
      // Navegador de celular não mostra PDF dentro de página: lá, os botões do topo é que abrem.
      return isTouch ? (
        <NoPreview file={file} />
      ) : (
        <iframe title={name} src={url} className="h-96 w-full rounded-lg bg-muted md:h-[28rem]" />
      )
    default:
      return <NoPreview file={file} />
  }
}

function ImageViewer({ src, alt, onError }: { src: string; alt: string; onError: () => void }) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(1)
  const fitted = zoom === 1

  const controls = [
    {
      label: t("content.attachments.viewer.zoomOut"),
      icon: <ZoomOut />,
      disabled: zoom <= MIN_ZOOM,
      onClick: () => setZoom((current) => Math.max(current - ZOOM_STEP, MIN_ZOOM)),
    },
    {
      label: t("content.attachments.viewer.zoomReset"),
      icon: <RotateCcw />,
      disabled: fitted,
      onClick: () => setZoom(1),
    },
    {
      label: t("content.attachments.viewer.zoomIn"),
      icon: <ZoomIn />,
      disabled: zoom >= MAX_ZOOM,
      onClick: () => setZoom((current) => Math.min(current + ZOOM_STEP, MAX_ZOOM)),
    },
  ]

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex gap-0.5 rounded-lg bg-background/90 p-0.5 shadow-sm ring-1 ring-foreground/10">
        {controls.map((control) => (
          <Tooltip key={control.label}>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={control.label}
                  disabled={control.disabled}
                  onClick={control.onClick}
                />
              }
            >
              {control.icon}
            </TooltipTrigger>
            <TooltipContent>{control.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* Largura, e não `scale`: é ela que faz a área rolar para ver o resto da imagem. */}
      <div
        className={cn(
          "flex h-72 overflow-auto rounded-lg bg-muted md:h-96",
          fitted && "items-center justify-center"
        )}
      >
        <img
          src={src}
          alt={alt}
          onError={onError}
          style={fitted ? undefined : { width: `${zoom * 100}%`, maxWidth: "none" }}
          className={cn(fitted ? "size-full object-contain" : "m-auto h-auto shrink-0")}
        />
      </div>
    </div>
  )
}

function NoPreview({ file }: { file: AttachmentFile }) {
  const { t } = useTranslation()
  const language = useLanguage()

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-muted px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-background text-muted-foreground">
        <FileTypeIcon mediaType={file.contentType} fileName={file.filename} className="size-5" />
      </span>
      <p className="text-sm font-medium">{t("content.attachments.viewer.noPreviewTitle")}</p>
      <p className="max-w-xs text-sm text-pretty text-muted-foreground">
        {t("content.attachments.viewer.noPreviewDescription")}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {[getFileExtension(file.filename), formatFileSize(file.byteSize, language)]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  )
}
