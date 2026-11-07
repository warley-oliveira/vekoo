import { useMemo, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { CheckCheck, ChevronLeft, ChevronRight, FileText, Play } from "lucide-react"

import { TemplatePreview } from "@/components/connectors/templates/template-preview"
import { Button } from "@/components/ui/button"
import { useConnectorTemplates, useRecipientSummary } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import { apiAssetUrl } from "@/lib/api"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import { filledMessages } from "@/lib/campaigns-wizard/form"
import type { RecipientSample } from "@/lib/campaigns-wizard/types"
import { fillMessage } from "@/lib/campaigns-wizard/variables"
import { formatMessage } from "@/lib/chat/format-message"
import { templatePreviewValues, templateTitle, templateVariables } from "@/lib/chat-details/template-params"
import type { WhatsappTemplate } from "@/lib/connectors/types"
import { formatTime } from "@/lib/date-format"
import { useLanguage } from "@/lib/i18n"
import { mediaKindOf } from "./media-composer"

/** Anterior e próxima, quando há mais de uma versão a mostrar. */
function Pager({
  label,
  index,
  total,
  onChange,
}: {
  label: string
  index: number
  total: number
  onChange: (next: number) => void
}) {
  const { t } = useTranslation()
  if (total < 2) return null

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-10"
          aria-label={t("campaignsWizard.preview.previous")}
          onClick={() => onChange((index - 1 + total) % total)}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-8 text-center text-xs text-muted-foreground tabular-nums">
          {index + 1}/{total}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-10"
          aria-label={t("campaignsWizard.preview.next")}
          onClick={() => onChange((index + 1) % total)}
        >
          <ChevronRight />
        </Button>
      </span>
    </div>
  )
}

