import { useEffect, useMemo } from "react"
import { useController, useFormContext, useWatch, type Control } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Send, TriangleAlert } from "lucide-react"

import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { Callout, Field, FormField, SearchableSelect, SegmentedControl } from "@/components/shared"
import { useConnectors } from "@/hooks/connectors/use-connectors"
import { useWhatsappTemplates } from "@/hooks/flows/use-flow-references"
import { useFlowOptions } from "@/hooks/webhooks/use-webhook-references"
import { connectorHandle } from "@/lib/connectors/channels"
import { bodyVariables } from "@/lib/connectors/template-builder"
import type { WhatsappCloudConnector, WhatsappTemplate } from "@/lib/connectors/types"
import type { WebhookFormValues } from "@/lib/webhooks/form"
import { LITERAL } from "@/lib/webhooks/literal"

import { ActionCard } from "./action-card"
import { MessageBlocks } from "./message-blocks"
import { TemplateField, TemplateInput } from "./template-field"

// "Iniciar fluxo": liga a conversa a um canal, liga a automação, manda a mensagem e começa o fluxo. O que dá para mandar
// depende do canal: a API oficial do WhatsApp só aceita modelo aprovado para quem não falou nas últimas 24 horas.

function templateBody(template: WhatsappTemplate) {
  return template.components.find((component) => component.type === "BODY")?.text ?? ""
}

