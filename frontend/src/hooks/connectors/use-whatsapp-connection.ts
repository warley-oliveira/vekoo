import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannel } from "@/hooks/use-channel"
import { apiPost } from "@/lib/api"
import {
  connectorErrorMessage,
  isWhatsappWeb,
  qrImageSource,
  usesZapi,
} from "@/lib/connectors/channels"
import type { Connector, ConnectionEvent } from "@/lib/connectors/types"
import { refreshConnectorAlerts } from "./use-connector-alerts"
import { reloadConnectors, storeConnector, useConnector } from "./use-connectors"

/**
 * - `starting`: pedindo ao provedor um código novo.
 * - `waiting`: o canal está `pending`: o código chega pelo canal, ou já está na tela.
 * - `expired`: o tempo para ler acabou.
 * - `failed`: o provedor recusou, ou a API falhou.
 * - `connected`: leu e conectou.
 */
export type ConnectionPhase = "starting" | "waiting" | "expired" | "failed" | "connected"

/** A Z-API invalida o QR code em 20 s. O contrato pede um novo a cada 8. */
const ZAPI_REFRESH_MS = 8_000
/** Rede de segurança: se o WebSocket cair, é a leitura que descobre que conectou. */
const POLL_MS = 4_000
/** Sem código até aqui, a tela admite a demora e oferece outra saída. */
const SLOW_AFTER_MS = 30_000

type Options = {
  connector: Connector
  /** Pede um código novo ao abrir. Sem isto, só acompanha quem já está `pending`. */
  activateOnStart?: boolean
  /** Vai no pedido de ativação: o número do código de pareamento. */
  phoneNumberPairing?: string | null
  /** A pessoa escolheu digitar um código: um QR code na tela não encerra a espera. */
  expectsPairCode?: boolean
}

function initialPhase(connector: Connector, activateOnStart: boolean): ConnectionPhase {
  if (activateOnStart) return "starting"
  if (connector.status === "active") return "connected"
  if (connector.status === "failed") return "failed"
  return "waiting"
}

/** A conexão ao vivo de um WhatsApp: QR code, código de pareamento e como terminou. */
export function useWhatsappConnection({
  connector: initial,
  activateOnStart = false,
  phoneNumberPairing,
  expectsPairCode = false,
}: Options) {
  const { t } = useTranslation()
  const id = initial.id
  const zapi = usesZapi(initial)

  const [phase, setPhase] = useState<ConnectionPhase>(() => initialPhase(initial, activateOnStart))
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(
    initial.status === "failed" ? initial.errorMessage : null
  )
  const [slow, setSlow] = useState(false)

  const watching = phase === "waiting"

  const { data, mutate } = useConnector(id, {
    refreshInterval: watching ? POLL_MS : 0,
    revalidateOnMount: true,
  })

  const restart = useCallback(async () => {
    setPhase("starting")
    setQrCode(null)
    setPairCode(null)
    setFailure(null)
    setSlow(false)

    try {
      // `null` também vai: quem pediu código da outra vez e agora quer o QR precisa limpar.
      const body = isWhatsappWeb(initial) ? { phoneNumberPairing: phoneNumberPairing ?? null } : undefined
      const { connector } = await apiPost<{ connector: Connector }>(
        `/connectors/${id}/activate`,
        body
      )
      storeConnector(connector)
      refreshConnectorAlerts()

      // `200` não quer dizer que deu certo: quem manda é o status do canal.
      if (connector.status === "active") {
        setPhase("connected")
      } else if (connector.status === "pending") {
        setPhase("waiting")
      } else {
        setFailure(connector.errorMessage)
        setPhase("failed")
      }
    } catch (error) {
      setFailure(connectorErrorMessage(error, t))
      setPhase("failed")
    }
  }, [id, initial, phoneNumberPairing, t])

  // Só uma vez: no StrictMode o efeito roda duas, e cada ativação cria uma instância.
  const started = useRef(false)
  useEffect(() => {
    if (!activateOnStart || started.current) return
    started.current = true
    void restart()
  }, [activateOnStart, restart])

  const { connected: cableConnected, perform } = useChannel<ConnectionEvent>(
    "ConnectorsChannel",
    { connectorId: id },
    (event) => {
      switch (event.status) {
        case "qr_updated": {
          const image = qrImageSource(event.base64)
          if (image) setQrCode(image)
          if (event.pairCode) setPairCode(event.pairCode)
          break
        }
        case "success_scan":
          setPhase("connected")
          break
        case "qr_timeout":
          setQrCode(null)
          setPairCode(null)
          setPhase((current) => (current === "connected" ? current : "expired"))
          break
        case "qr_error":
          setFailure(event.error ?? null)
          setPhase("failed")
          break
      }
    }
  )

  // A leitura cobre o que o canal perdeu: o QR code guardado e o desfecho.
  useEffect(() => {
    if (!data || phase !== "waiting") return

    const image = qrImageSource(data.extras.qrCode)
    if (image) setQrCode((current) => current ?? image)
    if (data.extras.pairCode) setPairCode((current) => current ?? data.extras.pairCode ?? null)

    if (data.connector.status === "active") {
      setPhase("connected")
    } else if (data.connector.status === "failed") {
      setFailure(data.connector.errorMessage)
      setPhase(data.connector.errorMessage ? "failed" : "expired")
    } else if (data.connector.status !== "pending") {
      // Número bloqueado (`reject`), ou o WhatsApp encerrou a sessão (`closed`). Nenhum dos dois
      // manda evento pelo canal: sem isto, a tela ficaria esperando para sempre.
      setFailure(null)
      setPhase("failed")
    }
  }, [data, phase])

  const hasCode = Boolean(expectsPairCode ? pairCode : qrCode || pairCode)

  useEffect(() => {
    if (phase !== "waiting" || hasCode) return
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [phase, hasCode])

  // Voltou de uma queda do WebSocket: pode ter conectado enquanto isso.
  useEffect(() => {
    if (cableConnected && watching) void mutate()
    // Só na volta da conexão, não a cada mudança do que está sendo acompanhado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cableConnected])

  useEffect(() => {
    if (!zapi || !cableConnected || !watching) return
    perform("generate_qr_code")
    const timer = setInterval(() => perform("generate_qr_code"), ZAPI_REFRESH_MS)
    return () => clearInterval(timer)
  }, [zapi, cableConnected, watching, perform])

  // Terminou, bem ou mal: a lista atrás do diálogo e o número do menu precisam saber. Ao
  // conectar, o perfil e o número só existem agora, e o aviso de desconexão foi resolvido.
  useEffect(() => {
    if (phase === "starting" || phase === "waiting") return
    void mutate()
    void reloadConnectors()
    refreshConnectorAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  return {
    phase,
    qrCode,
    pairCode,
    failure,
    slow,
    cableConnected,
    connector: data?.connector ?? initial,
    restart,
  }
}
