import { useMemo } from "react"
import { useController, useFormState, type Control } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Plus, Trash2 } from "lucide-react"

import { DragHandle, Field, FileTypeIcon, SearchableSelect, SegmentedControl, SortableArea } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useSortableEntry } from "@/hooks/use-sortable-entry"
import type { AttachmentFile } from "@/lib/content/types"
import { getFileKind } from "@/lib/file-utils"
import type { WebhookFormValues } from "@/lib/webhooks/form"
import { newBlock } from "@/lib/webhooks/form"
import { LITERAL } from "@/lib/webhooks/literal"
import { MESSAGE_BLOCK_TYPES, type MessageBlock, type MessageBlockType } from "@/lib/webhooks/types"

import { TemplateInput } from "./template-field"

// A sequência do modo avançado: texto, imagem, vídeo, documento e áudio, na ordem em que saem. Mídia vem de um endereço,
// que pode ser variável, ou de um anexo da plataforma.

type BlockErrors = Partial<Record<keyof MessageBlock, { message?: string }>>

export function MessageBlocks({ control, index }: { control: Control<WebhookFormValues>; index: number }) {
  const { t } = useTranslation()
  const name = `actions.${index}.config.messageBlocks` as const
  const { field } = useController({ control, name })
  const { errors } = useFormState({ control, name })
  const blocks = useMemo(() => (field.value ?? []) as MessageBlock[], [field.value])
  const blockErrors = errors.actions?.[index]?.config?.messageBlocks as BlockErrors[] | undefined

  const patch = (id: string, changes: Partial<MessageBlock>) =>
    field.onChange(blocks.map((block) => (block.id === id ? { ...block, ...changes } : block)))

  return (
    <div className="flex flex-col gap-2">
      {blocks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-pretty text-muted-foreground">
          {t("webhooks.blocks.empty")}
        </p>
      ) : (
        <SortableArea
          items={blocks}
          nameOf={(block) => t(`webhooks.blocks.types.${block.type}`)}
          onReorder={(ordered) => field.onChange(ordered)}
        >
          <ul className="flex flex-col gap-2">
            {blocks.map((block, position) => (
              <BlockRow
                key={block.id}
                block={block}
                position={position}
                errors={blockErrors?.[position]}
                onChange={(changes) => patch(block.id, changes)}
                onRemove={() => field.onChange(blocks.filter((item) => item.id !== block.id))}
              />
            ))}
          </ul>
        </SortableArea>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{t("webhooks.blocks.add")}</span>
        {MESSAGE_BLOCK_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            className="border-dashed pointer-coarse:h-10"
            onClick={() => field.onChange([...blocks, newBlock(type)])}
          >
            <Plus />
            {t(`webhooks.blocks.types.${type}`)}
          </Button>
        ))}
      </div>
    </div>
  )
}

