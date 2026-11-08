import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { refreshConnectorAlerts } from "@/hooks/connectors/use-connector-alerts"
import { reloadConnectors, storeConnector } from "@/hooks/connectors/use-connectors"
import { apiPost } from "@/lib/api"
import { connectorErrorMessage, connectorPath } from "@/lib/connectors/channels"
import {
  loadFacebookSdk,
  MetaLoginError,
  runEmbeddedSignup,
  runFacebookLogin,
} from "@/lib/connectors/facebook-sdk"
import { messengerLoginConfig, whatsappLoginConfig } from "@/lib/connectors/meta-config"
import type { Connector, ConnectorCreated, InstagramConnector } from "@/lib/connectors/types"
import { useLanguage } from "@/lib/i18n"
import { ConnectOutcome } from "./connect-outcome"
import { ConnectFooter } from "./connect-shell"
import { useConnectStep } from "./connect-step"
import { WebhookDetails } from "./webhook-details"

type Channel = "whatsapp" | "messenger"

type Phase =
  | { name: "ready" }
  | { name: "authorizing" }
  | { name: "saving" }
  | { name: "done"; connector: Connector; instagram: InstagramConnector | null }
  | { name: "failed"; title: string; description: string; detail?: string | null }

export type MetaPanelProps = {
  channel: Channel
  /** Reconectando. Sem isto, cria o canal. */
  connector?: Connector
  stepLabel?: string
  onBack?: () => void
}

type SdkState = "loading" | "ready" | "failed"
type Sdk = Awaited<ReturnType<typeof loadFacebookSdk>>

/**
 * Conectar pela janela da Meta: o WhatsApp oficial (Embedded Signup) e o Messenger
 * (Facebook Login). O SDK carrega antes do clique: aberta depois, a janela seria bloqueada.
 */
