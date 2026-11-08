import { useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { ChevronRight, ExternalLink, FlaskConical, Lightbulb, PencilRuler, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { Callout, DetailSkeleton, ErrorState, FormActions, ResponsiveDialog, StatusBadge, TextField, useConfirm, useFormSubmit } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useCatalogTool, useToolCatalog, useToolInstallationMutations, useToolInstallations } from "@/hooks/tools/use-tool-catalog"
import { useToolFunctions } from "@/hooks/tools/use-tool-functions"
import { useCan } from "@/hooks/use-can"
import { useGuardedClose } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import { isRequired, knownCategory } from "@/lib/tools/catalog"
import type { CredentialSpec, FunctionParameter, ToolFunction } from "@/lib/tools/types"
import { cn } from "@/lib/utils"

import { StandaloneFunctionTester } from "./function-tester"
import { ParametersSummary } from "./parameters-editor"
import { useToolTexts } from "./tool-texts"
import { ToolLogo } from "./tool-logo"

// Uma ferramenta: o que ela faz, o que pede e, depois de instalada, como usar. É aqui que o dono da loja instala sem
// ver código, e é daqui que quem programa segue para a função.

type CredentialValues = Record<string, string>

function buildSchema(fields: CredentialSpec[], requireValues: boolean, requiredMessage: string) {
  return z.object(
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        requireValues && isRequired(field) ? z.string().trim().min(1, requiredMessage) : z.string(),
      ])
    )
  )
}

const blank = (fields: CredentialSpec[]): CredentialValues => Object.fromEntries(fields.map((field) => [field.name, ""]))

const filled = (values: CredentialValues): CredentialValues =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim().length > 0))

export type ToolPanelProps = {
  toolId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ToolPanel({ toolId, open, onOpenChange }: ToolPanelProps) {
  const { t } = useTranslation()
  const catalog = useToolCatalog()
  const detail = useCatalogTool(toolId)
  const { installations } = useToolInstallations()

  const installation = installations.find((item) => item.toolId === toolId) ?? null
  // Ferramenta tirada do catálogo continua instalada: o nome e as funções vêm da instalação.
  const summary = detail.tool ?? catalog.tools.find((tool) => tool.id === toolId) ?? installation?.tool ?? null

  if (!summary) {
    const missing = !detail.isLoading && !catalog.isLoading
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t("tools.panel.loading")} size="lg">
        {missing ? <ErrorState error={detail.error} onRetry={() => void detail.reload()} /> : <DetailSkeleton rows={5} />}
      </ResponsiveDialog>
    )
  }

  return (
    <LoadedPanel
      open={open}
      onOpenChange={onOpenChange}
      tool={summary}
      templates={detail.tool?.functionTemplates ?? null}
      loadingTemplates={detail.isLoading}
      functionCount={detail.tool?.functionCount ?? (catalog.tools.find((tool) => tool.id === toolId)?.functionCount ?? 0)}
      installationId={installation?.id ?? null}
    />
  )
}

type PanelTool = {
  id: string
  slug: string
  name: string
  description: string
  category: string | null
  icon: string | null
  imageUrl: string | null
  credentialsSchema: CredentialSpec[]
}

