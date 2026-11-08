import { useCallback, useMemo, useState } from "react"
import { useFormContext, useFormState, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Eye, FileText, RefreshCw, SearchX, TriangleAlert } from "lucide-react"

import {
  Callout,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SearchInput,
  StatusBadge,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useConnectorTemplates, useRecipientSummary } from "@/hooks/campaigns-wizard/use-campaign-options"
import { useDraft } from "@/hooks/campaigns-wizard/use-draft"
import { useCan } from "@/hooks/use-can"
import type { WizardValues } from "@/lib/campaigns-wizard/form"
import { templateFitsCampaign, templatePositions } from "@/lib/campaigns-wizard/templates"
import { asToken, variableProblems } from "@/lib/campaigns-wizard/variables"
import { sendableTemplates, templateTitle, templateVariables } from "@/lib/chat-details/template-params"
import { templateSummary } from "@/lib/connectors/template-builder"
import type { WhatsappTemplate } from "@/lib/connectors/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"
import { VariableField } from "../variable-field"

const NO_TEMPLATES: WhatsappTemplate[] = []

function TemplateRow({
  template,
  selected,
  onToggle,
  onPreview,
  onOpenPreview,
}: {
  template: WhatsappTemplate
  selected: boolean
  onToggle: () => void
  onPreview: () => void
  onOpenPreview: () => void
}) {
  const { t } = useTranslation()
  const usable = templateFitsCampaign(template)

  return (
    <div
      onMouseEnter={onPreview}
      className={cn(
        "flex items-start gap-1 rounded-lg border transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        selected && "border-primary bg-primary/5",
        !usable && "opacity-70 hover:bg-transparent"
      )}
    >
      <label
        onFocus={onPreview}
        className={cn(
          "flex min-h-14 min-w-0 flex-1 cursor-pointer items-start gap-3 p-2.5",
          !usable && "cursor-not-allowed"
        )}
      >
        <Checkbox
          checked={selected}
          disabled={!usable}
          onCheckedChange={onToggle}
          aria-label={templateTitle(template.name)}
          className="mt-0.5"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{templateTitle(template.name)}</span>
            <StatusBadge tone="neutral">
              {t(`connectors.templates.categories.${template.category}`, {
                defaultValue: template.category ?? "",
              })}
            </StatusBadge>
            <span className="text-xs text-muted-foreground">
              {t(`connectors.templates.languages.${template.language}`, {
                defaultValue: template.language ?? "",
              })}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-pretty text-muted-foreground">
            {usable ? templateSummary(template) : t("campaignsWizard.template.notUsable")}
          </span>
        </span>
      </label>
      {/* Sem mouse para passar por cima: no celular, ver o modelo antes de escolher é um toque. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="m-1 shrink-0 text-muted-foreground lg:hidden pointer-coarse:size-10"
        aria-label={t("campaignsWizard.template.preview", { name: templateTitle(template.name) })}
        onClick={onOpenPreview}
      >
        <Eye />
      </Button>
    </div>
  )
}

function TemplateParams({
  template,
  params,
  onChange,
  variables,
}: {
  template: WhatsappTemplate
  params: Record<string, string>
  onChange: (position: string, value: string) => void
  variables: Parameters<typeof VariableField>[0]["variables"]
}) {
  const { t } = useTranslation()
  const body = templateVariables(template)
  if (body.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t("campaignsWizard.template.fill", { name: templateTitle(template.name) })}
      </p>
      {body.map((variable) => {
        const position = variable.name
        const id = `template-${template.id}-${position}`
        return (
          <div key={position} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium">
              {t("campaignsWizard.template.position", { position })}
            </label>
            <VariableField
              id={id}
              value={params[position] ?? ""}
              onChange={(value) => onChange(position, value)}
              variables={variables}
              hideShortcuts
              placeholder={
                variable.example
                  ? t("campaignsWizard.template.example", { example: variable.example })
                  : t("campaignsWizard.template.fixedOrVariable")
              }
            />
          </div>
        )
      })}
    </div>
  )
}

/** Modelos aprovados: procurar, escolher um ou mais (um rodízio) e dizer o que entra em cada lacuna. */
export function TemplateComposer({
  onPreview,
  onOpenPreview,
}: {
  onPreview: (id: string | null) => void
  onOpenPreview: (id: string) => void
}) {
  const { t } = useTranslation()
  const language = useLanguage()
  const canManage = useCan("core_settings")
  const { control, setValue, clearErrors } = useFormContext<WizardValues>()
  const { campaignId } = useDraft()
  const { summary } = useRecipientSummary(campaignId)

  const wabaConnectorId = useWatch({ control, name: "wabaConnectorId" })
  const templateIds = useWatch({ control, name: "templateIds" })
  const templateParams = useWatch({ control, name: "templateParams" })
  const { errors } = useFormState<WizardValues>({ name: ["templateIds", "templateParams"] })

  const { templates, error, isLoading, reload } = useConnectorTemplates(wabaConnectorId)
  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const all = templates ?? NO_TEMPLATES
  const sendable = useMemo(() => sendableTemplates(all), [all])
  const found = useMemo(
    () =>
      sendable.filter(
        (template) =>
          !query.trim() ||
          matchesSearch(templateTitle(template.name), query) ||
          matchesSearch(template.category ?? "", query) ||
          matchesSearch(template.language ?? "", query) ||
          matchesSearch(templateSummary(template) ?? "", query)
      ),
    [query, sendable]
  )
  const waiting = all.length - sendable.length
  const selected = useMemo(
    () => sendable.filter((template) => templateIds.includes(template.id)),
    [sendable, templateIds]
  )

  const toggle = useCallback(
    (template: WhatsappTemplate) => {
      const isSelected = templateIds.includes(template.id)
      setValue(
        "templateIds",
        isSelected ? templateIds.filter((id) => id !== template.id) : [...templateIds, template.id],
        { shouldDirty: true }
      )

      const nextParams = { ...templateParams }
      if (isSelected) {
        delete nextParams[template.id]
      } else if (templatePositions(template).includes("1")) {
        // É o que o servidor faria com a primeira lacuna vazia: melhor a pessoa ver.
        nextParams[template.id] = { 1: asToken("nome"), ...nextParams[template.id] }
      }
      setValue("templateParams", nextParams, { shouldDirty: true })
      clearErrors(["templateIds", "templateParams"])
    },
    [clearErrors, setValue, templateIds, templateParams]
  )

  const changeParam = useCallback(
    (templateId: string, position: string, value: string) => {
      setValue(
        "templateParams",
        { ...templateParams, [templateId]: { ...templateParams[templateId], [position]: value } },
        { shouldDirty: true }
      )
    },
    [setValue, templateParams]
  )

  async function refresh() {
    setRefreshing(true)
    try {
      await reload()
    } finally {
      setRefreshing(false)
    }
  }

  if (!wabaConnectorId) return null
  if (isLoading) return <ListSkeleton rows={4} />
  if (error) return <ErrorState error={error} onRetry={() => void reload()} className="border-0 p-4" />

  if (sendable.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border p-2">
        <EmptyState
          icon={<FileText className="size-5" />}
          title={t("campaignsWizard.template.none")}
          description={t("campaignsWizard.template.noneHint")}
          className="border-0 p-4"
        />
        {canManage ? (
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:h-10"
            nativeButton={false}
            render={<Link to={`/settings/integrations/${wabaConnectorId}`} />}
          >
            {t("campaignsWizard.template.manage")}
          </Button>
        ) : null}
      </div>
    )
  }

  const problems = variableProblems(
    Object.values(templateParams).flatMap((params) => Object.values(params)),
    summary.variables,
    summary.total
  )
  const paramsError = errors.templateParams?.message ?? errors.templateIds?.message

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {sendable.length > 4 ? (
          <SearchInput
            value={query}
            onChange={setQuery}
            debounce={0}
            shortcut={false}
            placeholder={t("campaignsWizard.template.search")}
            className="flex-1"
          />
        ) : (
          <h3 className="flex-1 text-sm font-medium">{t("campaignsWizard.template.pick")}</h3>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground pointer-coarse:size-10"
          aria-label={t("campaignsWizard.template.refresh")}
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
        </Button>
      </div>

      {found.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={t("campaignsWizard.template.noResults")}
          className="border-0 p-4"
        />
      ) : (
        // Passar o mouse mostra o modelo na prévia; sair da lista volta para o que foi escolhido.
        <div className="flex flex-col gap-2" onMouseLeave={() => onPreview(null)} onBlur={() => onPreview(null)}>
          {found.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              selected={templateIds.includes(template.id)}
              onToggle={() => toggle(template)}
              onPreview={() => onPreview(template.id)}
              onOpenPreview={() => onOpenPreview(template.id)}
            />
          ))}
        </div>
      )}

      {paramsError ? (
        <p role="alert" className="text-sm text-destructive">
          {String(paramsError)}
        </p>
      ) : null}

      {waiting > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("campaignsWizard.template.waiting", { count: waiting })}
        </p>
      ) : null}

      {selected.map((template) => (
        <TemplateParams
          key={template.id}
          template={template}
          params={templateParams[template.id] ?? {}}
          onChange={(position, value) => changeParam(template.id, position, value)}
          variables={summary.variables}
        />
      ))}

      {selected.length > 1 ? (
        <p className="text-xs text-pretty text-muted-foreground">{t("campaignsWizard.template.rotationHint")}</p>
      ) : null}

      {problems.length > 0 ? (
        <Callout tone="warning" icon={<TriangleAlert />} role="status">
          <ul className="flex flex-col gap-0.5">
            {problems.map((problem) => (
              <li key={problem.token}>
                {problem.count > 0
                  ? t("campaignsWizard.message.variablePartial", {
                      token: asToken(problem.token),
                      count: formatNumber(problem.count, language),
                      total: formatNumber(summary.total, language),
                    })
                  : t("campaignsWizard.message.variableMissing", { token: asToken(problem.token) })}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </div>
  )
}
