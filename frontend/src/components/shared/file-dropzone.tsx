import { useCallback, useEffect, useRef, useState } from "react"
import { useDropzone, type Accept, type FileRejection } from "react-dropzone"
import { useTranslation } from "react-i18next"
import { RotateCcw, UploadCloud, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useIsTouch } from "@/hooks/use-media-query"
import { ApiError, apiUpload } from "@/lib/api"
import { formatFileSize, getFileExtension, getFileKind } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { FileTypeIcon } from "./file-type-icon"

export type DropzoneFileStatus = "idle" | "uploading" | "done" | "error"

export type DropzoneFile = {
  id: string
  /** O arquivo local. Ausente em anexos que já estavam no servidor. */
  file?: File
  name: string
  size: number
  type: string
  /** Prévia: `blob:` do arquivo local ou a URL de quem já está no servidor. */
  previewUrl?: string
  status: DropzoneFileStatus
  /** De 0 a 1, enquanto envia. */
  progress: number
  error?: string
  /** O que a API respondeu ao envio. */
  response?: unknown
}

export type DropzoneUpload = {
  /** Caminho da API: `/attachments`. */
  path?: string
  /** Nome do campo no multipart. */
  fieldName?: string
  /** Campos a mais no mesmo envio. */
  fields?: Record<string, string>
  /** Transporte próprio no lugar de `path`, como uma URL pré-assinada. */
  send?: (
    file: File,
    options: { onProgress: (fraction: number) => void; signal: AbortSignal }
  ) => Promise<unknown>
  onSuccess?: (response: unknown, file: DropzoneFile) => void
}

export type FileDropzoneProps = {
  /** Lista controlada. Sem ela, o componente guarda a própria lista. */
  value?: DropzoneFile[]
  onChange?: (files: DropzoneFile[]) => void
  /** `{ "image/*": [] }` ou `{ "application/pdf": [".pdf"] }`. */
  accept?: Accept
  /** Tamanho máximo de cada arquivo, em bytes. */
  maxSize?: number
  /** Com 1, um arquivo novo substitui o atual. */
  maxFiles?: number
  /** Envia assim que entra, com progresso. Sem isto, os arquivos só ficam na lista. */
  upload?: DropzoneUpload
  /** Texto de apoio no lugar do resumo automático de tipos e limites. */
  hint?: string
  disabled?: boolean
  id?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  className?: string
}

let nextId = 0

