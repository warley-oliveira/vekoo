import { useEffect, useMemo } from "react"
import { useController, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { Info, Plus, TriangleAlert, X } from "lucide-react"

import {
  Callout,
  MultiSelectField,
  NumberField,
  SegmentedControl,
  SelectField,
  TextField,
  type SelectOption,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCan } from "@/hooks/use-can"
import { useApi } from "@/hooks/use-api"
import { useTriggerContext } from "@/hooks/pipelines-admin/use-trigger-context"
import {
  MESSAGE_CONNECTOR_TYPES,
  PHONE_CONNECTOR_TYPES,
  TOKEN_VALUES,
  WEBHOOK_TOKENS,
} from "@/lib/pipelines-admin/trigger-catalog"
import type { ActionDraft, TriggerDraft } from "@/lib/pipelines-admin/trigger-form"
import type { WhatsappTemplate } from "@/lib/connectors/types"
import { PhrasePicker } from "./phrase-picker"
import { TokenField } from "./token-field"

type EditorProps = { index: number }

function useAction(index: number) {
  const { control, setValue } = useFormContext<TriggerDraft>()
  const action = useWatch({ control, name: `actions.${index}` }) as ActionDraft | undefined
  const set = (key: string, value: unknown) =>
    setValue(`actions.${index}.${key}` as `actions.${number}.message`, value as string, {
      shouldDirty: true,
      shouldValidate: true,
    })
  return { control, action, set }
}

/* ---------- avisar ---------- */

export function NotifyEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { peopleOptions } = useTriggerContext()
  const { control, action, set } = useAction(index)
  const audience = action?.audience ?? "default"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("pipelinesAdmin.triggers.actionForm.notify.audience")}</span>
        <PhrasePicker
          label={t("pipelinesAdmin.triggers.actionForm.notify.audience")}
          value={audience}
          className="self-start"
          onChange={(value) => set("audience", value)}
          options={[
            { value: "default", label: t("pipelinesAdmin.triggers.actionForm.notify.audienceDefault") },
            { value: "people", label: t("pipelinesAdmin.triggers.actionForm.notify.audiencePeople") },
          ]}
        />
      </div>
      {audience === "people" ? (
        <MultiSelectField
          control={control}
          name={`actions.${index}.accountIds`}
          label={t("pipelinesAdmin.triggers.actionForm.notify.people")}
          options={peopleOptions}
          placeholder={t("pipelinesAdmin.triggers.actionForm.peoplePlaceholder")}
        />
      ) : null}
      <TokenField
        control={control}
        name={`actions.${index}.message`}
        label={t("pipelinesAdmin.triggers.actionForm.notify.message")}
        hint={t("pipelinesAdmin.triggers.actionForm.notify.messageHint")}
        placeholder={t("pipelinesAdmin.triggers.actionForm.notify.messagePlaceholder", TOKEN_VALUES)}
        multiline
        rows={2}
        optional
        preview
      />
    </div>
  )
}

/* ---------- mover ---------- */

export function MoveCardEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { stageOptions } = useTriggerContext()
  const { control } = useAction(index)

  return (
    <SelectField
      control={control}
      name={`actions.${index}.stageId`}
      label={t("pipelinesAdmin.triggers.actionForm.move.stage")}
      hint={t("pipelinesAdmin.triggers.actionForm.move.hint")}
      options={stageOptions}
      placeholder={t("pipelinesAdmin.triggers.actionForm.move.placeholder")}
      disabled={stageOptions.length === 0}
    />
  )
}

/* ---------- distribuir ---------- */

export function AssignUserEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { peopleOptions } = useTriggerContext()
  const { control } = useAction(index)

  return (
    <MultiSelectField
      control={control}
      name={`actions.${index}.accountIds`}
      label={t("pipelinesAdmin.triggers.actionForm.assign.people")}
      hint={t("pipelinesAdmin.triggers.actionForm.assign.hint")}
      options={peopleOptions}
      placeholder={t("pipelinesAdmin.triggers.actionForm.peoplePlaceholder")}
    />
  )
}

/* ---------- WhatsApp ---------- */