export function MetaPanel({ channel, connector, stepLabel, onBack }: MetaPanelProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const config = channel === "whatsapp" ? whatsappLoginConfig : messengerLoginConfig

  const [sdk, setSdk] = useState<Sdk | null>(null)
  const [sdkState, setSdkState] = useState<SdkState>("loading")
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>({ name: "ready" })
  // Ativação falhou na criação: tentar de novo ativa este canal, em vez de criar outro.
  const [created, setCreated] = useState<Connector | null>(null)
  const target = connector ?? created

  useEffect(() => {
    if (!config) return
    let cancelled = false
    loadFacebookSdk(language)
      .then((loaded) => {
        if (cancelled) return
        setSdk(() => loaded)
        setSdkState("ready")
      })
      .catch(() => {
        if (!cancelled) setSdkState("failed")
      })
    return () => {
      cancelled = true
    }
  }, [config, language, attempt])

  const busy = phase.name === "authorizing" || phase.name === "saving"
  const prefix = `connectors.meta.${channel}`

  const { close } = useConnectStep(
    {
      title:
        phase.name === "done"
          ? t(`${prefix}.doneTitle`)
          : phase.name === "failed"
            ? t("connectors.meta.failedTitle")
            : t(target ? `${prefix}.titleReconnect` : `${prefix}.title`),
      description: phase.name === "ready" ? stepLabel : undefined,
    },
    { busy }
  )

  /** Lê o resultado: `201` e `200` não querem dizer que conectou. */
  function finish(result: Connector, instagram: InstagramConnector | null) {
    storeConnector(result)
    void reloadConnectors()
    refreshConnectorAlerts()

    if (result.status === "failed" || result.status === "reject") {
      setCreated(result)
      setPhase({
        name: "failed",
        title: t("connectors.meta.providerRefused"),
        description: t("connectors.meta.providerRefusedHint"),
        detail: result.errorMessage,
      })
      return
    }
    setPhase({ name: "done", connector: result, instagram })
  }

  async function send(body: Record<string, unknown>, type: string) {
    if (target) {
      const { connector: updated } = await apiPost<{ connector: Connector }>(
        `/connectors/${target.id}/activate`,
        body
      )
      finish(updated, null)
      return
    }
    const response = await apiPost<ConnectorCreated>("/connectors", { connectorType: type, ...body })
    finish(response.connector, response.instagramConnector)
  }

  function fail(error: unknown) {
    if (error instanceof MetaLoginError) {
      if (error.reason === "cancelled") {
        setPhase({
          name: "failed",
          title: t("connectors.meta.cancelled"),
          description: t("connectors.meta.cancelledHint"),
          detail: error.detail ? t("connectors.meta.stoppedAt", { step: error.detail }) : null,
        })
      } else if (error.reason === "incomplete") {
        setPhase({
          name: "failed",
          title: t("connectors.meta.incomplete"),
          description: t("connectors.meta.incompleteHint"),
        })
      } else {
        setPhase({
          name: "failed",
          title: t("connectors.meta.providerRefused"),
          description: t("connectors.meta.providerRefusedHint"),
          detail: error.detail,
        })
      }
      return
    }
    setPhase({
      name: "failed",
      title: t("connectors.meta.saveFailed"),
      description: connectorErrorMessage(error, t),
    })
  }

  // Sem `await` antes do login: ele precisa sair deste clique, ou o navegador bloqueia.
  function connect() {
    if (!sdk || !config) return
    setPhase({ name: "authorizing" })

    const login =
      channel === "whatsapp"
        ? runEmbeddedSignup(sdk, config).then(async ({ code, phoneNumberId, wabaId, businessId }) => {
            setPhase({ name: "saving" })
            await send({ code, phoneNumberId, wabaId, businessId }, "whatsapp_cloud")
          })
        : runFacebookLogin(sdk, config).then(async ({ code }) => {
            setPhase({ name: "saving" })
            await send({ code }, "meta_channels")
          })

    login.catch(fail)
  }

  if (!config) {
    return (
      <>
        <ConnectOutcome
          tone="neutral"
          title={t("connectors.meta.unconfigured")}
          description={t("connectors.meta.unconfiguredHint")}
        />
        <ConnectFooter>
          <Button variant="outline" className="pointer-coarse:h-10" onClick={onBack ?? close}>
            {onBack ? t("connectors.connect.back") : t("connectors.connect.close")}
          </Button>
        </ConnectFooter>
      </>
    )
  }

  if (phase.name === "done") {
    return (
      <>
        <ConnectOutcome
          tone="success"
          title={t(`${prefix}.doneHeading`)}
          description={t(`${prefix}.doneHint`)}
        >
          <div className="mt-3 flex flex-col gap-3">
            <WebhookDetails
              connector={phase.connector}
              heading={channel === "messenger" ? t("connectors.types.facebook_messenger") : undefined}
            />
            {phase.instagram ? (
              <WebhookDetails
                connector={phase.instagram}
                heading={t("connectors.types.instagram_direct")}
              />
            ) : channel === "messenger" ? (
              <p className="rounded-lg bg-status-warning-soft px-3 py-2 text-sm text-pretty text-status-warning">
                {t("connectors.meta.noInstagram")}
              </p>
            ) : null}
          </div>
        </ConnectOutcome>
        <ConnectFooter>
          <Button
            variant="outline"
            className="pointer-coarse:h-10"
            render={<Link to={connectorPath(phase.connector.id)} />}
            nativeButton={false}
            onClick={close}
          >
            {t("connectors.live.openChannel")}
          </Button>
          <Button className="pointer-coarse:h-10" onClick={close}>
            {t("connectors.live.finish")}
          </Button>
        </ConnectFooter>
      </>
    )
  }

  if (phase.name === "failed") {
    return (
      <>
        <ConnectOutcome
          tone="danger"
          title={phase.title}
          description={phase.description}
          detail={phase.detail}
        />
        <ConnectFooter>
          <Button variant="outline" className="pointer-coarse:h-10" onClick={close}>
            {t("connectors.connect.close")}
          </Button>
          <Button className="pointer-coarse:h-10" onClick={() => setPhase({ name: "ready" })}>
            {t("connectors.connect.retry")}
          </Button>
        </ConnectFooter>
      </>
    )
  }

  const steps = t(`${prefix}.steps`, { returnObjects: true }) as unknown as string[]

  return (
    <>
      <div className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2 text-sm">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2.5">
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground tabular-nums"
              >
                {index + 1}
              </span>
              <span className="text-pretty">{step}</span>
            </li>
          ))}
        </ol>

        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {sdkState === "loading" || busy ? (
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
          ) : null}
          {phase.name === "authorizing"
            ? t("connectors.meta.authorizing")
            : phase.name === "saving"
              ? t("connectors.meta.saving")
              : sdkState === "loading"
                ? t("connectors.meta.loading")
                : sdkState === "failed"
                  ? t("connectors.meta.loadFailed")
                  : null}
        </p>
      </div>

      <ConnectFooter>
        <Button
          variant="outline"
          className="pointer-coarse:h-10"
          disabled={busy}
          onClick={onBack ?? close}
        >
          {onBack ? t("connectors.connect.back") : t("connectors.connect.cancel")}
        </Button>
        {sdkState === "failed" ? (
          <Button
            className="pointer-coarse:h-10"
            onClick={() => {
              setSdkState("loading")
              setAttempt((current) => current + 1)
            }}
          >
            {t("connectors.connect.retry")}
          </Button>
        ) : (
          <Button
            className="pointer-coarse:h-10"
            disabled={sdkState !== "ready" || busy}
            aria-busy={busy}
            onClick={connect}
          >
            {t(`${prefix}.connect`)}
          </Button>
        )}
      </ConnectFooter>
    </>
  )
}
