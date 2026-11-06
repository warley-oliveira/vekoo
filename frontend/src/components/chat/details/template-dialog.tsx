import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import type { TFunction } from "i18next"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ChevronRight, FileText } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { TemplatePreview } from "@/components/connectors/templates/template-preview"
import {
  Callout,
  EmptyState,
  ErrorState,
  FormActions,
  ListSkeleton,
  ResponsiveDialog,
  SearchInput,
  StatusBadge,
  TextField,
  useFormSubmit,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useAutoRemoveWaitingTag } from "@/hooks/chat/use-send-message"
import { useApi } from "@/hooks/use-api"
import { useCan } from "@/hooks/use-can"
import { useChannel } from "@/hooks/use-channel"
import { useIsMobile } from "@/hooks/use-is-mobile"
import type { Chat } from "@/lib/chat/types"
import {
  buildTemplateComponents,
  initialTemplateValues,
  sendableTemplates,
  templatePreviewValues,
  templateSuggestions,
  templateTitle,
  templateVariables,
  type TemplateVariable,
} from "@/lib/chat-details/template-params"
import { templateSummary } from "@/lib/connectors/template-builder"
import type { WhatsappTemplate } from "@/lib/connectors/types"
import { matchesSearch } from "@/lib/search-text"

const NO_TEMPLATES: WhatsappTemplate[] = []

function useTemplateMeta() {
  const { t } = useTranslation()
  return (template: WhatsappTemplate) =>
    [
      t(`connectors.templates.categories.${template.category}`, { defaultValue: template.category }),
      t(`connectors.templates.languages.${template.language}`, { defaultValue: template.language }),
    ].join(" · ")
}

function TemplateList({
  connectorId,
  onPick,
}: {
  connectorId: string
  onPick: (template: WhatsappTemplate) => void
}) {
  const { t } = useTranslation()
  const canManage = useCan("core_settings")
  const meta = useTemplateMeta()
  const [query, setQuery] = useState("")
  // Sincroniza com a Meta a cada leitura: só quando alguém abre, e sem repetir ao focar a janela.
  const { data, error, isLoading, mutate } = useApi<{ templates: WhatsappTemplate[] }>(
    `/connectors/${connectorId}/templates`,
    { revalidateOnFocus: false, keepPreviousData: false }
  )

  const all = data?.templates ?? NO_TEMPLATES
  const sendable = useMemo(() => sendableTemplates(all), [all])
  const found = useMemo(
    () =>
      sendable.filter(
        (template) =>
          matchesSearch(templateTitle(template.name), query) ||
          matchesSearch(template.category ?? "", query) ||
          matchesSearch(templateSummary(template) ?? "", query)
      ),
    [query, sendable]
  )
  const waiting = all.length - sendable.length

  if (isLoading) return <ListSkeleton rows={4} />
  if (error) {
    return <ErrorState error={error} onRetry={() => void mutate()} className="border-0 p-4" />
  }

  if (sendable.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <EmptyState
          icon={<FileText className="size-5" />}
          title={t("chatDetails.template.none")}
          description={t("chatDetails.template.noneHint")}
          className="border-0 p-4"
        />
        {canManage ? (
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10"
            nativeButton={false}
            render={<Link to={`/settings/integrations/${connectorId}`} />}
          >
            {t("chatDetails.template.manage")}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sendable.length > 4 ? (
        <SearchInput
          value={query}
          onChange={setQuery}
          debounce={0}
          shortcut={false}
          placeholder={t("chatDetails.template.search")}
        />
      ) : null}

      <ul className="-mx-1 flex flex-col">
        {found.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onPick(template)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {templateTitle(template.name)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {templateSummary(template)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{meta(template)}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
        {found.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("chatDetails.template.noResults")}
          </li>
        ) : null}
      </ul>

      {waiting > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("chatDetails.template.waiting", { count: waiting })}
        </p>
      ) : null}
    </div>
  )
}

function variableLabel(variable: TemplateVariable, t: TFunction) {
  if (variable.buttonType === "COPY_CODE") return t("chatDetails.template.variableCode")
  if (variable.buttonType === "URL") {
    return t("chatDetails.template.variableLink", { name: variable.buttonText ?? "" })
  }
  if (variable.component === "header") return t("chatDetails.template.variableHeader")
  return /^\d+$/.test(variable.name)
    ? t("chatDetails.template.variableNumber", { number: variable.name })
    : variable.name
}

/** O que costuma ir numa variável vazia: um toque preenche, e a prévia mostra na hora. */
function Suggestions({
  form,
  variable,
  suggestions,
}: {
  form: UseFormReturn<Record<string, string>>
  variable: TemplateVariable
  suggestions: string[]
}) {
  const value = useWatch({ control: form.control, name: variable.key })
  if (value?.trim() || suggestions.length === 0 || variable.component === "button") return null

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          type="button"
          variant="outline"
          size="xs"
          className="font-normal pointer-coarse:h-8"
          onClick={() =>
            form.setValue(variable.key, suggestion, { shouldDirty: true, shouldValidate: true })
          }
        >
          {suggestion}
        </Button>
      ))}
    </span>
  )
}