function LoadedPanel({
  open,
  onOpenChange,
  tool,
  templates,
  loadingTemplates,
  functionCount,
  installationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tool: PanelTool
  templates: { name: string; description: string; parameters: FunctionParameter[] }[] | null
  loadingTemplates: boolean
  functionCount: number
  installationId: string | null
}) {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const confirm = useConfirm()
  const canUseFlows = useCan("flows")
  const { installations } = useToolInstallations()
  const { functions } = useToolFunctions()
  const { install, uninstall, toggle, updateCredentials } = useToolInstallationMutations()
  const [toggling, setToggling] = useState(false)

  const installation = installationId ? (installations.find((item) => item.id === installationId) ?? null) : null
  const toolName = texts.name(tool)
  const fields = useMemo(() => tool.credentialsSchema ?? [], [tool.credentialsSchema])
  const requireValues = !installation?.hasCredentials

  const schema = useMemo(
    () => buildSchema(fields, requireValues, t("tools.credentials.required")),
    [fields, requireValues, t]
  )
  const form = useForm<CredentialValues>({
    resolver: zodResolver(schema),
    defaultValues: blank(fields),
    mode: "onBlur",
  })

  const close = useGuardedClose(form.formState.isDirty, () => onOpenChange(false))

  const submit = useFormSubmit(form, async (values) => {
    if (!installation) {
      await install(tool.id, filled(values))
      form.reset(blank(fields))
      toast.success(t("tools.panel.installed", { name: toolName }))
      return
    }
    const changes = filled(values)
    if (Object.keys(changes).length === 0) return
    await updateCredentials(installation.id, changes)
    form.reset(blank(fields))
    toast.success(t("tools.credentials.saved"))
  })

  const flip = async () => {
    if (!installation || toggling) return
    setToggling(true)
    try {
      const updated = await toggle(installation)
      toast.success(t(updated.enabled ? "tools.panel.turnedOn" : "tools.panel.turnedOff", { name: toolName }))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("tools.common.actionFailed"))
    } finally {
      setToggling(false)
    }
  }

  const remove = async () => {
    if (!installation) return
    const confirmed = await confirm({
      title: t("tools.panel.uninstallTitle", { name: toolName }),
      description: t("tools.panel.uninstallDescription"),
      confirmLabel: t("tools.panel.uninstall"),
      destructive: true,
      onConfirm: () => uninstall(installation.id),
    })
    if (confirmed) {
      toast.success(t("tools.panel.uninstalled", { name: toolName }))
      onOpenChange(false)
    }
  }

  // Em cada linha, a função de verdade quando já está instalada: é ela que se testa.
  const byName = useMemo(() => new Map(functions.map((fn) => [fn.name, fn])), [functions])
  const rows = useMemo(() => {
    if (templates) {
      return templates.map((template) => ({
        name: template.name,
        description: template.description,
        parameters: template.parameters ?? [],
        fn: installation ? (byName.get(template.name) ?? null) : null,
      }))
    }
    if (!installation) return []
    return functions
      .filter((fn) => fn.toolInstallationId === installation.id)
      .map((fn) => ({ name: fn.name, description: fn.description ?? "", parameters: fn.parameters, fn }))
  }, [byName, functions, installation, templates])

  const footer = !installation ? (
    <FormActions form={form} submitLabel={t("tools.panel.install")} onCancel={() => onOpenChange(false)} />
  ) : fields.length > 0 ? (
    <FormActions
      form={form}
      submitLabel={t("tools.credentials.save")}
      requireChanges
      secondary={
        <Button type="button" variant="ghost" className="text-status-danger hover:text-status-danger pointer-coarse:h-10" onClick={() => void remove()}>
          <Trash2 />
          {t("tools.panel.uninstall")}
        </Button>
      }
    />
  ) : (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Button type="button" variant="ghost" className="text-status-danger hover:text-status-danger pointer-coarse:h-10" onClick={() => void remove()}>
        <Trash2 />
        {t("tools.panel.uninstall")}
      </Button>
      <Button type="button" variant="outline" className="pointer-coarse:h-10" onClick={() => onOpenChange(false)}>
        {t("tools.common.close")}
      </Button>
    </div>
  )

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void close()
      }}
      title={toolName}
      description={t(`tools.categories.${knownCategory(tool.category)}`)}
      size="lg"
      onSubmit={submit}
      footer={footer}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3">
          <ToolLogo tool={tool} size="lg" className={cn(installation && !installation.enabled && "opacity-50")} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm text-pretty">{texts.description(tool)}</p>
            <p className="text-xs text-muted-foreground">{t("tools.card.functions", { count: functionCount || rows.length })}</p>
          </div>
        </div>

        {installation ? (
          <>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg p-3 ring-1 ring-foreground/10">
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{t("tools.panel.enabled")}</span>
                <span className="block text-xs text-pretty text-muted-foreground">{t("tools.panel.enabledHint")}</span>
              </span>
              <Switch checked={installation.enabled} disabled={toggling} onCheckedChange={() => void flip()} />
            </label>

            <Callout
              icon={<Lightbulb />}
              title={t("tools.panel.howToTitle")}
              action={
                canUseFlows ? (
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/flows" />} className="pointer-coarse:h-10">
                    <ExternalLink />
                    {t("tools.panel.openFlows")}
                  </Button>
                ) : undefined
              }
            >
              {t("tools.panel.howToDescription")}
            </Callout>
          </>
        ) : null}

        {fields.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">{t("tools.credentials.title")}</h3>
              <p className="mt-0.5 flex items-start gap-1.5 text-xs text-pretty text-muted-foreground">
                <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
                {t(installation?.hasCredentials ? "tools.credentials.hintKeep" : "tools.credentials.hint")}
              </p>
            </div>
            {fields.map((field) => (
              <TextField
                key={field.name}
                control={form.control}
                name={field.name}
                label={field.label || field.name}
                hint={field.help ?? undefined}
                optional={!isRequired(field)}
                type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                autoComplete={field.type === "password" ? "new-password" : "off"}
                placeholder={installation?.hasCredentials ? t("tools.credentials.keepPlaceholder") : undefined}
              />
            ))}
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{t("tools.panel.functionsTitle")}</h3>
              <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{t("tools.panel.functionsHint")}</p>
            </div>
            {installation ? (
              <Link
                to={`/tools/functions?origin=${tool.id}`}
                className="shrink-0 rounded text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("tools.panel.seeInFunctions")}
              </Link>
            ) : null}
          </div>
          {loadingTemplates && rows.length === 0 ? (
            <DetailSkeleton rows={3} />
          ) : (
            <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
              {rows.map((row) => (
                <IncludedFunction key={row.name} {...row} />
              ))}
            </ul>
          )}
        </section>

        {!installation ? (
          <p className="text-xs text-muted-foreground">{t("tools.panel.reversible")}</p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}

function IncludedFunction({
  name,
  description,
  parameters,
  fn,
}: {
  name: string
  description: string
  parameters: FunctionParameter[]
  fn: ToolFunction | null
}) {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const [expanded, setExpanded] = useState(false)
  const [testing, setTesting] = useState(false)
  const personalized = fn && !fn.locked

  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <ChevronRight
          className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={cn("block text-sm text-pretty", !expanded && "line-clamp-2")}>{texts.functionLabel(name, description)}</span>
          {personalized ? <StatusBadge tone="accent">{t("tools.panel.personalized")}</StatusBadge> : null}
        </span>
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 border-t bg-muted/20 px-3 py-3 pl-8">
          <div className="min-w-0 space-y-0.5">
            <code className="font-mono text-xs font-medium break-all">{name}</code>
            <p className="text-xs text-pretty text-muted-foreground">{description}</p>
          </div>
          <ParametersSummary parameters={parameters} />
          {fn ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {fn.locked ? (
                <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-10" onClick={() => setTesting((current) => !current)}>
                  <FlaskConical />
                  {t("tools.panel.test")}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link to={`/tools/functions/${fn.id}`} />} className="pointer-coarse:h-10">
                <PencilRuler />
                {t("tools.panel.openFunction")}
              </Button>
            </div>
          ) : null}
          {testing && fn ? <StandaloneFunctionTester fn={fn} /> : null}
        </div>
      ) : null}
    </li>
  )
}