function BlockRow({
  block,
  position,
  errors,
  onChange,
  onRemove,
}: {
  block: MessageBlock
  position: number
  errors?: BlockErrors
  onChange: (changes: Partial<MessageBlock>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { setNodeRef, style, handleProps } = useSortableEntry(block.id)
  const isText = block.type === "text"
  const source = block.mediaSource ?? "url"

  return (
    <li ref={setNodeRef} style={style} className="flex flex-col gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <DragHandle label={t("webhooks.blocks.reorder", { position: position + 1 })} className="pointer-coarse:size-10" {...handleProps} />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{position + 1}</span>
        <span className="flex-1 text-sm font-medium">{t(`webhooks.blocks.types.${block.type}`)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("webhooks.blocks.remove", { position: position + 1 })}
          className="text-muted-foreground hover:text-status-danger pointer-coarse:size-10"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      {isText ? (
        <Field label={t("webhooks.blocks.text")} error={errors?.content?.message}>
          {(control) => (
            <TemplateInput
              {...control}
              rows={3}
              value={block.content ?? ""}
              placeholder={t("webhooks.blocks.textPlaceholder", LITERAL)}
              onChange={(content) => onChange({ content })}
            />
          )}
        </Field>
      ) : (
        <>
          <SegmentedControl
            aria-label={t("webhooks.blocks.source")}
            value={source}
            onChange={(next) => onChange({ mediaSource: next, mediaUrl: "", attachmentId: null })}
            options={[
              { value: "url", label: t("webhooks.blocks.sourceUrl") },
              { value: "attachment", label: t("webhooks.blocks.sourceAttachment") },
            ]}
          />
          {source === "url" ? (
            <Field label={t("webhooks.blocks.url")} error={errors?.mediaUrl?.message}>
              {(control) => (
                <TemplateInput
                  {...control}
                  singleLine
                  mono
                  value={block.mediaUrl ?? ""}
                  placeholder={t(`webhooks.blocks.urlPlaceholder.${block.type}`, LITERAL)}
                  onChange={(mediaUrl) => onChange({ mediaUrl })}
                />
              )}
            </Field>
          ) : (
            <AttachmentField
              kind={block.type}
              value={block.attachmentId ?? null}
              error={errors?.attachmentId?.message}
              onChange={(attachmentId, fileName) => onChange({ attachmentId, fileName })}
            />
          )}
          {block.type === "document" && source === "url" ? (
            <Field label={t("webhooks.blocks.fileName")}>
              {(control) => (
                <TemplateInput
                  {...control}
                  singleLine
                  value={block.fileName ?? ""}
                  placeholder={t("webhooks.blocks.fileNamePlaceholder")}
                  onChange={(fileName) => onChange({ fileName })}
                />
              )}
            </Field>
          ) : null}
          {block.type !== "audio" ? (
            <Field label={t("webhooks.blocks.caption")}>
              {(control) => (
                <TemplateInput
                  {...control}
                  singleLine
                  value={block.caption ?? ""}
                  placeholder={t("webhooks.blocks.captionPlaceholder", LITERAL)}
                  onChange={(caption) => onChange({ caption })}
                />
              )}
            </Field>
          ) : null}
        </>
      )}
    </li>
  )
}

function AttachmentField({
  kind,
  value,
  error,
  onChange,
}: {
  kind: MessageBlockType
  value: string | null
  error?: string
  onChange: (id: string | null, fileName: string | null) => void
}) {
  const { t } = useTranslation()
  const { attachments, isLoading } = useAttachmentLibrary()

  const options = useMemo(
    () =>
      (attachments ?? [])
        // Quem escolhe imagem vê imagem. O que já estava escolhido continua na lista, mesmo de outro tipo.
        .filter((attachment) => attachment.id === value || matchesKind(attachment.file, kind))
        .map((attachment) => ({
          value: attachment.id,
          label: attachment.name,
          description: attachment.file?.filename,
          icon: <FileTypeIcon mediaType={attachment.file?.contentType} fileName={attachment.file?.filename} className="size-4" />,
        })),
    [attachments, kind, value]
  )

  return (
    <Field label={t("webhooks.blocks.attachment")} error={error} hint={t(`webhooks.blocks.attachmentHint.${kind}`)}>
      {(control) => (
        <SearchableSelect
          {...control}
          value={value}
          options={options}
          placeholder={isLoading ? t("webhooks.blocks.attachmentLoading") : t("webhooks.blocks.attachmentPick")}
          emptyLabel={t("webhooks.blocks.attachmentEmpty")}
          onChange={(next) => {
            const picked = attachments?.find((attachment) => attachment.id === next)
            onChange(next, picked?.file?.filename ?? picked?.name ?? null)
          }}
        />
      )}
    </Field>
  )
}

function matchesKind(file: AttachmentFile | null, kind: MessageBlockType) {
  if (!file) return true
  const fileKind = getFileKind(file.contentType, file.filename)
  if (kind === "document") return fileKind !== "image" && fileKind !== "video" && fileKind !== "audio"
  return fileKind === kind
}