function Preview({
  form,
  template,
  variables,
}: {
  form: UseFormReturn<Record<string, string>>
  template: WhatsappTemplate
  variables: TemplateVariable[]
}) {
  const values = useWatch({ control: form.control }) as Record<string, string>
  const preview = useMemo(
    () => templatePreviewValues(template, variables, values),
    [template, values, variables]
  )
  return <TemplatePreview values={preview} />
}

/** Dois painéis no desktop; no celular, um embaixo do outro, com a prévia antes de enviar. */
function TemplateForm({
  chat,
  template,
  onBack,
  onSent,
}: {
  chat: Chat
  template: WhatsappTemplate
  onBack: () => void
  onSent: () => void
}) {
  const { t } = useTranslation()
  const meta = useTemplateMeta()
  const { perform } = useChannel("ChatChannel", { chatId: chat.id })
  const removeWaitingTag = useAutoRemoveWaitingTag()

  const variables = useMemo(() => templateVariables(template), [template])
  const suggestions = useMemo(() => templateSuggestions(chat), [chat])

  const schema = useMemo(
    () =>
      z.object(
        Object.fromEntries(
          variables.map((variable) => [
            variable.key,
            z.string().trim().min(1, t("chatDetails.template.variableRequired")),
          ])
        )
      ),
    [t, variables]
  )

  // Só na abertura: o nome do contato mudar não pode apagar o que foi digitado.
  const [defaults] = useState(() => initialTemplateValues(variables, chat))

  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onBlur",
  })

  const submit = useFormSubmit(form, async (values) => {
    const sent = perform("send_template_message", {
      chatId: chat.id,
      templateId: template.templateId,
      components: buildTemplateComponents(variables, values),
    })
    if (!sent) {
      form.setError("root", { type: "server", message: t("chatDetails.template.offline") })
      return
    }

    removeWaitingTag(chat.id)
    // A confirmação, e o motivo se a Meta recusar, volta na própria mensagem, pela conversa.
    toast.success(t("chatDetails.template.sent"))
    onSent()
  })

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("chatDetails.template.backToList")}
          className="-ml-1 shrink-0 pointer-coarse:size-10"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{templateTitle(template.name)}</p>
          <p className="truncate text-xs text-muted-foreground">{meta(template)}</p>
        </div>
        <StatusBadge tone="success" className="ml-auto shrink-0">
          {t("chatDetails.template.approved")}
        </StatusBadge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          {variables.length === 0 ? (
            <Callout tone="neutral">{t("chatDetails.template.noVariables")}</Callout>
          ) : (
            variables.map((variable, index) => (
              <div key={variable.key}>
                <TextField
                  control={form.control}
                  name={variable.key}
                  label={variableLabel(variable, t)}
                  placeholder={variable.example ?? undefined}
                  hint={
                    variable.example
                      ? t("chatDetails.template.example", { example: variable.example })
                      : undefined
                  }
                  autoFocus={index === 0}
                />
                <Suggestions form={form} variable={variable} suggestions={suggestions} />
              </div>
            ))
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("chatDetails.template.preview")}
          </p>
          <Preview form={form} template={template} variables={variables} />
        </div>
      </div>

      {/* Preso embaixo: com várias variáveis, enviar não pode sair da tela. */}
      <FormActions
        form={form}
        submitLabel={t("chatDetails.template.send")}
        onCancel={onBack}
        cancelLabel={t("chatDetails.template.back")}
        className="sticky -bottom-4 -mx-4 -mb-4 w-auto border-t bg-popover px-4 py-3"
      />
    </form>
  )
}

/**
 * Enviar um modelo: é o único jeito de voltar a falar com alguém no WhatsApp oficial depois de 24 horas.
 * Escolher, preencher e ver como vai chegar. Nada sai com o exemplo no lugar do valor.
 */
export default function TemplateDialog({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [template, setTemplate] = useState<WhatsappTemplate | null>(null)

  // A conversa saiu da tela: o diálogo não pode continuar aberto com outro contato atrás.
  const opened = useRef(chat.id)
  useEffect(() => {
    if (opened.current !== chat.id) onClose()
  }, [chat.id, onClose])

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t("chatDetails.template.title")}
      description={
        template
          ? undefined
          : t("chatDetails.template.description", {
              name: chat.displayName || chat.userName || t("chat.contact.fallback"),
            })
      }
      size={template && !isMobile ? "xl" : "md"}
      disablePointerDismissal={Boolean(template)}
    >
      {!chat.connectorId ? (
        <Callout tone="warning">{t("chatDetails.template.noChannel")}</Callout>
      ) : template ? (
        <TemplateForm
          key={template.id}
          chat={chat}
          template={template}
          onBack={() => setTemplate(null)}
          onSent={onClose}
        />
      ) : (
        <TemplateList connectorId={chat.connectorId} onPick={setTemplate} />
      )}
    </ResponsiveDialog>
  )
}
