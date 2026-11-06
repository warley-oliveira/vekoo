import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { Plug, Plus, RefreshCw, Search } from "lucide-react"

import {
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  SearchInput,
  SegmentedControl,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LoadingRegion } from "@/components/shared"
import { ConnectFlow, type ConnectTarget } from "@/components/connectors/connect/connect-flow"
import { ConnectorAlertNotice } from "@/components/connectors/connector-alert"
import { ConnectorRow } from "@/components/connectors/connector-row"
import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { useConnectorAlerts } from "@/hooks/connectors/use-connector-alerts"
import { useConnectors } from "@/hooks/connectors/use-connectors"
import { useIsMobile } from "@/hooks/use-is-mobile"
import {
  channelGroup,
  connectorHandle,
  withoutInstanceName,
  type ChannelGroup,
} from "@/lib/connectors/channels"
import { INSTAGRAM_RESUME_PARAM, takeInstagramResume } from "@/lib/connectors/instagram-oauth"
import type { Connector } from "@/lib/connectors/types"
import { useMotionPreset } from "@/lib/motion"
import { matchesSearch } from "@/lib/search-text"
import { cn } from "@/lib/utils"

type Filter = "all" | ChannelGroup

const GROUPS: ChannelGroup[] = ["attention", "connected", "off"]

/** Busca só faz sentido com uma lista que não cabe no olho. */
const SEARCH_FROM = 7

/** Enquanto um canal espera o QR code, a lista confere de tempos em tempos. */
const PENDING_REFRESH_MS = 5_000

