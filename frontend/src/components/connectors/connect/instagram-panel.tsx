import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InstagramProfile } from "@/components/connectors/details/instagram-profile"
import { refreshConnectorAlerts } from "@/hooks/connectors/use-connector-alerts"
import { reloadConnectors, storeConnector } from "@/hooks/connectors/use-connectors"
import { apiPost } from "@/lib/api"
import { connectorErrorMessage, connectorPath } from "@/lib/connectors/channels"
import { InstagramLoginError, startInstagramLogin } from "@/lib/connectors/instagram-oauth"
import { instagramAppId } from "@/lib/connectors/meta-config"
import type { Connector, ConnectorCreated } from "@/lib/connectors/types"
import { ConnectOutcome } from "./connect-outcome"
import { ConnectFooter } from "./connect-shell"
import { useConnectStep } from "./connect-step"
import { WebhookDetails } from "./webhook-details"

type Phase =
  | { name: "ready" }
  | { name: "authorizing" }
  | { name: "saving" }
  | { name: "done"; connector: Connector }
  | { name: "failed"; title: string; description: string; detail?: string | null }

export type InstagramLogin = { code: string; redirectUri: string }

export type InstagramPanelProps = {
  connector?: Connector
  stepLabel?: string
  onBack?: () => void
  /** Voltando de um login que aconteceu na mesma aba: o código já chegou. */
  resumed?: () => InstagramLogin
}

export function InstagramPanel({ connector, stepLabel, onBack, resumed }: InstagramPanelProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>({ name: "ready" })
  const [created, setCreated] = useState<Connector | null>(null)
  const target = connector ?? created
  const busy = phase.name === "authorizing" || phase.name === "saving"

  const { close } = useConnectStep(
    {
      title:
        phase.name === "done"
          ? t("connectors.instagram.doneTitle")
          : phase.name === "failed"
            ? t("connectors.meta.failedTitle")
            : t(target ? "connectors.instagram.titleReconnect" : "connectors.instagram.title"),
      description: phase.name === "ready" ? stepLabel : undefined,
    },
    { busy }
  )

  const handleFailure = useCallback(
    (error: unknown) => {
      if (error instanceof InstagramLoginError) {
        if (error.reason === "closed") {
          setPhase({
            name: "failed",
            title: t("connectors.instagram.closed"),
            description: t("connectors.instagram.closedHint"),
          })
        } else if (error.reason === "denied") {
          setPhase({
            name: "failed",
            title: t("connectors.instagram.denied"),
            description: t("connectors.instagram.deniedHint"),
          })
        } else {
          setPhase({
            name: "failed",
            title: t("connectors.instagram.refused"),
            description: t("connectors.instagram.refusedHint"),
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
    },
    [t]
  )

  const save = useCallback(
    async (login: InstagramLogin) => {
      setPhase({ name: "saving" })

      let result: Connector
      if (target) {
        const response = await apiPost<{ connector: Connector }>(
          `/connectors/${target.id}/activate`,
          login
        )
        result = response.connector
      } else {
        const response = await apiPost<ConnectorCreated>("/connectors", {
          connectorType: "instagram_direct",
          ...login,
        })
        result = response.connector
      }

      storeConnector(result)
      void reloadConnectors()
      refreshConnectorAlerts()

      if (result.status === "active") {
        setPhase({ name: "done", connector: result })
      } else {
        setCreated(result)
        setPhase({
          name: "failed",
          title: t("connectors.instagram.refused"),
          description: t("connectors.instagram.refusedHint"),
          detail: result.errorMessage,
        })
      }
    },
    [target, t]
  )

  // Só uma vez: o código da Meta é de uso único, e o StrictMode rodaria o efeito duas vezes.
  const resumedOnce = useRef(false)
  useEffect(() => {
    if (!resumed || resumedOnce.current) return
    resumedOnce.current = true
    Promise.resolve()
      .then(() => save(resumed()))
      .catch(handleFailure)
  }, [resumed, save, handleFailure])

  // Sem `await` antes de abrir: fora do clique, o navegador bloqueia a janela.
  function connect() {
    setPhase({ name: "authorizing" })
    startInstagramLogin(target?.id).then(save).catch(handleFailure)
  }

  if (!instagramAppId && !resumed) {
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
          title={t("connectors.instagram.doneHeading")}
          description={t("connectors.instagram.doneHint")}
        >
          <div className="mt-3 flex flex-col gap-3">
            {phase.connector.type === "instagram_direct" ? (
              <InstagramProfile connector={phase.connector} className="rounded-xl p-4 ring-1 ring-foreground/10" />
            ) : null}
            <WebhookDetails connector={phase.connector} />
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

  const steps = t("connectors.instagram.steps", { returnObjects: true }) as unknown as string[]

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
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
            {t(phase.name === "saving" ? "connectors.meta.saving" : "connectors.instagram.authorizing")}
          </p>
        ) : null}
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
        <Button
          className="pointer-coarse:h-10"
          disabled={busy}
          aria-busy={busy}
          onClick={connect}
        >
          {t("connectors.instagram.connect")}
        </Button>
      </ConnectFooter>
    </>
  )
}
