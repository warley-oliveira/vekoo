import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { CalendarDays, ChartNoAxesCombined, Plus } from "lucide-react"

import "@/components/dashboard/viz-tokens.css"
import { AgendaTab } from "@/components/dashboard/agenda-tab"
import { OverviewTab } from "@/components/dashboard/overview-tab"
import { PeriodPicker, PeriodPresets } from "@/components/dashboard/period-filter"
import { PageBody } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCalendarStats } from "@/hooks/insights/use-dashboard"
import { useDashboardExtraTabs } from "@/hooks/insights/use-dashboard-extra-tabs"
import { useDashboardPeriod } from "@/hooks/insights/use-dashboard-period"
import { useCan } from "@/hooks/use-can"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"

const OVERVIEW = "overview"
const AGENDA = "agenda"

// O sublinhado padrão fica fora da altura da aba, e a fileira rola de lado: ele sairia cortado. Sem
// ícone no celular: "Agenda" precisa caber inteira ao lado das datas.
const TAB_TRIGGER =
  "h-10 flex-none px-2.5 after:bg-primary group-data-horizontal/tabs:after:bottom-0 max-sm:[&_svg]:hidden"

export default function DashboardPage() {
  const { t } = useTranslation()
  const language = useLanguage()
  const canCalendar = useCan("calendar")
  const { period, setPreset, setRange } = useDashboardPeriod()
  const extra = useDashboardExtraTabs()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get("tab")
  const activeTab = useMemo(() => {
    if (tabParam === AGENDA && canCalendar) return AGENDA
    if (tabParam && extra.tabs.some((tab) => tab.id === tabParam)) return tabParam
    return OVERVIEW
  }, [canCalendar, extra.tabs, tabParam])

  const setTab = useCallback(
    (tab: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (tab === OVERVIEW) next.delete("tab")
          else next.set("tab", tab)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const activeExtra = extra.tabs.find((tab) => tab.id === activeTab)
  // A mesma chave da aba: o SWR não pede duas vezes.
  const { stats } = useCalendarStats(period, canCalendar && activeTab === AGENDA)

  return (
    <PageBody variant="wide">
      <Tabs value={activeTab} onValueChange={(value) => setTab(String(value))} className="gap-6">
        {/* Abas e datas em cima, e os atalhos embaixo. Uma linha só em tela bem larga: as abas crescem
            com os dashboards da pessoa e, espremidas, cortavam a primeira em "são geral". */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 [grid-template-areas:'tabs_picker''presets_presets'] min-[1700px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[1700px]:[grid-template-areas:'tabs_presets_picker']">
          <div className="overflow-x-auto [grid-area:tabs] [scrollbar-width:none]">
            <TabsList
              variant="line"
              aria-label={t("dashboard.tabs.label")}
              className="justify-start p-0 group-data-horizontal/tabs:h-10"
            >
              <TabsTrigger value={OVERVIEW} className={TAB_TRIGGER}>
                <ChartNoAxesCombined />
                {t("dashboard.tabs.overview")}
              </TabsTrigger>
              {canCalendar ? (
                <TabsTrigger value={AGENDA} className={TAB_TRIGGER}>
                  <CalendarDays />
                  {t("dashboard.tabs.agenda")}
                  {stats?.total ? (
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {formatNumber(stats.total, language)}
                    </span>
                  ) : null}
                </TabsTrigger>
              ) : null}
              {/* Os dashboards personalizados entram aqui: ver `useDashboardExtraTabs`. */}
              {extra.tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className={TAB_TRIGGER}>
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
              {extra.create ? (
                <Button type="button" variant="ghost" size="sm" className="ml-1 shrink-0" onClick={extra.create.onClick}>
                  <Plus />
                  {extra.create.label}
                </Button>
              ) : null}
            </TabsList>
          </div>
          <PeriodPresets period={period} onPreset={setPreset} className="[grid-area:presets] min-[1700px]:justify-self-end" />
          <PeriodPicker
            period={period}
            onRange={setRange}
            className="w-41 [grid-area:picker] max-sm:[&_button]:px-2 max-sm:[&_button]:text-xs sm:w-52"
          />
        </div>

        <TabsContent value={OVERVIEW}>
          <OverviewTab period={period} onPreset={setPreset} />
        </TabsContent>
        {canCalendar ? (
          <TabsContent value={AGENDA}>
            <AgendaTab period={period} />
          </TabsContent>
        ) : null}
        {activeExtra ? <TabsContent value={activeExtra.id}>{activeExtra.render(period)}</TabsContent> : null}
      </Tabs>
    </PageBody>
  )
}