function toDropzoneFile(file: File): DropzoneFile {
  return {
    id: `dropzone-${++nextId}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl: getFileKind(file.type, file.name) === "image" ? URL.createObjectURL(file) : undefined,
    status: "idle",
    progress: 0,
  }
}

function releasePreview(file: DropzoneFile) {
  if (file.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(file.previewUrl)
}

const MAJOR_TYPES = ["image", "video", "audio"] as const

function isMajorType(type: string): type is (typeof MAJOR_TYPES)[number] {
  return (MAJOR_TYPES as readonly string[]).includes(type)
}

/**
 * Enviar arquivos: arrastar, clicar ou tocar, com limite de tipo, tamanho e quantidade
 * explicado antes do erro, prévia de imagem, progresso, cancelar e tentar de novo.
 */
export function FileDropzone({
  value,
  onChange,
  accept,
  maxSize,
  maxFiles,
  upload,
  hint,
  disabled = false,
  id,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: FileDropzoneProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isTouch = useIsTouch()

  const [internal, setInternal] = useState<DropzoneFile[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const files = value ?? internal

  // O progresso chega várias vezes entre dois renders: cada alteração parte do que já
  // foi aplicado, e não do `value` da última renderização.
  const latest = useRef(files)
  latest.current = files
  const controllers = useRef(new Map<string, AbortController>())

  const commit = useCallback(
    (next: DropzoneFile[]) => {
      latest.current = next
      setInternal(next)
      onChange?.(next)
    },
    [onChange]
  )

  const patch = useCallback(
    (fileId: string, changes: Partial<DropzoneFile>) => {
      commit(
        latest.current.map((item) => (item.id === fileId ? { ...item, ...changes } : item))
      )
    },
    [commit]
  )

  const send = useCallback(
    async (item: DropzoneFile) => {
      if (!upload || !item.file) return

      const controller = new AbortController()
      controllers.current.set(item.id, controller)
      patch(item.id, { status: "uploading", progress: 0, error: undefined })

      const options = {
        signal: controller.signal,
        onProgress: (progress: number) => patch(item.id, { progress }),
      }

      try {
        let response: unknown
        if (upload.send) {
          response = await upload.send(item.file, options)
        } else {
          const body = new FormData()
          body.append(upload.fieldName ?? "file", item.file)
          Object.entries(upload.fields ?? {}).forEach(([key, field]) => body.append(key, field))
          response = await apiUpload(upload.path ?? "", body, options)
        }
        patch(item.id, { status: "done", progress: 1, response })
        upload.onSuccess?.(response, { ...item, status: "done", progress: 1, response })
      } catch (cause) {
        if (controller.signal.aborted) return
        patch(item.id, {
          status: "error",
          error:
            cause instanceof ApiError && cause.serverMessage
              ? cause.serverMessage
              : t("kit.dropzone.uploadFailed"),
        })
      } finally {
        controllers.current.delete(item.id)
      }
    },
    [patch, t, upload]
  )

  function remove(item: DropzoneFile) {
    controllers.current.get(item.id)?.abort()
    releasePreview(item)
    commit(latest.current.filter((other) => other.id !== item.id))
  }

  // Ao sair da tela: nada de envio órfão. Com lista controlada, as prévias continuam
  // sendo do pai, que pode remontar este componente e mostrá-las de novo.
  const controlled = value !== undefined
  useEffect(() => {
    const active = controllers.current
    return () => {
      active.forEach((controller) => controller.abort())
      if (!controlled) latest.current.forEach(releasePreview)
    }
  }, [controlled])

  const single = maxFiles === 1
  const remaining =
    maxFiles === undefined || single ? undefined : Math.max(0, maxFiles - files.length)
  const full = remaining === 0

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setRejections(
        rejected.map(({ file, errors }) => {
          const code = errors[0]?.code
          if (code === "file-too-large") {
            return t("kit.dropzone.tooLarge", {
              name: file.name,
              max: formatFileSize(maxSize, language),
            })
          }
          if (code === "file-invalid-type") {
            return t("kit.dropzone.invalidType", { name: file.name })
          }
          if (code === "too-many-files") {
            return t("kit.dropzone.tooMany", { name: file.name, count: maxFiles ?? 0 })
          }
          return t("kit.dropzone.rejected", { name: file.name })
        })
      )

      if (accepted.length === 0) return

      const added = accepted.map(toDropzoneFile)
      if (single) latest.current.forEach((item) => remove(item))
      commit([...latest.current, ...added])
      if (upload) added.forEach((item) => void send(item))
    },
    // `remove` só lê refs e `commit`.
    [commit, language, maxFiles, maxSize, send, single, t, upload]
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept,
    maxSize,
    maxFiles: remaining,
    multiple: !single,
    disabled: disabled || full,
    onDrop,
  })

  // "PNG, JPG" quando há extensões; "Imagem" quando o aceite é um tipo inteiro.
  const types = Object.entries(accept ?? {}).flatMap(([mime, extensions]) => {
    const list = typeof extensions === "string" ? [extensions] : extensions
    if (list.length > 0) {
      return list.map((extension) => extension.replace(".", "").toUpperCase())
    }
    const major = mime.split("/")[0]
    return isMajorType(major) ? [t(`kit.dropzone.types.${major}`)] : []
  })
  const summary = [
    types.length > 0 ? types.join(", ") : null,
    maxSize ? t("kit.dropzone.upTo", { max: formatFileSize(maxSize, language) }) : null,
    maxFiles && !single ? t("kit.dropzone.maxFiles", { count: maxFiles }) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        {...getRootProps({
          role: "button",
          "aria-disabled": disabled || full,
          "aria-invalid": ariaInvalid,
          "aria-describedby": ariaDescribedBy,
          "aria-label": t("kit.dropzone.choose"),
        })}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          isDragActive && "border-primary bg-accent/50",
          isDragReject && "border-destructive bg-destructive/5",
          ariaInvalid && "border-destructive",
          (disabled || full) && "cursor-not-allowed opacity-60 hover:bg-transparent"
        )}
      >
        <input {...getInputProps({ id })} />
        <UploadCloud aria-hidden className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">
          {isDragReject
            ? t("kit.dropzone.dragReject")
            : isDragActive
              ? t("kit.dropzone.dragActive")
              : full
                ? t("kit.dropzone.full")
                : isTouch
                  ? t("kit.dropzone.promptTouch")
                  : t("kit.dropzone.prompt")}
        </p>
        {hint || summary ? (
          <p className="text-xs text-muted-foreground">{hint ?? summary}</p>
        ) : null}
      </div>

      {rejections.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-0.5 text-xs text-destructive">
          {rejections.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {files.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2.5 rounded-lg border p-2"
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <FileTypeIcon mediaType={item.type} fileName={item.name} className="size-4" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.status === "uploading" ? (
                  <Progress
                    value={Math.round(item.progress * 100)}
                    aria-label={t("kit.dropzone.uploading", { name: item.name })}
                    className="gap-0"
                  />
                ) : item.status === "error" ? (
                  <p role="alert" className="truncate text-xs text-destructive">
                    {item.error}
                  </p>
                ) : (
                  <p className="truncate text-xs text-muted-foreground tabular-nums">
                    {[getFileExtension(item.name), formatFileSize(item.size, language)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {item.status === "error" && upload && item.file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("kit.dropzone.retry", { name: item.name })}
                  onClick={() => void send(item)}
                >
                  <RotateCcw />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={
                  item.status === "uploading"
                    ? t("kit.dropzone.cancel", { name: item.name })
                    : t("kit.dropzone.remove", { name: item.name })
                }
                className="text-muted-foreground"
                onClick={() => remove(item)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