export function StartFlowAction({
  control,
  index,
  step,
  onRemove,
}: {
  control: Control<WebhookFormValues>
  index: number
  step: number
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const texts = useConnectorTexts()
  const { setValue } = useFormContext<WebhookFormValues>()
  const { data: connectorsData, isLoading: loadingConnectors } = useConnectors()
  const { flows, canSeeFlows, isLoading: loadingFlows } = useFlowOptions()

  const config = `actions.${index}.config` as const
  const connectorId = useWatch({ control, name: `${config}.connectorId` })
  const flowId = useWatch({ control, name: `${config}.flowId` })
  const sendMode = useWatch({ control, name: `${config}.sendMode` })
  const templateId = useWatch({ control, name: `${config}.whatsappTemplateId` })

  const connectors = useMemo(() => connectorsData?.connectors ?? [], [connectorsData])
  const selected = connectors.find((connector) => connector.id === connectorId) ?? null
  const isCloud = selected?.type === "whatsapp_cloud"
  const inactive = Boolean(selected && selected.status !== "active")

  // Só os ativos, e mais o escolhido, mesmo inativo: é assim que ele aparece com o aviso, em vez de sumir do campo.
  const connectorOptions = useMemo(
    () =>
      connectors
        .filter((connector) => connector.status === "active" || connector.id === connectorId)
        .map((connector) => ({
          value: connector.id,
          label: texts.title(connector),
          description: connectorHandle(connector) ?? texts.typeLabel(connector),
        })),
    [connectorId, connectors, texts]
  )

  // Só publicado roda: a API avisa quando o escolhido deixa de estar. Rascunho e arquivado ficam visíveis para o que já está salvo.
  const flowOptions = useMemo(
    () =>
      flows
        .filter((flow) => flow.status === "published" || flow.id === flowId)
        .map((flow) => ({
          value: flow.id,
          label: flow.name,
          description: flow.status === "published" ? undefined : t(`flows.status.${flow.status}`),
        })),
    [flowId, flows, t]
  )
  const pickedFlow = flows.find((flow) => flow.id === flowId)

  const { templates, isLoading: loadingTemplates } = useWhatsappTemplates(isCloud ? connectorId : null)
  const approved = useMemo(
    () => templates.filter((template) => template.status === "approved" && template.templateId),
    [templates]
  )
  const pickedTemplate = approved.find((template) => template.templateId === templateId) ?? null
  const variables = useMemo(() => (pickedTemplate ? bodyVariables(templateBody(pickedTemplate)) : []), [pickedTemplate])

  // Trocar de modelo muda quantas variáveis há: a lista acompanha, mantendo o que couber.
  const paramsName = `${config}.whatsappTemplateParams` as const
  const { field: paramsField } = useController({ control, name: paramsName })
  const params = (paramsField.value ?? []) as string[]
  useEffect(() => {
    if (!pickedTemplate || params.length === variables.length) return
    setValue(
      paramsName,
      variables.map((_, position) => params[position] ?? ""),
      { shouldDirty: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTemplate, variables])

  return (
    <ActionCard
      step={step}
      icon={<Send />}
      title={t("webhooks.actions.startFlow.title")}
      description={t("webhooks.actions.startFlow.description", LITERAL)}
      removeLabel={t("webhooks.actions.remove", { name: t("webhooks.actions.startFlow.title") })}
      onRemove={onRemove}
    >
      {inactive ? (
        <Callout tone="warning" icon={<TriangleAlert />}>
          {t("webhooks.actions.startFlow.connectorInactive")}
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={control} name={`${config}.connectorId`} label={t("webhooks.actions.startFlow.connector")}>
          {({ field, controlProps }) => (
            <SearchableSelect
              {...controlProps}
              value={(field.value as string | null) ?? null}
              options={connectorOptions}
              placeholder={loadingConnectors ? t("webhooks.common.loading") : t("webhooks.actions.startFlow.connectorPick")}
              emptyLabel={t("webhooks.actions.startFlow.connectorEmpty")}
              onChange={(next) => {
                field.onChange(next)
                // O número e o modelo são do canal: de um para outro não valem.
                setValue(`${config}.phoneNumberId`, null, { shouldDirty: true })
                setValue(`${config}.whatsappTemplateId`, null, { shouldDirty: true })
                setValue(`${config}.whatsappTemplateParams`, [], { shouldDirty: true })
              }}
            />
          )}
        </FormField>

        {canSeeFlows ? (
          <FormField
            control={control}
            name={`${config}.flowId`}
            label={t("webhooks.actions.startFlow.flow")}
            optional
            hint={
              pickedFlow && pickedFlow.status !== "published"
                ? t("webhooks.actions.startFlow.flowNotPublished")
                : t("webhooks.actions.startFlow.flowHint")
            }
          >
            {({ field, controlProps }) => (
              <SearchableSelect
                {...controlProps}
                value={(field.value as string | null) ?? null}
                options={flowOptions}
                clearable
                placeholder={loadingFlows ? t("webhooks.common.loading") : t("webhooks.actions.startFlow.flowPick")}
                emptyLabel={t("webhooks.actions.startFlow.flowEmpty")}
                onChange={(next) => field.onChange(next)}
              />
            )}
          </FormField>
        ) : (
          <Field label={t("webhooks.actions.startFlow.flow")} hint={t("webhooks.actions.startFlow.flowNoAccess")}>
            {(controlProps) => (
              <SearchableSelect
                {...controlProps}
                disabled
                value={null}
                options={[]}
                placeholder={flowId ? t("webhooks.actions.startFlow.flowChosen") : t("webhooks.actions.startFlow.flowNone")}
                onChange={() => undefined}
              />
            )}
          </Field>
        )}
      </div>

      {isCloud ? (
        <CloudOptions
          control={control}
          index={index}
          connector={selected as WhatsappCloudConnector}
          loadingTemplates={loadingTemplates}
          approved={approved}
          picked={pickedTemplate}
          variables={variables}
          params={params}
          onParamChange={(position, value) =>
            setValue(
              paramsName,
              variables.map((_, item) => (item === position ? value : (params[item] ?? ""))),
              { shouldDirty: true }
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{t("webhooks.actions.startFlow.message")}</p>
            <SegmentedControl
              aria-label={t("webhooks.actions.startFlow.modeLabel")}
              value={sendMode ?? "simple"}
              onChange={(next) => setValue(`${config}.sendMode`, next, { shouldDirty: true })}
              options={[
                { value: "simple", label: t("webhooks.actions.startFlow.modeSimple") },
                { value: "advanced", label: t("webhooks.actions.startFlow.modeAdvanced") },
              ]}
            />
          </div>
          {sendMode === "advanced" ? (
            <MessageBlocks control={control} index={index} />
          ) : (
            <TemplateField
              control={control}
              name={`${config}.messageText`}
              label={t("webhooks.actions.startFlow.text")}
              optional
              rows={3}
              hint={t("webhooks.actions.startFlow.textHint")}
              placeholder={t("webhooks.actions.startFlow.textPlaceholder", LITERAL)}
            />
          )}
        </div>
      )}
    </ActionCard>
  )
}

function CloudOptions({
  control,
  index,
  connector,
  loadingTemplates,
  approved,
  picked,
  variables,
  params,
  onParamChange,
}: {
  control: Control<WebhookFormValues>
  index: number
  connector: WhatsappCloudConnector
  loadingTemplates: boolean
  approved: WhatsappTemplate[]
  picked: WhatsappTemplate | null
  variables: string[]
  params: string[]
  onParamChange: (position: number, value: string) => void
}) {
  const { t } = useTranslation()
  const config = `actions.${index}.config` as const

  const numbers = connector.phoneNumberList ?? []
  const templateOptions = useMemo(
    () =>
      approved.map((template) => ({
        value: template.templateId as string,
        label: template.name,
        description: templateBody(template).slice(0, 90),
      })),
    [approved]
  )

  return (
    <div className="flex flex-col gap-4">
      {numbers.length > 1 ? (
        <FormField control={control} name={`${config}.phoneNumberId`} label={t("webhooks.actions.startFlow.number")} optional>
          {({ field, controlProps }) => (
            <SearchableSelect
              {...controlProps}
              value={(field.value as string | null) ?? null}
              clearable
              options={numbers.map((number) => ({
                value: number.id,
                label: number.verifiedName ?? number.displayPhoneNumber ?? number.id,
                description: number.displayPhoneNumber ?? undefined,
              }))}
              placeholder={t("webhooks.actions.startFlow.numberPick")}
              onChange={(next) => field.onChange(next)}
            />
          )}
        </FormField>
      ) : null}

      <FormField
        control={control}
        name={`${config}.whatsappTemplateId`}
        label={t("webhooks.actions.startFlow.template")}
        optional
        hint={picked ? templateBody(picked) : t("webhooks.actions.startFlow.templateNone")}
      >
        {({ field, controlProps }) => (
          <SearchableSelect
            {...controlProps}
            value={(field.value as string | null) ?? null}
            clearable
            options={templateOptions}
            placeholder={loadingTemplates ? t("webhooks.common.loading") : t("webhooks.actions.startFlow.templatePick")}
            emptyLabel={t("webhooks.actions.startFlow.templateEmpty")}
            onChange={(next) => field.onChange(next)}
          />
        )}
      </FormField>

      {picked && variables.length > 0 ? (
        <div className="flex flex-col gap-3 border-l-2 pl-3">
          <p className="text-sm font-medium">{t("webhooks.actions.startFlow.templateParams", { count: variables.length })}</p>
          {variables.map((variable, position) => (
            <Field key={variable} label={`{{${variable}}}`}>
              {(controlProps) => (
                <TemplateInput
                  {...controlProps}
                  singleLine
                  value={params[position] ?? ""}
                  placeholder={t("webhooks.actions.startFlow.templateParamPlaceholder")}
                  onChange={(value) => onParamChange(position, value)}
                />
              )}
            </Field>
          ))}
        </div>
      ) : null}
    </div>
  )
}
