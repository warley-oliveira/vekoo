import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Download, Loader2, PackageOpen, Search } from "lucide-react"
import { toast } from "sonner"

import { ToolCard } from "@/components/tools/tool-card"
import { ToolPanel } from "@/components/tools/tool-panel"
import { useToolTexts } from "@/components/tools/tool-texts"
import { ToolsNav } from "@/components/tools/tools-nav"
import { CardGridSkeleton, EmptyState, ErrorState, FacetedFilter, FilterBar, PageBody, PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePanelParam } from "@/hooks/content/use-panel-param"
import { useToolCatalog, useToolInstallationMutations, useToolInstallations } from "@/hooks/tools/use-tool-catalog"
import { useToolFunctions } from "@/hooks/tools/use-tool-functions"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { ApiError } from "@/lib/api"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"
import { groupByCategory, knownCategory } from "@/lib/tools/catalog"
import type { CatalogTool, ToolInstallation } from "@/lib/tools/types"

// O catálogo. Quem chega aqui pode nunca ter visto uma linha de código: nada nesta tela fala em JavaScript, e instalar
// uma ferramenta sem chave é um clique. O código mora na outra aba, para quem foi atrás dele.

export default function ToolsPage() {
  const { t } = useTranslation()
  const texts = useToolTexts()
  const preset = useMotionPreset()
  const catalog = useToolCatalog()
  const installed = useToolInstallations()
  const { functions, hasData: functionsLoaded } = useToolFunctions()
  const { install, toggle } = useToolInstallationMutations()
  const panel = usePanelParam("tool")

  const [query, setQuery] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const panelOpen = Boolean(panel.selectedId)
  const panelKey = useOpenCount(panelOpen)
  const shownToolId = useRetained(panel.selectedId)

  // Link para uma ferramenta que não existe mais: a tela segue, sem painel nenhum.
  const known = catalog.hasData && installed.hasData
  const selectedExists =
    panel.selectedId &&
    (catalog.tools.some((tool) => tool.id === panel.selectedId) ||
      installed.installations.some((item) => item.toolId === panel.selectedId))
  useEffect(() => {
    if (panel.selectedId && known && !selectedExists) panel.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.selectedId, known, selectedExists])

  const functionCountOf = (installation: ToolInstallation) =>
    functionsLoaded
      ? functions.filter((fn) => fn.toolInstallationId === installation.id).length
      : installation.toolFunctionIds.length

  const categoryLabel = (tool: { category: string | null }) => t(`tools.categories.${knownCategory(tool.category)}`)

  // Procura no texto de gente e no da API: quem digita "tags" acha "Etiquetas do contato".
  const matches = (tool: { name: string; slug: string; description: string; category: string | null }) => {
    if (categories.length > 0 && !categories.includes(knownCategory(tool.category))) return false
    if (!query) return true
    return matchesSearch(`${texts.name(tool)} ${texts.description(tool)} ${tool.name} ${tool.description} ${categoryLabel(tool)}`, query)
  }

  const installedToolIds = useMemo(() => new Set(installed.installations.map((item) => item.toolId)), [installed.installations])

  const visibleInstalled = installed.installations.filter((item) => item.tool && matches(item.tool))
  const available = catalog.tools.filter((tool) => !installedToolIds.has(tool.id))
  const visibleAvailable = available.filter(matches)
  // Na ordem das categorias: quem filtra por uma vê as outras saírem sem o resto mudar de lugar.
  const orderedAvailable = groupByCategory(visibleAvailable).flatMap((group) => group.tools)

  const categoryOptions = useMemo(() => {
    const everything = [...catalog.tools, ...installed.installations.flatMap((item) => (item.tool && !catalog.tools.some((tool) => tool.id === item.toolId) ? [item.tool] : []))]
    return groupByCategory(everything).map(({ category, tools }) => ({
      value: category,
      label: t(`tools.categories.${category}`),
      count: tools.length,
    }))
  }, [catalog.tools, installed.installations, t])

  const clearFilters = () => {
    setQuery("")
    setCategories([])
  }

  const quickInstall = async (tool: CatalogTool) => {
    // Quem pede chave precisa do formulário.
    if (tool.requiresCredentials || tool.credentialsSchema.length > 0) {
      panel.open(tool.id)
      return
    }
    setInstalling(tool.id)
    try {
      await install(tool.id)
      toast.success(t("tools.panel.installed", { name: texts.name(tool) }), {
        description: t("tools.page.installedHint"),
        action: { label: t("tools.page.seeHowTo"), onClick: () => panel.open(tool.id) },
      })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("tools.common.actionFailed"))
    } finally {
      setInstalling(null)
    }
  }

  const flip = async (installation: ToolInstallation) => {
    setToggling(installation.id)
    try {
      const updated = await toggle(installation)
      toast.success(t(updated.enabled ? "tools.panel.turnedOn" : "tools.panel.turnedOff", { name: installation.tool ? texts.name(installation.tool) : "" }))
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("tools.common.actionFailed"))
    } finally {
      setToggling(null)
    }
  }

  const loading = (catalog.isLoading && !catalog.hasData) || (installed.isLoading && !installed.hasData)
  const failure = (!catalog.hasData && catalog.error) || (!installed.hasData && installed.error)
  const filtering = Boolean(query) || categories.length > 0
  const nothingVisible = visibleInstalled.length === 0 && visibleAvailable.length === 0
  const total = catalog.tools.length

  return (
    <PageBody>
      <PageHeader description={t("tools.page.description")} />
      <ToolsNav />

      {failure ? (
        <ErrorState
          error={failure}
          onRetry={() => {
            void catalog.reload()
            void installed.reload()
          }}
        />
      ) : loading ? (
        <div className="flex flex-col gap-6">
          <CardGridSkeleton cards={6} />
        </div>
      ) : total === 0 && installed.installations.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="size-5" />}
          title={t("tools.page.emptyTitle")}
          description={t("tools.page.emptyDescription")}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <FilterBar
            search={{ value: query, onChange: setQuery, debounce: 0, placeholder: t("tools.page.search") }}
            activeCount={categories.length ? 1 : 0}
            onClear={clearFilters}
            resultLabel={t("tools.page.count", { count: visibleInstalled.length + visibleAvailable.length })}
            filters={
              <FacetedFilter title={t("tools.page.category")} options={categoryOptions} value={categories} onChange={setCategories} />
            }
          />

          {nothingVisible ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title={t("tools.page.noResultsTitle")}
              description={t("tools.page.noResultsDescription")}
              action={{ label: t("tools.common.clearFilters"), onClick: clearFilters }}
            />
          ) : null}

          {visibleInstalled.length > 0 ? (
            <section aria-labelledby="tools-installed" className="flex flex-col gap-3">
              <SectionHeading id="tools-installed" title={t("tools.page.installedTitle")} hint={t("tools.page.installedCount", { count: visibleInstalled.length })} />
              <motion.div {...preset.stagger} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {visibleInstalled.map((installation) => {
                    const tool = installation.tool
                    if (!tool) return null
                    return (
                      <motion.div key={installation.id} {...preset.listItem} className="min-w-0">
                        <ToolCard
                          tool={tool}
                          categoryLabel={categoryLabel(tool)}
                          functionCount={functionCountOf(installation)}
                          needsCredentials={tool.credentialsSchema.length > 0 && !installation.hasCredentials}
                          off={!installation.enabled}
                          onOpen={() => panel.open(tool.id)}
                          control={
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="flex items-center">
                                    <Switch
                                      checked={installation.enabled}
                                      disabled={toggling === installation.id}
                                      aria-label={t(installation.enabled ? "tools.page.turnOff" : "tools.page.turnOn", { name: texts.name(tool) })}
                                      onCheckedChange={() => void flip(installation)}
                                    />
                                  </span>
                                }
                              />
                              <TooltipContent side="top">
                                {t(installation.enabled ? "tools.page.turnOff" : "tools.page.turnOn", { name: texts.name(tool) })}
                              </TooltipContent>
                            </Tooltip>
                          }
                        />
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            </section>
          ) : null}

          {orderedAvailable.length > 0 ? (
            <section aria-labelledby="tools-available" className="flex flex-col gap-3">
              <SectionHeading id="tools-available" title={t("tools.page.availableTitle")} hint={t("tools.page.count", { count: orderedAvailable.length })} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {orderedAvailable.map((tool) => (
                    <motion.div key={tool.id} {...preset.listItem} className="min-w-0">
                      <ToolCard
                        tool={tool}
                        categoryLabel={categoryLabel(tool)}
                        functionCount={tool.functionCount}
                        needsCredentials={tool.requiresCredentials}
                        onOpen={() => panel.open(tool.id)}
                        control={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={installing === tool.id}
                            aria-label={t("tools.page.installTool", { name: texts.name(tool) })}
                            className="pointer-coarse:h-10"
                            onClick={() => void quickInstall(tool)}
                          >
                            {installing === tool.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}
                            {t("tools.panel.install")}
                          </Button>
                        }
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          ) : null}

          {!filtering && available.length === 0 && installed.installations.length > 0 ? (
            <p className="text-sm text-muted-foreground">{t("tools.page.allInstalled")}</p>
          ) : null}
        </div>
      )}

      {shownToolId ? (
        <ToolPanel
          key={panelKey}
          toolId={shownToolId}
          open={panelOpen}
          onOpenChange={(open) => {
            if (!open) panel.close()
          }}
        />
      ) : null}
    </PageBody>
  )
}

function SectionHeading({ id, title, hint }: { id: string; title: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="font-heading text-base font-medium">
        {title}
      </h2>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  )
}