export default function ConnectorsPage() {
  const { t } = useTranslation()
  const texts = useConnectorTexts()
  const preset = useMotionPreset()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [target, setTarget] = useState<ConnectTarget | null>(null)

  const { data, error, isLoading, isValidating, mutate } = useConnectors({
    refreshInterval: (latest) =>
      latest?.connectors.some((connector) => connector.status === "pending")
        ? PENDING_REFRESH_MS
        : 0,
  })
  const alerts = useConnectorAlerts()

  const connectors = useMemo(() => data?.connectors ?? [], [data])

  // Voltou de um login do Instagram que aconteceu fora da janela: termina o que começou.
  const [searchParams, setSearchParams] = useSearchParams()
  const resuming = searchParams.get(INSTAGRAM_RESUME_PARAM) === "resume"
  const resumed = useRef(false)
  useEffect(() => {
    if (!resuming || !data || resumed.current) return
    resumed.current = true
    setSearchParams({}, { replace: true })

    const pending = takeInstagramResume()
    if (!pending) return
    const connector = pending.connectorId
      ? data.connectors.find((item) => item.id === pending.connectorId)
      : undefined
    setTarget(
      connector
        ? { kind: "existing", connector, instagramLogin: pending.login }
        : { kind: "new", instagramLogin: pending.login }
    )
  }, [resuming, data, setSearchParams])
  const knownIds = useMemo(() => new Set(connectors.map((item) => item.id)), [connectors])

  // Aviso de um canal que não está na lista: o canal saiu, ou o aviso veio de outro lugar.
  // Ele aparece mesmo assim: é o que o número do menu conta, e sumir com ele deixaria um
  // "2" no menu sem nada na tela para explicar.
  const orphanAlerts = alerts.alerts.filter((alert) => !knownIds.has(alert.originId))

  const grouped = useMemo(() => {
    const result: Record<ChannelGroup, Connector[]> = { attention: [], connected: [], off: [] }
    for (const connector of connectors) {
      const hasAlert = alerts.byConnector.has(connector.id)
      result[channelGroup(connector, hasAlert)].push(connector)
    }
    return result
  }, [connectors, alerts.byConnector])

  const counts: Record<Filter, number> = {
    all: connectors.length,
    attention: grouped.attention.length + orphanAlerts.length,
    connected: grouped.connected.length,
    off: grouped.off.length,
  }

  function matches(connector: Connector) {
    if (!query) return true
    return [texts.title(connector), texts.typeLabel(connector), connectorHandle(connector) ?? ""].some(
      (text) => matchesSearch(text, query)
    )
  }

  const visibleGroups = GROUPS.filter((group) => filter === "all" || filter === group)
    .map((group) => ({ group, items: grouped[group].filter(matches) }))
    .filter(({ group, items }) => items.length > 0 || (group === "attention" && !query && orphanAlerts.length > 0))

  const showOrphans = !query && (filter === "all" || filter === "attention")
  const isEmpty = !isLoading && !error && connectors.length === 0 && orphanAlerts.length === 0

  const addButton = (
    <Button onClick={() => setTarget({ kind: "new" })}>
      <Plus />
      {t("connectors.page.add")}
    </Button>
  )

  return (
    <PageBody>
      <PageHeader
        description={t("connectors.page.description")}
        mobilePlacement="inline"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("connectors.page.refresh")}
              disabled={isValidating}
              onClick={() => {
                void mutate()
                void alerts.reload()
              }}
            >
              <RefreshCw className={cn(isValidating && "animate-spin")} />
            </Button>
            {addButton}
          </div>
        }
      />

      {isLoading ? (
        <ConnectorListSkeleton />
      ) : error ? (
        <ErrorState
          error={error}
          title={t("connectors.page.loadError")}
          onRetry={() => void mutate()}
        />
      ) : isEmpty ? (
        <EmptyState
          icon={<Plug className="size-5" />}
          title={t("connectors.page.emptyTitle")}
          description={t("connectors.page.emptyDescription")}
          action={{ label: t("connectors.page.add"), onClick: () => setTarget({ kind: "new" }) }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SegmentedControl
              aria-label={t("connectors.filter.label")}
              value={filter}
              onChange={setFilter}
              // No celular os quatro não cabem com os números. Fica só o que pede ação, se houver.
              options={[
                { value: "all", label: t("connectors.filter.all"), count: isMobile ? undefined : counts.all },
                {
                  value: "attention",
                  label: t("connectors.filter.attention"),
                  count: isMobile && counts.attention === 0 ? undefined : counts.attention,
                },
                { value: "connected", label: t("connectors.filter.connected"), count: isMobile ? undefined : counts.connected },
                { value: "off", label: t("connectors.filter.off"), count: isMobile ? undefined : counts.off },
              ]}
            />
            {connectors.length >= SEARCH_FROM ? (
              <SearchInput
                value={query}
                onChange={setQuery}
                debounce={0}
                placeholder={t("connectors.page.search")}
                className="md:w-64"
              />
            ) : null}
          </div>

          {visibleGroups.length === 0 ? (
            <EmptyState
              icon={query ? <Search className="size-5" /> : undefined}
              title={t(query ? "connectors.page.noResults" : `connectors.page.empty.${filter}`)}
              action={{
                label: t("connectors.page.showAll"),
                onClick: () => {
                  setFilter("all")
                  setQuery("")
                },
              }}
            />
          ) : (
            <motion.div {...preset.stagger} className="flex flex-col gap-6">
              {visibleGroups.map(({ group, items }) => (
                <motion.section
                  key={group}
                  variants={preset.staggerItem}
                  aria-labelledby={`connectors-group-${group}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      id={`connectors-group-${group}`}
                      className="font-heading text-base font-medium"
                    >
                      {t(`connectors.groups.${group}`)}
                    </h2>
                    {group === "attention" && alerts.alerts.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {t("connectors.alerts.count", { count: alerts.alerts.length })}
                      </span>
                    ) : null}
                  </div>

                  <div className="divide-y overflow-hidden rounded-xl ring-1 ring-foreground/10">
                    <AnimatePresence initial={false}>
                      {items.map((connector) => (
                        <motion.div key={connector.id} {...preset.listItem}>
                          <ConnectorRow
                            connector={connector}
                            alerts={alerts.byConnector.get(connector.id)}
                            onConnect={(item) => setTarget({ kind: "existing", connector: item })}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {group === "attention" && showOrphans
                      ? orphanAlerts.map((alert) => (
                          <div key={alert.id} className="p-4">
                            {alert.originName ? (
                              <p className="mb-1.5 text-sm font-medium">
                                {withoutInstanceName(alert.originName, t("connectors.types.whatsapp_web"))}
                              </p>
                            ) : null}
                            <ConnectorAlertNotice alert={alert} />
                          </div>
                        ))
                      : null}
                  </div>
                </motion.section>
              ))}
            </motion.div>
          )}
        </div>
      )}

      <ConnectFlow target={target} onClose={() => setTarget(null)} />
    </PageBody>
  )
}

/** O esqueleto repete a linha: marca, nome com o estado, apoio e botão. */
function ConnectorListSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <Skeleton className="h-8 w-72 max-w-full rounded-lg" />
      <div className="divide-y rounded-xl ring-1 ring-foreground/10">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-start gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="hidden h-7 w-24 rounded-md md:block" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  )
}