function connectorLabel(connector: { name: string; profileName?: string | null; numberFormatted?: string | null; displayPhoneNumber?: string | null }) {
  const name = connector.profileName || connector.name
  const number = connector.numberFormatted || connector.displayPhoneNumber
  return number ? `${name} · ${number}` : name
}

function useConnectorOptions(types: string[], selectedId: string | undefined) {
  const { t } = useTranslation()
  const { connectors } = useTriggerContext()

  return useMemo(() => {
    const ofType = connectors.filter((connector) => types.includes(connector.type))
    const selected = connectors.find((connector) => connector.id === selectedId)
    const options: SelectOption[] = ofType
      .filter((connector) => connector.status === "active" || connector.id === selectedId)
      .map((connector) => ({
        value: connector.id,
        label:
          connector.status === "active"
            ? connectorLabel(connector)
            : t("pipelinesAdmin.triggers.actionForm.whatsapp.inactiveOption", { name: connectorLabel(connector) }),
        disabled: connector.status !== "active",
      }))
    return {
      options,
      selected,
      inactive: Boolean(selected && selected.status !== "active"),
      missing: Boolean(selectedId && !selected && connectors.length > 0),
    }
  }, [connectors, selectedId, t, types])
}

function TargetFields({ index, phoneAllowed }: EditorProps & { phoneAllowed: boolean }) {
  const { t } = useTranslation()
  const { control, action, set } = useAction(index)
  const target = action?.target ?? "card_contact"

  return (
    <div className="flex flex-col gap-3">
      {phoneAllowed ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("pipelinesAdmin.triggers.actionForm.whatsapp.target")}</span>
          <SegmentedControl
            aria-label={t("pipelinesAdmin.triggers.actionForm.whatsapp.target")}
            value={target}
            onChange={(value) => set("target", value)}
            options={[
              { value: "card_contact", label: t("pipelinesAdmin.triggers.actionForm.whatsapp.targetContact") },
              { value: "specific", label: t("pipelinesAdmin.triggers.actionForm.whatsapp.targetSpecific") },
            ]}
          />
        </div>
      ) : null}
      {target === "specific" ? (
        <TextField
          control={control}
          name={`actions.${index}.specificPhone`}
          label={t("pipelinesAdmin.triggers.actionForm.whatsapp.phone")}
          hint={t("pipelinesAdmin.triggers.actionForm.whatsapp.phoneHint")}
          placeholder={t("pipelinesAdmin.triggers.actionForm.whatsapp.phonePlaceholder")}
          inputMode="tel"
          autoComplete="off"
        />
      ) : (
        <p className="text-xs text-pretty text-muted-foreground">
          {t("pipelinesAdmin.triggers.actionForm.whatsapp.targetContactHint")}
        </p>
      )}
    </div>
  )
}

function ConnectorField({
  index,
  options,
  inactive,
  missing,
}: EditorProps & { options: SelectOption[]; inactive: boolean; missing: boolean }) {
  const { t } = useTranslation()
  const { control } = useAction(index)

  return (
    <div className="flex flex-col gap-2">
      {inactive || missing ? (
        <Callout tone="warning" icon={<TriangleAlert />}>
          {missing
            ? t("pipelinesAdmin.triggers.actionForm.whatsapp.connectorMissing")
            : t("pipelinesAdmin.triggers.actionForm.whatsapp.connectorInactive")}
        </Callout>
      ) : null}
      <SelectField
        control={control}
        name={`actions.${index}.connectorId`}
        label={t("pipelinesAdmin.triggers.actionForm.whatsapp.connector")}
        options={options}
        placeholder={t("pipelinesAdmin.triggers.actionForm.whatsapp.connectorPlaceholder")}
        disabled={options.length === 0}
      />
    </div>
  )
}

function NoConnectorNotice() {
  const { t } = useTranslation()
  const canManage = useCan("core_settings")
  return (
    <Callout
      tone="neutral"
      icon={<Info />}
      action={
        canManage ? (
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10"
            render={<Link to="/settings/integrations" />}
          >
            {t("pipelinesAdmin.triggers.actionForm.whatsapp.connectAction")}
          </Button>
        ) : undefined
      }
    >
      {t("pipelinesAdmin.triggers.actionForm.whatsapp.noConnector")}
    </Callout>
  )
}