function Bubble({
  text,
  media,
}: {
  text: string
  media: WizardValues["media"]
}) {
  const language = useLanguage()
  const html = useMemo(() => formatMessage(text), [text])
  const kind = mediaKindOf(media?.contentType)
  const url = media?.url ? apiAssetUrl(media.url) : null

  return (
    <div className="ml-auto flex max-w-[20rem] flex-col gap-1.5 overflow-hidden rounded-lg rounded-tr-sm bg-status-success-soft p-1.5 text-sm shadow-xs">
      {kind === "image" && url ? (
        <img src={url} alt={media?.fileName ?? ""} className="max-h-56 w-full rounded-md object-cover" />
      ) : kind === "video" && url ? (
        <div className="relative overflow-hidden rounded-md bg-muted">
          <video src={url} preload="metadata" muted className="max-h-56 w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-background/80">
              <Play aria-hidden className="size-4" />
            </span>
          </span>
        </div>
      ) : kind === "document" ? (
        <div className="flex items-center gap-2 rounded-md bg-background/70 p-2 text-xs">
          <FileText aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate font-medium">{media?.fileName}</span>
        </div>
      ) : null}

      {text ? (
        <p
          className="whitespace-pre-wrap wrap-anywhere px-1 [&_a]:text-primary [&_a]:underline"
          // O conteúdo passou por DOMPurify em `formatMessage`, com lista curta de marcas.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}

      <span className="flex items-center justify-end gap-1 px-1 text-[0.6875rem] text-muted-foreground tabular-nums">
        {formatTime(new Date(), language)}
        <CheckCheck aria-hidden className="size-3.5" />
      </span>
    </div>
  )
}

function usePreviewFill(sample: RecipientSample | null) {
  const { t } = useTranslation()
  const fallbackName = t("campaignsWizard.preview.sampleName")
  const fallbackPhone = t("campaignsWizard.preview.samplePhone")

  return (text: string) => fillMessage(text, sample, fallbackName, fallbackPhone)
}

function TextPreview({ sample }: { sample: RecipientSample | null }) {
  const { t } = useTranslation()
  const { control } = useFormContext<WizardValues>()
  const messages = useWatch({ control, name: "messages" })
  const messageType = useWatch({ control, name: "messageType" })
  const media = useWatch({ control, name: "media" })
  const fill = usePreviewFill(sample)
  const [index, setIndex] = useState(0)

  const texts = filledMessages({ messages })
  const showMedia = messageType === "media"
  const kind = showMedia ? mediaKindOf(media?.contentType) : null
  // Documento vai sem legenda.
  const captions = kind === "document" ? [] : texts
  const current = Math.min(index, Math.max(captions.length - 1, 0))
  const empty = captions.length === 0 && (!showMedia || !media)

  return (
    <div className="flex flex-col gap-2">
      <Pager
        label={t("campaignsWizard.preview.variation", { number: current + 1 })}
        index={current}
        total={captions.length}
        onChange={setIndex}
      />
      <div className="rounded-xl bg-muted/70 p-4">
        {empty ? (
          <p className="py-8 text-center text-sm text-pretty text-muted-foreground">
            {t("campaignsWizard.preview.empty")}
          </p>
        ) : (
          <Bubble text={fill(captions[current] ?? "")} media={showMedia ? media : null} />
        )}
      </div>
    </div>
  )
}

function TemplateFill({
  template,
  params,
  sample,
}: {
  template: WhatsappTemplate
  params: Record<string, string>
  sample: RecipientSample | null
}) {
  const fill = usePreviewFill(sample)
  const values = useMemo(() => {
    const variables = templateVariables(template)
    const filled: Record<string, string> = {}
    for (const variable of variables) {
      const raw = params[variable.name] ?? (variable.name === "1" ? "{{nome}}" : "")
      filled[variable.key] = raw ? fill(raw) : ""
    }
    return templatePreviewValues(template, variables, filled)
    // `fill` nasce a cada render, mas só muda com a amostra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, sample, template])

  return <TemplatePreview values={values} />
}

function TemplatesPreview({
  sample,
  focusTemplateId,
}: {
  sample: RecipientSample | null
  focusTemplateId: string | null
}) {
  const { t } = useTranslation()
  const { control } = useFormContext<WizardValues>()
  const wabaConnectorId = useWatch({ control, name: "wabaConnectorId" })
  const templateIds = useWatch({ control, name: "templateIds" })
  const templateParams = useWatch({ control, name: "templateParams" })
  const { templates } = useConnectorTemplates(wabaConnectorId)
  const [index, setIndex] = useState(0)

  const selected = (templates ?? []).filter((template) => templateIds.includes(template.id))
  const focused = focusTemplateId ? (templates ?? []).find((item) => item.id === focusTemplateId) : null
  const current = Math.min(index, Math.max(selected.length - 1, 0))
  const template = focused ?? selected[current] ?? null

  if (!template) {
    return (
      <div className="rounded-xl bg-muted/70 p-4">
        <p className="py-8 text-center text-sm text-pretty text-muted-foreground">
          {t("campaignsWizard.preview.emptyTemplate")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {focused && !templateIds.includes(focused.id) ? (
        <p className="truncate text-xs text-muted-foreground">
          {t("campaignsWizard.preview.notChosen", { name: templateTitle(focused.name) })}
        </p>
      ) : (
        <Pager
          label={templateTitle(template.name)}
          index={current}
          total={selected.length}
          onChange={setIndex}
        />
      )}
      <TemplateFill template={template} params={templateParams[template.id] ?? {}} sample={sample} />
    </div>
  )
}

/**
 * Como vai chegar, com o nome de quem está mesmo na lista. Assina só o que mostra: digitar redesenha a
 * prévia, e mais nada.
 */
export function MessagePreview({ focusTemplateId = null }: { focusTemplateId?: string | null }) {
  const { t } = useTranslation()
  const { control } = useFormContext<WizardValues>()
  const { campaignId } = useDraft()
  const { summary } = useRecipientSummary(campaignId)
  const mode = useWatch({ control, name: "campaignMode" })

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {summary.sample
          ? t("campaignsWizard.preview.asRecipient", { name: summary.sample.name })
          : t("campaignsWizard.preview.title")}
      </p>
      {mode === "template" ? (
        <TemplatesPreview sample={summary.sample} focusTemplateId={focusTemplateId} />
      ) : (
        <TextPreview sample={summary.sample} />
      )}
    </div>
  )
}
