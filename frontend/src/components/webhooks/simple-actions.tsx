import { useMemo } from "react"
import { useController, useFormState, useWatch, type Control } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Code2, Contact, Globe, Plus, ShieldAlert, Tag, Trash2, TriangleAlert } from "lucide-react"

import { GatedCodeEditor } from "@/components/tools/gated-code-editor"
import { Callout, FormField, SearchableSelect, SelectField } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCustomFields } from "@/hooks/content/use-custom-fields"
import type { WebhookFormValues } from "@/lib/webhooks/form"
import { LITERAL } from "@/lib/webhooks/literal"
import { refusedReason } from "@/lib/webhooks/internal-url"

import { ActionCard } from "./action-card"
import { TemplateField, TemplateInput } from "./template-field"

type ActionProps = {
  control: Control<WebhookFormValues>
  index: number
  step: number
  onRemove: () => void
}

/* ---------- Identificar o contato ---------- */

/** Fixa e sempre a primeira: é ela que acha a conversa, e o resto depende disso. */
export function ContactAction({ control, index, step, active }: Omit<ActionProps, "onRemove"> & { active: boolean }) {
  const { t } = useTranslation()
  const config = `actions.${index}.config` as const
  const identifier = useWatch({ control, name: `${config}.contactIdentifier` })
  const missing = active && !identifier?.trim()

  return (
    <ActionCard
      step={step}
      icon={<Contact />}
      title={t("webhooks.actions.contact.title")}
      description={t("webhooks.actions.contact.description")}
      locked
    >
      {missing ? (
        <Callout tone="danger" icon={<TriangleAlert />}>
          {t("webhooks.actions.contact.missing")}
        </Callout>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TemplateField
          control={control}
          name={`${config}.contactIdentifier`}
          label={t("webhooks.actions.contact.identifier")}
          singleLine
          placeholder={t("webhooks.actions.contact.identifierPlaceholder", LITERAL)}
          hint={t("webhooks.actions.contact.identifierHint")}
        />
        <TemplateField
          control={control}
          name={`${config}.contactName`}
          label={t("webhooks.actions.contact.name")}
          optional
          singleLine
          placeholder={t("webhooks.actions.contact.namePlaceholder", LITERAL)}
          hint={t("webhooks.actions.contact.nameHint")}
        />
      </div>
    </ActionCard>
  )
}

/* ---------- Gravar num campo do contato ---------- */

export function UserFieldAction({ control, index, step, onRemove }: ActionProps) {
  const { t } = useTranslation()
  const { customFields, isLoading } = useCustomFields()
  const config = `actions.${index}.config` as const
  const options = useMemo(
    () => (customFields ?? []).map((field) => ({ value: field.id, label: field.name, description: field.key })),
    [customFields]
  )

  return (
    <ActionCard
      step={step}
      icon={<Tag />}
      title={t("webhooks.actions.userField.title")}
      description={t("webhooks.actions.userField.description")}
      removeLabel={t("webhooks.actions.remove", { name: t("webhooks.actions.userField.title") })}
      onRemove={onRemove}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={`${config}.customFieldId`}
          label={t("webhooks.actions.userField.field")}
          action={
            <Link to="/settings/custom-fields" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {t("webhooks.actions.userField.manage")}
            </Link>
          }
        >
          {({ field, controlProps }) => (
            <SearchableSelect
              {...controlProps}
              value={(field.value as string | null) ?? null}
              options={options}
              placeholder={isLoading ? t("webhooks.common.loading") : t("webhooks.actions.userField.fieldPick")}
              emptyLabel={t("webhooks.actions.userField.fieldEmpty")}
              onChange={(next) => field.onChange(next)}
            />
          )}
        </FormField>
        <TemplateField
          control={control}
          name={`${config}.valueTemplate`}
          label={t("webhooks.actions.userField.value")}
          singleLine
          placeholder={t("webhooks.actions.userField.valuePlaceholder", LITERAL)}
        />
      </div>
    </ActionCard>
  )
}

/* ---------- Executar código ---------- */

export function CodeAction({ control, index, step, onRemove }: ActionProps) {
  const { t } = useTranslation()
  const { field, fieldState } = useController({ control, name: `actions.${index}.config.code` })

  return (
    <ActionCard
      step={step}
      icon={<Code2 />}
      title={t("webhooks.actions.code.title")}
      description={t("webhooks.actions.code.description")}
      removeLabel={t("webhooks.actions.remove", { name: t("webhooks.actions.code.title") })}
      onRemove={onRemove}
    >
      <div className="flex flex-col gap-1.5">
        <GatedCodeEditor
          value={(field.value as string) ?? ""}
          onChange={field.onChange}
          height={240}
          aria-label={t("webhooks.actions.code.title")}
        />
        {fieldState.error?.message ? (
          <p role="alert" className="text-xs text-destructive">
            {fieldState.error.message}
          </p>
        ) : (
          <p className="text-xs text-pretty text-muted-foreground">{t("webhooks.actions.code.hint")}</p>
        )}
      </div>
    </ActionCard>
  )
}

/* ---------- Chamar outro endereço ---------- */

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

// Nome de cabeçalho que costuma carregar segredo: depois de salvo, o valor não fica à vista na tela.
const SECRET_HEADER = /authorization|token|secret|api[-_]?key|password|senha/i

export function HttpAction({ control, index, step, onRemove }: ActionProps) {
  const { t } = useTranslation()
  const config = `actions.${index}.config` as const
  const url = useWatch({ control, name: `${config}.url` })
  const method = useWatch({ control, name: `${config}.httpMethod` })
  const reason = refusedReason(url ?? "")

  return (
    <ActionCard
      step={step}
      icon={<Globe />}
      title={t("webhooks.actions.http.title")}
      description={t("webhooks.actions.http.description")}
      removeLabel={t("webhooks.actions.remove", { name: t("webhooks.actions.http.title") })}
      onRemove={onRemove}
    >
      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <SelectField
          control={control}
          name={`${config}.httpMethod`}
          label={t("webhooks.actions.http.method")}
          options={METHODS.map((value) => ({ value, label: value }))}
        />
        <TemplateField
          control={control}
          name={`${config}.url`}
          label={t("webhooks.actions.http.url")}
          singleLine
          mono
          placeholder={t("webhooks.actions.http.urlPlaceholder")}
          hint={reason ? undefined : t("webhooks.actions.http.urlHint")}
        />
      </div>

      {reason ? (
        <Callout tone="warning" icon={<ShieldAlert />} title={t(`webhooks.actions.http.refused.${reason}.title`)}>
          {t(`webhooks.actions.http.refused.${reason}.description`)}
        </Callout>
      ) : null}

      <HttpHeaders control={control} index={index} />

      {method !== "GET" ? (
        <TemplateField
          control={control}
          name={`${config}.body`}
          label={t("webhooks.actions.http.body")}
          optional
          mono
          rows={4}
          placeholder={t("webhooks.actions.http.bodyPlaceholder", LITERAL)}
          hint={t("webhooks.actions.http.bodyHint")}
        />
      ) : null}

      <p className="text-xs text-pretty text-muted-foreground">{t("webhooks.actions.http.failureHint")}</p>
    </ActionCard>
  )
}

function HttpHeaders({ control, index }: { control: Control<WebhookFormValues>; index: number }) {
  const { t } = useTranslation()
  const name = `actions.${index}.config.headers` as const
  const { field } = useController({ control, name })
  const { errors } = useFormState({ control, name })
  const headers = (field.value ?? []) as { key: string; value: string }[]
  const headerErrors = errors.actions?.[index]?.config?.headers as ({ key?: { message?: string } } | undefined)[] | undefined

  const patch = (position: number, changes: Partial<{ key: string; value: string }>) =>
    field.onChange(headers.map((header, item) => (item === position ? { ...header, ...changes } : header)))

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("webhooks.actions.http.headers")}</p>
      {headers.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {headers.map((header, position) => {
            const error = headerErrors?.[position]?.key?.message
            const secret = SECRET_HEADER.test(header.key)
            return (
              <li key={position} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0 max-sm:col-span-2 max-sm:row-start-1">
                  <Input
                    value={header.key}
                    aria-label={t("webhooks.actions.http.headerName")}
                    aria-invalid={Boolean(error)}
                    className="font-mono md:text-[13px]"
                    placeholder={t("webhooks.actions.http.headerNamePlaceholder")}
                    onChange={(event) => patch(position, { key: event.target.value })}
                  />
                  {error ? (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      {error}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  {secret ? (
                    <Input
                      type="password"
                      autoComplete="off"
                      value={header.value}
                      aria-label={t("webhooks.actions.http.headerValue")}
                      className="font-mono md:text-[13px]"
                      placeholder={t("webhooks.actions.http.headerValuePlaceholder")}
                      onChange={(event) => patch(position, { value: event.target.value })}
                    />
                  ) : (
                    <TemplateInput
                      singleLine
                      mono
                      aria-label={t("webhooks.actions.http.headerValue")}
                      value={header.value}
                      placeholder={t("webhooks.actions.http.headerValuePlaceholder")}
                      onChange={(value) => patch(position, { value })}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("webhooks.actions.http.headerRemove", { name: header.key })}
                  className="text-muted-foreground hover:text-status-danger pointer-coarse:size-10"
                  onClick={() => field.onChange(headers.filter((_, item) => item !== position))}
                >
                  <Trash2 />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start border-dashed pointer-coarse:h-10"
        onClick={() => field.onChange([...headers, { key: "", value: "" }])}
      >
        <Plus />
        {t("webhooks.actions.http.headerAdd")}
      </Button>
    </div>
  )
}