export function WhatsappMessageEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { control, action } = useAction(index)
  const { options, selected, inactive, missing } = useConnectorOptions(MESSAGE_CONNECTOR_TYPES, action?.connectorId)
  const phoneAllowed = !selected || PHONE_CONNECTOR_TYPES.includes(selected.type)

  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 ? <NoConnectorNotice /> : null}
      <ConnectorField index={index} options={options} inactive={inactive} missing={missing} />
      <TargetFields index={index} phoneAllowed={phoneAllowed} />
      <TokenField
        control={control}
        name={`actions.${index}.message`}
        label={t("pipelinesAdmin.triggers.actionForm.whatsapp.message")}
        placeholder={t("pipelinesAdmin.triggers.actionForm.whatsapp.messagePlaceholder", TOKEN_VALUES)}
        multiline
        rows={3}
        preview
      />
    </div>
  )
}

const WABA_TYPES = ["whatsapp_cloud"]

/** As variáveis do corpo, na ordem em que aparecem: `{{1}}` ou nomeadas. Uma linha por variável. */
function bodyVariables(template: WhatsappTemplate | undefined): string[] {
  const body = template?.components.find((component) => component.type === "BODY")?.text ?? ""
  const names = [...body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1])
  return [...new Set(names)]
}

export function WhatsappTemplateEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { control, action, set } = useAction(index)
  const { options, inactive, missing } = useConnectorOptions(WABA_TYPES, action?.connectorId)

  const { data, isLoading } = useApi<{ templates: WhatsappTemplate[] }>(
    action?.connectorId ? `/connectors/${action.connectorId}/templates` : null,
    { revalidateOnFocus: false }
  )

  const templates = useMemo(() => (data?.templates ?? []).filter((template) => !template.removed), [data])
  const selected = templates.find((template) => template.id === action?.whatsappTemplateId)
  const variables = useMemo(() => bodyVariables(selected), [selected])
  const body = selected?.components.find((component) => component.type === "BODY")?.text

  const templateOptions = useMemo<SelectOption[]>(
    () =>
      templates.map((template) => ({
        value: template.id,
        label:
          template.status === "approved"
            ? template.name
            : t("pipelinesAdmin.triggers.actionForm.template.notApproved", { name: template.name }),
        disabled: template.status !== "approved" && template.id !== action?.whatsappTemplateId,
      })),
    [action?.whatsappTemplateId, t, templates]
  )

  // Uma entrada por variável: a API manda a lista para a Meta na mesma ordem.
  const current = action?.templateParams
  useEffect(() => {
    if (!selected) return
    if ((current?.length ?? 0) !== variables.length) {
      set("templateParams", variables.map((_, position) => current?.[position] ?? ""))
    }
    // `set` muda a cada render, e só a contagem interessa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, variables.length])

  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 ? <NoConnectorNotice /> : null}
      <ConnectorField index={index} options={options} inactive={inactive} missing={missing} />
      {action?.connectorId ? (
        <SelectField
          control={control}
          name={`actions.${index}.whatsappTemplateId`}
          label={t("pipelinesAdmin.triggers.actionForm.template.template")}
          hint={
            !isLoading && templates.length === 0
              ? t("pipelinesAdmin.triggers.actionForm.template.noTemplates")
              : undefined
          }
          options={templateOptions}
          placeholder={t("pipelinesAdmin.triggers.actionForm.template.placeholder")}
          disabled={templateOptions.length === 0}
        />
      ) : null}
      {body ? (
        <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-pretty whitespace-pre-wrap text-muted-foreground">
          {body}
        </p>
      ) : null}
      {variables.map((variable, position) => (
        <TokenField
          key={variable}
          control={control}
          name={`actions.${index}.templateParams.${position}`}
          label={t("pipelinesAdmin.triggers.actionForm.template.variable", { name: `{{${variable}}}` })}
          placeholder={t("pipelinesAdmin.triggers.actionForm.template.variablePlaceholder")}
          preview
        />
      ))}
      <TargetFields index={index} phoneAllowed />
    </div>
  )
}

/* ---------- automação ---------- */

