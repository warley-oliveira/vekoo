import { useCallback, useState, type ReactNode } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { useTranslation } from "react-i18next"
import { ImageUp, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useConfirm } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { errorMessage } from "@/lib/people/error-message"
import { cn } from "@/lib/utils"

/** A regra da API para foto e logo (`ImageUploadable`), para o erro chegar antes do envio. */
const MAX_BYTES = 2 * 1024 * 1024
const ACCEPT = { "image/jpeg": [], "image/png": [], "image/webp": [] }

type ImagePickerProps = {
  /** A imagem atual ou as iniciais: o que aparece no lugar. */
  preview: ReactNode
  hasImage: boolean
  /** Redondo para gente, quadrado para logo. */
  shape?: "circle" | "square"
  labels: {
    upload: string
    replace: string
    remove: string
    removeTitle: string
    removeDescription: string
    uploaded: string
    removed: string
  }
  onUpload: (file: File) => Promise<unknown>
  onRemove: () => Promise<unknown>
}

/** Enviar, trocar e remover uma imagem só, com o resultado ali mesmo. Aceita arrastar. */
export function ImagePicker({
  preview,
  hasImage,
  shape = "circle",
  labels,
  onUpload,
  onRemove,
}: ImagePickerProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(null)
      try {
        await onUpload(file)
        toast.success(labels.uploaded)
      } catch (cause) {
        // O motivo da recusa vem do servidor, conferido pelo conteúdo do arquivo.
        setError(
          cause instanceof ApiError && cause.details?.file?.[0]
            ? cause.details.file[0]
            : errorMessage(t, cause)
        )
      } finally {
        setBusy(false)
      }
    },
    [labels.uploaded, onUpload, t]
  )

  const onDropRejected = useCallback(
    (rejections: FileRejection[]) => {
      const code = rejections[0]?.errors[0]?.code
      setError(
        code === "file-too-large"
          ? t("kit.imagePicker.tooLarge")
          : code === "too-many-files"
            ? t("kit.imagePicker.oneAtATime")
            : t("kit.imagePicker.wrongType")
      )
    },
    [t]
  )

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: busy,
    onDropAccepted: ([file]) => void upload(file),
    onDropRejected,
  })

  async function remove() {
    setError(null)
    const confirmed = await confirm({
      title: labels.removeTitle,
      description: labels.removeDescription,
      confirmLabel: labels.remove,
      destructive: true,
      onConfirm: onRemove,
    })
    if (confirmed) toast.success(labels.removed)
  }

  return (
    <div className="flex flex-col gap-2">
      <div {...getRootProps()} className="outline-none">
        <input {...getInputProps()} aria-label={hasImage ? labels.replace : labels.upload} />
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "relative size-20 shrink-0 overflow-hidden transition-shadow",
              shape === "circle" ? "rounded-full" : "rounded-xl",
              isDragActive && "ring-3 ring-ring/50"
            )}
          >
            {preview}
            {busy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-scrim/50 text-scrim-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="pointer-coarse:h-10"
                aria-busy={busy}
                onClick={busy ? undefined : open}
              >
                <ImageUp />
                {hasImage ? labels.replace : labels.upload}
              </Button>
              {hasImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground pointer-coarse:h-10"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <Trash2 />
                  {labels.remove}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{t("kit.imagePicker.hint")}</p>
          </div>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
