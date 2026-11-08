import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "@/lib/router"
import { Unplug } from "lucide-react"

import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  PageBody,
  PageHeader,
  SettingsSection,
} from "@/components/shared"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConnectFlow, type ConnectTarget } from "@/components/connectors/connect/connect-flow"
import { WhatsappTips } from "@/components/connectors/connect/whatsapp-tips"
import { useConnectorTexts } from "@/components/connectors/connector-texts"
import { ConnectorOverview } from "@/components/connectors/details/connector-overview"
import {
  CollaboratorNameSetting,
  ConnectorActionsSection,
  ConnectorFacts,
} from "@/components/connectors/details/connector-settings"
import { InstagramSection } from "@/components/connectors/details/instagram-section"
import { WabaNumbers } from "@/components/connectors/details/waba-numbers"
import { WabaProfile } from "@/components/connectors/details/waba-profile"
import { TemplatesTab } from "@/components/connectors/templates/templates-tab"
import { WidgetSettings } from "@/components/connectors/widget/widget-settings"
import { useConnectorAlerts } from "@/hooks/connectors/use-connector-alerts"
import { useConnector } from "@/hooks/connectors/use-connectors"
import { ApiError } from "@/lib/api"
import type { Connector, WhatsappCloudConnector } from "@/lib/connectors/types"

const INTEGRATIONS_PATH = "/settings/integrations"

export default function ConnectorPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { connectorId } = useParams()
  const texts = useConnectorTexts()
  const { data, error, isLoading, mutate } = useConnector(connectorId)
  const alerts = useConnectorAlerts()
  const [target, setTarget] = useState<ConnectTarget | null>(null)

  const connector = data?.connector

  return (
    <PageBody>
      <PageHeader
        title={connector ? texts.title(connector) : undefined}
        backTo={INTEGRATIONS_PATH}
        parentTitle={t("navigation.integrations")}
      />

      {isLoading ? (
        <DetailSkeleton rows={6} />
      ) : error instanceof ApiError && error.status === 404 ? (
        <EmptyState
          icon={<Unplug className="size-5" />}
          title={t("connectors.detail.notFound")}
          description={t("connectors.detail.notFoundHint")}
          action={{
            label: t("connectors.detail.backToList"),
            onClick: () => navigate(INTEGRATIONS_PATH),
          }}
        />
      ) : error || !connector ? (
        <ErrorState
          error={error}
          title={t("connectors.detail.loadError")}
          onRetry={() => void mutate()}
        />
      ) : (
        <>
          <ConnectorOverview
            connector={connector}
            alerts={alerts.byConnector.get(connector.id)}
            onConnect={(item) => setTarget({ kind: "existing", connector: item })}
          />
          <ConnectorBody connector={connector} />
        </>
      )}

      <ConnectFlow target={target} onClose={() => setTarget(null)} />
    </PageBody>
  )
}

function ConnectorBody({ connector }: { connector: Connector }) {
  switch (connector.type) {
    case "whatsapp_cloud":
      return <WabaBody connector={connector} />
    case "web_widget":
      return <WidgetSettings connector={connector} />
    case "instagram_direct":
      return (
        <div className="flex flex-col gap-6 md:gap-8">
          <InstagramSection connector={connector} />
          <GeneralSection connector={connector} />
          <ConnectorActionsSection connector={connector} />
        </div>
      )
    default:
      return (
        <div className="flex flex-col gap-6 md:gap-8">
          <GeneralSection connector={connector} />
          <ConnectorActionsSection connector={connector} />
          {connector.type === "whatsapp_web" ? <TipsSection /> : null}
        </div>
      )
  }
}

function GeneralSection({
  connector,
  withFacts = true,
}: {
  connector: Connector
  withFacts?: boolean
}) {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t("connectors.detail.generalTitle")}
      description={t("connectors.detail.generalDescription")}
    >
      <CollaboratorNameSetting connector={connector} />
      {withFacts && connector.type !== "instagram_direct" ? (
        <ConnectorFacts connector={connector} />
      ) : null}
    </SettingsSection>
  )
}

function TipsSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t("connectors.tips.sectionTitle")}
      description={t("connectors.tips.sectionDescription")}
    >
      <WhatsappTips />
    </SettingsSection>
  )
}

const WABA_TABS = ["profile", "numbers", "templates", "account"] as const
type WabaTab = (typeof WABA_TABS)[number]

/** A aba vai na URL: o link de um modelo rejeitado precisa abrir já nos modelos. */
function WabaBody({ connector }: { connector: WhatsappCloudConnector }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab") as WabaTab | null
  const tab: WabaTab = requested && WABA_TABS.includes(requested) ? requested : "profile"

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setParams({ tab: value as string }, { replace: true })}
      className="gap-5"
    >
      <TabsList className="max-w-full justify-start overflow-x-auto pointer-coarse:h-11">
        {WABA_TABS.map((value) => (
          <TabsTrigger key={value} value={value} className="flex-none px-2.5 pointer-coarse:h-10">
            {t(`connectors.waba.tabs.${value}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="profile">
        <WabaProfile connector={connector} />
      </TabsContent>
      <TabsContent value="numbers">
        <WabaNumbers connector={connector} />
      </TabsContent>
      <TabsContent value="templates">
        <TemplatesTab connector={connector} />
      </TabsContent>
      <TabsContent value="account" className="flex flex-col gap-6 md:gap-8">
        <GeneralSection connector={connector} />
        <ConnectorActionsSection connector={connector} />
      </TabsContent>
    </Tabs>
  )
}