export function ToggleAutomationEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { control, action, set } = useAction(index)
  const status = action?.automationStatus ?? "disabled"

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        aria-label={t("pipelinesAdmin.triggers.actionForm.automation.status")}
        value={status}
        onChange={(value) => set("automationStatus", value)}
        options={[
          { value: "disabled", label: t("pipelinesAdmin.triggers.actionForm.automation.pause") },
          { value: "enabled", label: t("pipelinesAdmin.triggers.actionForm.automation.resume") },
        ]}
      />
      {status === "disabled" ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            control={control}
            name={`actions.${index}.disableTime`}
            label={t("pipelinesAdmin.triggers.actionForm.automation.time")}
            min={1}
          />
          <SelectField
            control={control}
            name={`actions.${index}.disablePeriod`}
            label={t("pipelinesAdmin.triggers.actionForm.automation.period")}
            options={[
              { value: "minutes", label: t("pipelinesAdmin.triggers.actionForm.automation.minutes") },
              { value: "hours", label: t("pipelinesAdmin.triggers.actionForm.automation.hours") },
              { value: "days", label: t("pipelinesAdmin.triggers.actionForm.automation.days") },
            ]}
          />
        </div>
      ) : null}
      <p className="text-xs text-pretty text-muted-foreground">
        {t("pipelinesAdmin.triggers.actionForm.automation.hint")}
      </p>
    </div>
  )
}

/* ---------- webhook ---------- */

export function WebhookEditor({ index }: EditorProps) {
  const { t } = useTranslation()
  const { control } = useAction(index)
  const { fields, append, remove } = useFieldArray({
    control,
    name: `actions.${index}.headersList`,
    keyName: "key",
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <TextField
          control={control}
          name={`actions.${index}.url`}
          label={t("pipelinesAdmin.triggers.actionForm.webhook.url")}
          hint={t("pipelinesAdmin.triggers.actionForm.webhook.urlHint")}
          placeholder={t("pipelinesAdmin.triggers.actionForm.webhook.urlPlaceholder")}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <SelectField
          control={control}
          name={`actions.${index}.method`}
          label={t("pipelinesAdmin.triggers.actionForm.webhook.method")}
          options={[
            { value: "POST", label: "POST" },
            { value: "PUT", label: "PUT" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t("pipelinesAdmin.triggers.actionForm.webhook.headers")}</span>
        {fields.map((field, position) => (
          <div key={field.key} className="flex items-center gap-2">
            <HeaderInput
              index={index}
              position={position}
              part="name"
              label={t("pipelinesAdmin.triggers.actionForm.webhook.headerName")}
            />
            <HeaderInput
              index={index}
              position={position}
              part="value"
              label={t("pipelinesAdmin.triggers.actionForm.webhook.headerValue")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("pipelinesAdmin.triggers.actionForm.webhook.removeHeader")}
              className="shrink-0 text-muted-foreground pointer-coarse:size-10"
              onClick={() => remove(position)}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground pointer-coarse:h-10"
          onClick={() => append({ name: "", value: "" })}
        >
          <Plus />
          {t("pipelinesAdmin.triggers.actionForm.webhook.addHeader")}
        </Button>
      </div>

      <TokenField
        control={control}
        name={`actions.${index}.bodyTemplate`}
        label={t("pipelinesAdmin.triggers.actionForm.webhook.body")}
        hint={t("pipelinesAdmin.triggers.actionForm.webhook.bodyHint")}
        placeholder={t("pipelinesAdmin.triggers.actionForm.webhook.bodyPlaceholder", TOKEN_VALUES)}
        tokens={WEBHOOK_TOKENS}
        withCustomFields={false}
        multiline
        rows={3}
        mono
        optional
      />
    </div>
  )
}

function HeaderInput({
  index,
  position,
  part,
  label,
}: EditorProps & { position: number; part: "name" | "value"; label: string }) {
  const { control } = useFormContext<TriggerDraft>()
  const { field } = useController({ control, name: `actions.${index}.headersList.${position}.${part}` })

  return (
    <Input
      {...field}
      value={field.value ?? ""}
      aria-label={label}
      placeholder={label}
      spellCheck={false}
      autoComplete="off"
      className="font-mono text-xs"
    />
  )
}
