import { useCallback, useMemo, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import {
  Callout,
  DetailSkeleton,
  FormActions,
  FormField,
  SidePanel,
  TextField,
  UnsavedChangesDialog,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { useCustomFields } from "@/hooks/content/use-custom-fields"
import { useQuickReplyMutations } from "@/hooks/content/use-quick-replies"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { useSession } from "@/lib/auth"
import {
  BUILT_IN_VARIABLES,
  canonicalVariableKey,
  citedAttachmentIds,
  hasMeaningfulContent,
  hasStrippedCharacters,
  slugifyTrigger,
  usedVariableKeys,
  visibleLength,
} from "@/lib/content/quick-reply-content"
import type { QuickReply } from "@/lib/content/types"
import { QuickReplyPreview } from "./quick-reply-preview"
import {
  QUICK_REPLY_MAX_LENGTH,
  QuickReplyEditor,
  type QuickReplyEditorHandle,
  type VariableOption,
} from "./quick-reply-editor"
import type { ContentResolvers } from "./quick-reply-doc"

type QuickReplyPanelProps = {
  /** Sem mensagem, o painel cria. */
  reply: QuickReply | null
  /** As outras, para avisar do atalho repetido enquanto a pessoa digita. */
  others: QuickReply[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (reply: QuickReply) => void
}

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string, others: QuickReply[]) {
  return z.object({
    name: z.string().trim().min(1, t("content.quickReplies.fields.nameRequired")),
    trigger: z
      .string()
      .trim()
      .min(1, t("content.quickReplies.fields.triggerRequired"))
      .refine((value) => slugifyTrigger(value) !== "", t("content.quickReplies.fields.triggerInvalid"))
      .superRefine((value, context) => {
        const taken = others.find((other) => other.trigger === slugifyTrigger(value))
        if (taken) {
          context.addIssue({
            code: "custom",
            message: t("content.quickReplies.fields.triggerTaken", { name: taken.name }),
          })
        }
      }),
    content: z
      .string()
      .refine(hasMeaningfulContent, t("content.quickReplies.fields.contentRequired"))
      .refine(
        (value) => visibleLength(value) <= QUICK_REPLY_MAX_LENGTH,
        t("content.quickReplies.fields.contentTooLong", { max: QUICK_REPLY_MAX_LENGTH })
      ),
  })
}

type QuickReplyValues = z.infer<ReturnType<typeof buildSchema>>

/** Criar e editar uma mensagem rápida, com a mensagem pronta logo abaixo do texto. */
export default function QuickReplyPanel({
  reply,
  others,
  open,
  onOpenChange,
  onDelete,
}: QuickReplyPanelProps) {
  const { t } = useTranslation()
  const { account } = useSession()
  const { createQuickReply, updateQuickReply } = useQuickReplyMutations()
  const library = useAttachmentLibrary()
  const fields = useCustomFields()

  const schema = useMemo(() => buildSchema(t, others), [others, t])
  const form = useForm<QuickReplyValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: reply?.name ?? "",
      trigger: reply?.trigger ?? "",
      content: reply?.content ?? "",
    },
    mode: "onBlur",
  })

  // Enquanto a pessoa não escreve o próprio atalho, ele acompanha o nome.
  const [followName, setFollowName] = useState(!reply)
  const trigger = useWatch({ control: form.control, name: "trigger" })
  const content = useWatch({ control: form.control, name: "content" })
  const slug = slugifyTrigger(trigger ?? "")

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const submit = useFormSubmit(form, async (values) => {
    const input = { ...values, trigger: slugifyTrigger(values.trigger) }
    const saved = reply
      ? await updateQuickReply(reply.id, input)
      : await createQuickReply(input)
    form.reset({ name: saved.name, trigger: saved.trigger, content: saved.content })
    toast.success(
      t(reply ? "content.quickReplies.saved" : "content.quickReplies.created", {
        name: saved.name,
      })
    )
    close()
  })

  const isDirty = form.formState.isDirty
  const requestClose = useGuardedClose(isDirty, close)

  /* ---------- o que pode entrar no texto ---------- */

  const variables = useMemo<VariableOption[]>(
    () => [
      ...BUILT_IN_VARIABLES.map((key) => ({
        key,
        label: t(`content.quickReplies.variables.${key}`),
        group: key === "atendente" ? ("team" as const) : ("contact" as const),
      })),
      ...(fields.customFields ?? []).map((field) => ({
        key: field.key,
        label: field.name,
        group: "fields" as const,
      })),
    ],
    [fields.customFields, t]
  )

  const resolvers = useMemo<ContentResolvers>(() => {
    const attachmentsById = new Map((library.attachments ?? []).map((item) => [item.id, item]))
    const variablesByKey = new Map(variables.map((option) => [option.key, option]))

    return {
      attachment: (id) => {
        const attachment = attachmentsById.get(id)
        return {
          id,
          label: attachment?.name ?? t("content.quickReplies.editor.missingAttachment"),
          mediaType: attachment?.file?.contentType ?? null,
          fileName: attachment?.file?.filename ?? null,
          // Sem a biblioteca, não dá para afirmar que sumiu.
          missing: Boolean(library.attachments) && !attachment,
        }
      },
      variable: (key) => {
        const canonical = canonicalVariableKey(key)
        const option = variablesByKey.get(canonical)
        return {
          key: option ? canonical : key,
          label: option?.label ?? key,
          unknown: Boolean(fields.customFields) && !option,
        }
      },
    }
  }, [fields.customFields, library.attachments, t, variables])

  // O editor nasce com o nome de cada citação: espera a biblioteca e os campos, com erro ou não.
  const ready =
    (Boolean(library.attachments) || Boolean(library.error)) &&
    (Boolean(fields.customFields) || Boolean(fields.error))

  const missingCount = useMemo(() => {
    if (!library.attachments) return 0
    const known = new Set(library.attachments.map((item) => item.id))
    return citedAttachmentIds(content ?? "").filter((id) => !known.has(id)).length
  }, [content, library.attachments])

  const unknownVariables = useMemo(() => {
    if (!fields.customFields) return []
    const known = new Set(variables.map((option) => option.key))
    return usedVariableKeys(content ?? "").filter((key) => !known.has(canonicalVariableKey(key)))
  }, [content, fields.customFields, variables])

  const sampleContext = useMemo(
    () => ({
      contactName: t("content.quickReplies.preview.sampleName"),
      phone: t("content.quickReplies.preview.samplePhone"),
      agentName: account.name,
    }),
    [account.name, t]
  )

  const editorHandle = useRef<QuickReplyEditorHandle | null>(null)

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next) void requestClose()
      }}
      size="lg"
      title={reply?.name ?? t("content.quickReplies.create.title")}
      description={reply ? `/${reply.trigger}` : t("content.quickReplies.create.description")}
      onSubmit={submit}
      footer={
        <FormActions
          form={form}
          submitLabel={t(reply ? "content.quickReplies.edit.submit" : "content.quickReplies.create.submit")}
          onCancel={close}
          cancelLabel={reply ? t("content.common.close") : undefined}
          requireChanges={Boolean(reply)}
        />
      }
    >
      <UnsavedChangesDialog when={open && isDirty} />

      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="name"
            label={t("content.quickReplies.fields.name")}
            placeholder={t("content.quickReplies.fields.namePlaceholder")}
            autoComplete="off"
            autoFocus={!reply}
            onInput={(event) => {
              if (followName) {
                form.setValue("trigger", slugifyTrigger(event.currentTarget.value), {
                  shouldDirty: true,
                })
              }
            }}
          />
          <TextField
            control={form.control}
            name="trigger"
            label={t("content.quickReplies.fields.trigger")}
            startAdornment="/"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={t("content.quickReplies.fields.triggerPlaceholder")}
            hint={
              slug
                ? t("content.quickReplies.fields.triggerHint", { trigger: slug })
                : t("content.quickReplies.fields.triggerEmptyHint")
            }
            onInput={(event) => setFollowName(event.currentTarget.value.trim() === "")}
            onBlurCapture={(event) => {
              const normalized = slugifyTrigger(event.currentTarget.value)
              if (normalized && normalized !== event.currentTarget.value) {
                form.setValue("trigger", normalized, { shouldDirty: true })
              }
            }}
          />
        </div>

        {ready ? (
          <FormField
            control={form.control}
            name="content"
            label={t("content.quickReplies.fields.content")}
          >
            {({ field, controlProps }) => (
              <QuickReplyEditor
                {...controlProps}
                editorRef={(handle) => {
                  editorHandle.current = handle
                  // O formulário foca o primeiro campo com erro por esta referência.
                  field.ref(handle)
                }}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                attachments={library.attachments ?? []}
                variables={variables}
                resolvers={resolvers}
                label={t("content.quickReplies.fields.content")}
                placeholder={t("content.quickReplies.fields.contentPlaceholder")}
              />
            )}
          </FormField>
        ) : (
          <DetailSkeleton rows={3} avatar={false} />
        )}

        {missingCount > 0 ? (
          <Callout tone="danger" icon={<AlertTriangle />} role="alert">
            {t("content.quickReplies.missingAttachment", { count: missingCount })}
          </Callout>
        ) : null}

        {unknownVariables.length > 0 ? (
          <Callout tone="warning" icon={<AlertTriangle />}>
            {t("content.quickReplies.unknownVariables", {
              count: unknownVariables.length,
              names: unknownVariables.map((key) => `{{${key}}}`).join(", "),
            })}
          </Callout>
        ) : null}

        <section aria-labelledby="quick-reply-preview-title" className="flex flex-col gap-2">
          <h3 id="quick-reply-preview-title" className="text-sm font-medium">
            {t("content.quickReplies.preview.title")}
          </h3>
          <QuickReplyPreview
            content={content ?? ""}
            attachments={library.attachments}
            customFields={fields.customFields}
            context={sampleContext}
          />
          {usedVariableKeys(content ?? "").length > 0 ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {t("content.quickReplies.preview.variablesHint")}
            </p>
          ) : null}
          {hasStrippedCharacters(content ?? "") ? (
            <p className="text-xs text-pretty text-muted-foreground">
              {t("content.quickReplies.preview.strippedHint")}
            </p>
          ) : null}
        </section>

        {reply ? (
          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 text-muted-foreground hover:text-destructive pointer-coarse:h-10"
              onClick={() => onDelete(reply)}
            >
              <Trash2 />
              {t("content.quickReplies.delete.action")}
            </Button>
          </div>
        ) : null}
      </div>
    </SidePanel>
  )
}
