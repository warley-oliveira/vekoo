import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@/lib/router"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ChannelMark } from "@/components/connectors/channel-mark"
import { reloadConnectors, storeConnector } from "@/hooks/connectors/use-connectors"
import { apiPost } from "@/lib/api"
import { connectionKind, connectorErrorMessage, connectorPath } from "@/lib/connectors/channels"
import { instagramAppId, messengerLoginConfig, whatsappLoginConfig } from "@/lib/connectors/meta-config"
import type { Connector, ConnectorCreated, ConnectorType } from "@/lib/connectors/types"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { ConnectFooter, ConnectShell } from "./connect-shell"
import { useConnectStep } from "./connect-step"
import { InstagramPanel, type InstagramLogin } from "./instagram-panel"
import { MetaPanel } from "./meta-panel"
import { WhatsappPanel } from "./whatsapp-panel"

export type ConnectTarget =
  | { kind: "new"; instagramLogin?: () => InstagramLogin }
  | { kind: "existing"; connector: Connector; instagramLogin?: () => InstagramLogin }

export type ConnectFlowProps = {
  target: ConnectTarget | null
  onClose: () => void
}

/** Adicionar um canal ou conectar de novo um que caiu. */
export function ConnectFlow({ target, onClose }: ConnectFlowProps) {
  // O conteúdo fica até o diálogo terminar de sair: é ele que desmonta tudo ao fechar, e o
  // próximo abre do zero. Sem isto, a janela encolheria vazia na animação de saída.
  const [shown, setShown] = useState(target)
  if (target && target !== shown) setShown(target)

  return (
    <ConnectShell open={target !== null} onClose={onClose}>
      {shown?.kind === "existing" ? (
        <ExistingChannel
          key={shown.connector.id}
          connector={shown.connector}
          instagramLogin={shown.instagramLogin}
        />
      ) : shown?.kind === "new" ? (
        <NewChannel instagramLogin={shown.instagramLogin} />
      ) : null}
    </ConnectShell>
  )
}

function ExistingChannel({
  connector,
  instagramLogin,
}: {
  connector: Connector
  instagramLogin?: () => InstagramLogin
}) {
  switch (connectionKind(connector)) {
    case "qr":
      return <WhatsappPanel connector={connector} />
    case "meta":
      return <MetaPanel channel="whatsapp" connector={connector} />
    case "messenger":
      return <MetaPanel channel="messenger" connector={connector} />
    case "instagram":
      return <InstagramPanel connector={connector} resumed={instagramLogin} />
    default:
      return null
  }
}

type OptionKey = "whatsapp" | "whatsapp_cloud" | "instagram" | "messenger" | "widget"

type Option = {
  key: OptionKey
  type: ConnectorType
  available: boolean
}

const OPTIONS: Option[] = [
  { key: "whatsapp", type: "whatsapp_web", available: true },
  { key: "whatsapp_cloud", type: "whatsapp_cloud", available: Boolean(whatsappLoginConfig) },
  { key: "instagram", type: "instagram_direct", available: Boolean(instagramAppId) },
  { key: "messenger", type: "facebook_messenger", available: Boolean(messengerLoginConfig) },
  { key: "widget", type: "web_widget", available: true },
]

function NewChannel({ instagramLogin }: { instagramLogin?: () => InstagramLogin }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const [selected, setSelected] = useState<OptionKey | null>(instagramLogin ? "instagram" : null)

  const back = () => setSelected(null)
  const stepLabel = t("connectors.connect.step", { current: 2, total: 2 })

  let content: ReactNode
  switch (selected) {
    case "whatsapp":
      content = <WhatsappPanel stepLabel={stepLabel} onBack={back} />
      break
    case "whatsapp_cloud":
      content = <MetaPanel channel="whatsapp" stepLabel={stepLabel} onBack={back} />
      break
    case "messenger":
      content = <MetaPanel channel="messenger" stepLabel={stepLabel} onBack={back} />
      break
    case "instagram":
      content = <InstagramPanel stepLabel={stepLabel} onBack={back} resumed={instagramLogin} />
      break
    default:
      content = <ChooseChannel onSelect={setSelected} />
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={selected ?? "choose"} {...preset.slideUp}>
        {content}
      </motion.div>
    </AnimatePresence>
  )
}

function ChooseChannel({ onSelect }: { onSelect: (key: OptionKey) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [creatingWidget, setCreatingWidget] = useState(false)

  const { close } = useConnectStep(
    {
      title: t("connectors.choose.title"),
      description: t("connectors.connect.step", { current: 1, total: 2 }),
    },
    { busy: creatingWidget }
  )

  // O widget não tem o que autorizar: nasce desligado, e a pessoa personaliza na tela dele.
  async function createWidget() {
    setCreatingWidget(true)
    try {
      const { connector } = await apiPost<ConnectorCreated>("/connectors", {
        connectorType: "web_widget",
      })
      storeConnector(connector)
      void reloadConnectors()
      toast.success(t("connectors.choose.widgetCreated"))
      close()
      navigate(connectorPath(connector.id))
    } catch (error) {
      toast.error(t("connectors.choose.widgetFailed"), {
        description: connectorErrorMessage(error, t),
      })
      setCreatingWidget(false)
    }
  }

  return (
    <>
      {/* A folga é do anel de foco: a área rolável cortaria o da primeira opção. */}
      <ul className="flex flex-col gap-2 py-1">
        {OPTIONS.map((option) => {
          const busy = option.key === "widget" && creatingWidget

          return (
            <li key={option.key}>
              <button
                type="button"
                disabled={!option.available || creatingWidget}
                aria-busy={busy}
                onClick={() =>
                  option.key === "widget" ? void createWidget() : onSelect(option.key)
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                )}
              >
                <ChannelMark type={option.type} />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="block text-sm font-medium">
                    {t(`connectors.choose.options.${option.key}.title`)}
                  </span>
                  <span className="block text-xs leading-snug text-pretty text-muted-foreground">
                    {option.available
                      ? t(`connectors.choose.options.${option.key}.description`)
                      : t("connectors.choose.unavailable")}
                  </span>
                </span>
                {busy ? (
                  <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : option.available ? (
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <ConnectFooter>
        <Button
          variant="outline"
          className="pointer-coarse:h-10"
          disabled={creatingWidget}
          onClick={close}
        >
          {t("connectors.connect.cancel")}
        </Button>
      </ConnectFooter>
    </>
  )
}
