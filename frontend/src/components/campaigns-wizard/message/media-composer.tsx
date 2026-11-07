import { useCallback, useState } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Eye, FolderOpen, RefreshCw, SearchX, X } from "lucide-react"

import { AttachmentThumb } from "@/components/content/attachment-thumb"
import { AttachmentViewer } from "@/components/content/attachment-viewer"
import {
  Callout,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  FileDropzone,
  ResponsiveDialog,
  SearchInput,
  TablePagination,
  type DropzoneFile,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAttachmentMutations, useAttachments } from "@/hooks/content/use-attachments"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import type { Attachment, AttachmentFile, AttachmentKind } from "@/lib/content/types"
import { TextComposer } from "./text-composer"

const MEDIA_KINDS: readonly AttachmentKind[] = ["image", "video", "document"]
const MAX_MEDIA_BYTES = 100 * 1024 * 1024
const PER_PAGE = 12

const ACCEPT = {
  "image/*": [],
  "video/*": [],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
}

/** O mesmo corte do servidor: só imagem e vídeo aceitam legenda. */
export function mediaKindOf(contentType: string | null | undefined): "image" | "video" | "document" | null {
  const normalized = contentType?.toLowerCase() ?? ""
  if (normalized.startsWith("image/")) return "image"
  if (normalized.startsWith("video/")) return "video"
  if (["pdf", "document", "sheet", "presentation", "msword", "excel", "powerpoint"].some((kind) => normalized.includes(kind))) {
    return "document"
  }
  return null
}

function asFile(media: NonNullable<WizardValues["media"]>): AttachmentFile {
  return {
    id: "",
    filename: media.fileName ?? "",
    contentType: media.contentType,
    byteSize: 0,
    url: media.url ?? "",
  }
}

function LibraryDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (attachment: Attachment) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const { attachments, meta, error, isLoading, isValidating, reload } = useAttachments({
    page,
    perPage: PER_PAGE,
    search: query,
    kinds: MEDIA_KINDS,
    sortBy: "created_at",
    sortOrder: "desc",
  })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="xl"
      title={t("campaignsWizard.media.libraryTitle")}
      description={t("campaignsWizard.media.libraryHint")}
    >
      <div className="flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={(next) => {
            setQuery(next)
            setPage(1)
          }}
          loading={isValidating}
          shortcut={false}
          placeholder={t("campaignsWizard.media.librarySearch")}
        />

        {isLoading && !attachments ? (
          <CardGridSkeleton cards={6} media />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void reload()} className="border-0 p-4" />
        ) : attachments && attachments.length > 0 ? (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  <button
                    type="button"
                    onClick={() => onPick(attachment)}
                    className="flex w-full flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="block aspect-video overflow-hidden rounded-md">
                      <AttachmentThumb file={attachment.file} alt={attachment.name} />
                    </span>
                    <span className="block truncate px-0.5 text-xs font-medium">{attachment.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {meta ? (
              <TablePagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                perPage={meta.perPage}
                onPageChange={setPage}
              />
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<SearchX className="size-5" />}
            title={query ? t("campaignsWizard.media.libraryNoResults") : t("campaignsWizard.media.libraryEmpty")}
            className="border-0 p-6"
          />
        )}
      </div>
    </ResponsiveDialog>
  )
}

function MediaError() {
  const { errors } = useFormState<WizardValues>({ name: "attachmentId" })
  const message = errors.attachmentId?.message
  if (!message) return null

  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** Foto, vídeo ou arquivo: enviar agora ou escolher da biblioteca. Imagem e vídeo levam legenda. */
export function MediaComposer() {
  const { t } = useTranslation()
  const { control, setValue, clearErrors } = useFormContext<WizardValues>()
  const { uploadAttachment } = useAttachmentMutations()
  const attachmentId = useWatch({ control, name: "attachmentId" })
  const media = useWatch({ control, name: "media" })
  const [files, setFiles] = useState<DropzoneFile[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [viewing, setViewing] = useState(false)

  const pick = useCallback(
    (attachment: Attachment) => {
      setValue("attachmentId", attachment.id, { shouldDirty: true })
      setValue(
        "media",
        {
          url: attachment.file?.url ?? null,
          contentType: attachment.file?.contentType ?? null,
          fileName: attachment.name || attachment.file?.filename || null,
        },
        { shouldDirty: true }
      )
      clearErrors("attachmentId")
      setLibraryOpen(false)
      setFiles([])
    },
    [clearErrors, setValue]
  )

  function clear() {
    setValue("attachmentId", null, { shouldDirty: true })
    setValue("media", null, { shouldDirty: true })
    setFiles([])
  }

  const kind = mediaKindOf(media?.contentType)

  if (attachmentId && media) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-lg border p-2">
          <span className="size-14 shrink-0 overflow-hidden rounded-md">
            <AttachmentThumb file={asFile(media)} alt={media.fileName ?? ""} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{media.fileName}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {t(`campaignsWizard.media.kinds.${kind ?? "document"}`)}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 pointer-coarse:size-10"
            aria-label={t("campaignsWizard.media.view")}
            onClick={() => setViewing(true)}
          >
            <Eye />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 pointer-coarse:size-10"
            aria-label={t("campaignsWizard.media.change")}
            onClick={() => setLibraryOpen(true)}
          >
            <RefreshCw />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 pointer-coarse:size-10"
            aria-label={t("campaignsWizard.media.remove")}
            onClick={clear}
          >
            <X />
          </Button>
        </div>

        {kind === "document" ? (
          <Callout>{t("campaignsWizard.media.noCaption")}</Callout>
        ) : kind === null ? (
          <Callout tone="warning">{t("campaignsWizard.media.unsupported")}</Callout>
        ) : (
          <TextComposer caption />
        )}

        <LibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} onPick={pick} />
        <ResponsiveDialog
          open={viewing}
          onOpenChange={setViewing}
          title={media.fileName ?? t("campaignsWizard.media.view")}
          size="xl"
        >
          <AttachmentViewer file={asFile(media)} name={media.fileName ?? ""} />
        </ResponsiveDialog>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <FileDropzone
        value={files}
        onChange={setFiles}
        accept={ACCEPT}
        maxSize={MAX_MEDIA_BYTES}
        maxFiles={1}
        hint={t("campaignsWizard.media.hint")}
        upload={{
          send: (file, options) => uploadAttachment(file, options),
          onSuccess: (response) => pick(response as Attachment),
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="self-start pointer-coarse:h-10"
        onClick={() => setLibraryOpen(true)}
      >
        <FolderOpen />
        {t("campaignsWizard.media.fromLibrary")}
      </Button>
      <MediaError />
      <LibraryDialog open={libraryOpen} onClose={() => setLibraryOpen(false)} onPick={pick} />
    </div>
  )
}
