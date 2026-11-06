import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { AnimatePresence, motion } from "motion/react"
import { Loader2, QrCode, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { CopyButton, SegmentedControl } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { connectorPath } from "@/components/connectors/connector-row"
import { useWhatsappConnection } from "@/hooks/connectors/use-whatsapp-connection"
import { connectorHandle, formatPairCode, usesZapi } from "@/lib/connectors/channels"
import type { Connector } from "@/lib/connectors/types"
import { useMotionPreset } from "@/lib/motion"
import { ConnectOutcome } from "./connect-outcome"
import { ConnectFooter, useConnectStep } from "./connect-shell"
import { WhatsappTips } from "./whatsapp-tips"

export type ConnectMethod = "qr" | "code"
type Platform = "android" | "iphone"

function detectPlatform(): Platform {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "iphone" : "android"
}

export type WhatsappLiveProps = {
  connector: Connector
  method: ConnectMethod
  /** Pede um código novo ao abrir: é reconexão. Sem isto, acompanha quem já está esperando. */
  activateOnStart?: boolean
  phoneNumberPairing?: string | null
  /** Volta para a escolha: sem número guardado, digitar um código exige informar o número. */
  onChooseCode?: () => void
}

/** O passo mais delicado do produto: a pessoa com o celular na mão, olhando para esta tela. */
export function WhatsappLive({
  connector: initial,
  method,
  activateOnStart,
  phoneNumberPairing,
  onChooseCode,
}: WhatsappLiveProps) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const live = useWhatsappConnection({
    connector: initial,
    activateOnStart,
    phoneNumberPairing,
    expectsPairCode: method === "code",
  })
  const { phase, qrCode, pairCode, failure, slow, cableConnected, connector, restart } = live

  const [view, setView] = useState<ConnectMethod>(method)
  const [platform, setPlatform] = useState<Platform>(detectPlatform)
  const zapi = usesZapi(connector)
  const showingCode = view === "code" && !zapi

  const header = useMemo(() => {
    if (phase === "connected") return { title: t("connectors.live.connectedTitle") }
    // O que aconteceu fica no corpo, com o motivo e a saída: dois títulos só repetiriam.
    if (phase === "failed" || phase === "expired") return { title: t("connectors.live.title") }
    return {
      title: t("connectors.live.title"),
      description: t(showingCode ? "connectors.live.codeLead" : "connectors.live.qrLead"),
    }
  }, [phase, showingCode, t])

  const { close } = useConnectStep(header, { busy: phase === "starting" })

  function closeWaiting() {
    toast.info(t("connectors.live.leftWaiting"))
    close()
  }

  const steps = t(
    `connectors.live.steps.${showingCode ? "code" : "qr"}.${platform}`,
    { returnObjects: true }
  ) as unknown as string[]

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {phase === "connected" ? (
          <motion.div key="connected" {...preset.slideUp}>
            <ConnectOutcome
              tone="success"
              title={t("connectors.live.connectedHeading")}
              description={
                connectorHandle(connector)
                  ? t("connectors.live.connectedWithNumber", { number: connectorHandle(connector) })
                  : t("connectors.live.connectedHint")
              }
            >
              <WhatsappTips className="mt-3" />
            </ConnectOutcome>
          </motion.div>
        ) : phase === "failed" ? (
          <motion.div key="failed" {...preset.slideUp}>
            <ConnectOutcome
              tone="danger"
              title={t(
                connector.status === "reject"
                  ? "connectors.live.blockedHeading"
                  : "connectors.live.failedHeading"
              )}
              description={t(
                connector.status === "reject"
                  ? "connectors.live.blockedHint"
                  : "connectors.live.failedHint"
              )}
              detail={failure}
            />
          </motion.div>
        ) : phase === "expired" ? (
          <motion.div key="expired" {...preset.slideUp}>
            <ConnectOutcome
              tone="neutral"
              title={t("connectors.live.expiredHeading")}
              description={t("connectors.live.expiredHint")}
            />
          </motion.div>
        ) : (
          <motion.div
            key="code"
            {...preset.slideUp}
            className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6"
          >
            <div className="flex flex-col items-center gap-2">
              {showingCode ? (
                <PairingCode code={pairCode} loading={phase === "starting" || !pairCode} />
              ) : (
                <QrImage src={qrCode} />
              )}
              {showingCode && qrCode ? (
                <Button
                  variant="link"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() => setView("qr")}
                >
                  <QrCode />
                  {t("connectors.live.useQr")}
                </Button>
              ) : !showingCode && !zapi && (pairCode || onChooseCode) ? (
                <Button
                  variant="link"
                  size="sm"
                  className="pointer-coarse:h-10"
                  onClick={() => (pairCode ? setView("code") : onChooseCode?.())}
                >
                  <Smartphone />
                  {t("connectors.live.useCode")}
                </Button>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <SegmentedControl
                aria-label={t("connectors.live.platform")}
                value={platform}
                onChange={setPlatform}
                options={[
                  { value: "android", label: t("connectors.live.android") },
                  { value: "iphone", label: t("connectors.live.iphone") },
                ]}
              />
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
              <WaitingLine
                starting={phase === "starting"}
                hasCode={Boolean(showingCode ? pairCode : qrCode)}
                showingCode={showingCode}
                slow={slow}
                cableConnected={cableConnected}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConnectFooter>
        {phase === "connected" ? (
          <>
            <Button
              variant="outline"
              className="pointer-coarse:h-10"
              render={<Link to={connectorPath(connector.id)} />}
              nativeButton={false}
              onClick={close}
            >
              {t("connectors.live.openChannel")}
            </Button>
            <Button className="pointer-coarse:h-10" onClick={close}>
              {t("connectors.live.finish")}
            </Button>
          </>
        ) : phase === "failed" || phase === "expired" ? (
          <>
            <Button variant="outline" className="pointer-coarse:h-10" onClick={close}>
              {t("connectors.connect.close")}
            </Button>
            <Button className="pointer-coarse:h-10" onClick={() => void restart()}>
              {t(phase === "expired" ? "connectors.live.newCode" : "connectors.connect.retry")}
            </Button>
          </>
        ) : (
          <>
            {slow ? (
              <Button variant="outline" className="pointer-coarse:h-10" onClick={() => void restart()}>
                {t("connectors.live.newCode")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="pointer-coarse:h-10"
              disabled={phase === "starting"}
              onClick={closeWaiting}
            >
              {t("connectors.live.closeWaiting")}
            </Button>
          </>
        )}
      </ConnectFooter>
    </>
  )
}

function QrImage({ src }: { src: string | null }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()

  return (
    <div className="relative size-56 overflow-hidden rounded-xl bg-white ring-1 ring-foreground/10">
      <AnimatePresence initial={false}>
        {src ? (
          // Cada código novo entra por cima do anterior, sem deixar um buraco na tela
          // enquanto a pessoa está com a câmera apontada.
          <motion.img
            key={src}
            {...preset.fade}
            src={src}
            alt={t("connectors.live.qrAlt")}
            className="absolute inset-0 size-full"
          />
        ) : (
          <motion.div key="empty" {...preset.fade} className="absolute inset-0">
            <Skeleton className="size-full rounded-none" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PairingCode({ code, loading }: { code: string | null; loading: boolean }) {
  const { t } = useTranslation()
  const preset = useMotionPreset()

  if (loading || !code) {
    return (
      <div
        className="flex h-14 items-center gap-1"
        role="status"
        aria-label={t("connectors.live.waitingCode")}
      >
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-8 rounded-md" />
        ))}
      </div>
    )
  }

  const formatted = formatPairCode(code)

  return (
    <motion.div {...preset.slideUp} className="flex flex-col items-center gap-2">
      <p
        aria-label={t("connectors.live.codeAlt", { code: formatted })}
        className="flex items-center gap-1 font-mono text-xl font-medium select-all"
      >
        {Array.from(formatted).map((character, index) =>
          character === "-" ? (
            <span key={index} aria-hidden className="mx-0.5 text-muted-foreground">
              -
            </span>
          ) : (
            <span
              key={index}
              aria-hidden
              className="flex h-12 w-8 items-center justify-center rounded-md bg-muted"
            >
              {character}
            </span>
          )
        )}
      </p>
      <CopyButton
        value={code}
        label={t("connectors.live.copyCode")}
        variant="outline"
        size="sm"
        className="pointer-coarse:h-10"
      />
    </motion.div>
  )
}

function WaitingLine({
  starting,
  hasCode,
  showingCode,
  slow,
  cableConnected,
}: {
  starting: boolean
  hasCode: boolean
  showingCode: boolean
  slow: boolean
  cableConnected: boolean
}) {
  const { t } = useTranslation()

  const message = starting
    ? t("connectors.live.starting")
    : !hasCode
      ? t(slow ? "connectors.live.slow" : showingCode ? "connectors.live.waitingCode" : "connectors.live.waitingQr")
      : t(showingCode ? "connectors.live.waitingEntry" : "connectors.live.waitingScan")

  return (
    <div className="mt-1 space-y-1 border-t pt-3">
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        {hasCode ? (
          <span aria-hidden className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-info opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-status-info" />
          </span>
        ) : (
          <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        )}
        <span className="text-pretty">{message}</span>
      </p>
      {!cableConnected && !starting ? (
        <p className="text-xs text-muted-foreground">{t("connectors.live.polling")}</p>
      ) : null}
    </div>
  )
}
