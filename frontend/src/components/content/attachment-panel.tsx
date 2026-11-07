import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { Download, ExternalLink, MessageSquareText, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  FileDropzone,
  FormActions,
  FormField,
  KeyValueList,
  RelativeTime,
  ResponsiveDialog,
  TextareaField,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
  type DropzoneFile,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAttachmentMutations } from "@/hooks/content/use-attachments"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { apiAssetUrl } from "@/lib/api"
import type { Attachment, QuickReply } from "@/lib/content/types"
import { downloadFile, formatFileSize, getFileExtension } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { AttachmentViewer } from "./attachment-viewer"

const MAX_FILE_BYTES = 100 * 1024 * 1024

type AttachmentPanelProps = {
  attachment: Attachment
  /** As mensagens rápidas que citam este arquivo. `undefined` enquanto a lista não chegou. */
  usedBy: QuickReply[] | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (attachment: Attachment) => void
}

function buildSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t("content.attachments.fields.nameRequired")),
    description: z.string().nullable(),
    file: z.custom<File | null>(),
  })
}

type AttachmentValues = z.infer<ReturnType<typeof buildSchema>>

/** Ver, renomear, descrever, trocar o arquivo, baixar e saber onde ele é usado. */
export function AttachmentPanel({
  attachment,
  usedBy,
  open,
  onOpenChange,
  onDelete,
}: AttachmentPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { updateAttachment } = useAttachmentMutations()
  const file = attachment.file

  const schema = useMemo(() => buildSchema(t), [t])
  const form = useForm<AttachmentValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: attachment.name,
      description: attachment.description ?? "",
      file: null,
    },
    mode: "onBlur",
  })

  const [replacement, setReplacement] = useState<DropzoneFile[]>([])
  const close = () => onOpenChange(false)

  // Em lista controlada, a prévia `blob:` do arquivo escolhido é de quem controla.
  const replacementRef = useRef(replacement)
  replacementRef.current = replacement
  useEffect(
    () => () => {
      replacementRef.current.forEach((item) => {
        if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl)
      })
    },
    []
  )

  function clearReplacement() {
    replacementRef.current.forEach((item) => {
      if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl)
    })
    setReplacement([])
  }

  function setReplacementProgress(progress: number) {
    setReplacement((current) =>
      current.map((item) => ({ ...item, status: "uploading", progress }))
    )
  }

  const submit = useFormSubmit(form, async (values) => {
    try {
      const saved = await updateAttachment(
        attachment.id,
        {
          name: values.name,
          description: values.description?.trim() || null,
          file: values.file,
        },
        { onProgress: setReplacementProgress }
      )
      clearReplacement()
      form.reset({ name: saved.name, description: saved.description ?? "", file: null })
      toast.success(t("content.attachments.saved", { name: saved.name }))
      close()
    } catch (cause) {
      setReplacement((current) => current.map((item) => ({ ...item, status: "idle", progress: 0 })))
      throw cause
    }
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)
  const url = file ? apiAssetUrl(file.url) : null

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="xl"
      title={attachment.name}
      description={
        file
          ? [getFileExtension(file.filename), formatFileSize(file.byteSize, language)]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      headerActions={
        url && file ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("content.attachments.actions.openInNewTab")}
              nativeButton={false}
              render={<a href={url} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLink />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("content.attachments.actions.download")}
              onClick={() => void downloadFile(url, { fileName: file.filename })}
            >
              <Download />
            </Button>
          </>
        ) : undefined
      }
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t("content.attachments.submit")}
          onCancel={close}
          cancelLabel={t("content.common.close")}
          requireChanges
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-6">
        {file ? (
          <AttachmentViewer key={file.id} file={file} name={attachment.name} />
        ) : (
          <p className="rounded-lg bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
            {t("content.attachments.noFile")}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <TextField
            control={form.control}
            name="name"
            label={t("content.attachments.fields.name")}
            autoComplete="off"
          />
          <TextareaField
            control={form.control}
            name="description"
            label={t("content.attachments.fields.description")}
            placeholder={t("content.attachments.fields.descriptionPlaceholder")}
            hint={t("content.attachments.fields.descriptionHint")}
            optional
            rows={2}
          />
          <FormField
            control={form.control}
            name="file"
            label={t("content.attachments.fields.replaceFile")}
            hint={t("content.attachments.fields.replaceFileHint")}
            optional
          >
            {({ field, controlProps }) => (
              <FileDropzone
                {...controlProps}
                value={replacement}
                maxFiles={1}
                maxSize={MAX_FILE_BYTES}
                onChange={(next) => {
                  setReplacement(next)
                  field.onChange(next[0]?.file ?? null)
                }}
              />
            )}
          </FormField>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("content.attachments.details")}</h3>
          <KeyValueList
            items={[
              { label: t("content.attachments.fileName"), value: file?.filename },
              { label: t("content.attachments.fileType"), value: file?.contentType },
              {
                label: t("content.attachments.uploadedAt"),
                value: <RelativeTime value={attachment.createdAt} />,
              },
              {
                label: t("content.attachments.changedAt"),
                value: <RelativeTime value={attachment.updatedAt} />,
              },
            ]}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("content.attachments.usage.title")}</h3>
          {usedBy === undefined ? null : usedBy.length === 0 ? (
            <p className="text-sm text-pretty text-muted-foreground">
              {t("content.attachments.usage.none")}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {usedBy.map((reply) => (
                <li key={reply.id}>
                  <Link
                    to={`/settings/quick-replies?reply=${reply.id}`}
                    className="-mx-2 flex min-h-9 items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10"
                  >
                    <MessageSquareText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{reply.name}</span>
                    <code className="shrink-0 font-mono text-xs text-muted-foreground">
                      /{reply.trigger}
                    </code>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-pretty text-muted-foreground">
            {t("content.attachments.usage.scope")}
          </p>
        </section>

        <div className="border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
            onClick={() => onDelete(attachment)}
          >
            <Trash2 />
            {t("content.attachments.delete.action")}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
