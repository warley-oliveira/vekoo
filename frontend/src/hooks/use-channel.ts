import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  joinChannel,
  performOnChannel,
  type ChannelParams,
} from "@/lib/cable"

/**
 * Assina um canal de ActionCable enquanto o componente estiver montado.
 *
 *     const { connected, perform } = useChannel<ChatEvent>(
 *       "ChatChannel",
 *       { chatId },
 *       (event) => { ... }
 *     )
 *
 * - Estável: `params` é comparado por valor e `onMessage` pode ser uma arrow nova a
 *   cada render. Só reassina quando o canal ou o valor dos parâmetros muda.
 * - `null` no nome não assina (ainda não há id, ainda não há permissão).
 * - Vários componentes no mesmo canal e parâmetros dividem uma assinatura só.
 * - Sobrevive à troca de sessão e à reconexão. Se a tela precisa recuperar o que
 *   perdeu enquanto caiu, revalide quando `connected` voltar a `true`.
 */
export function useChannel<TMessage = unknown>(
  channel: string | null,
  params?: ChannelParams,
  onMessage?: (message: TMessage) => void
): {
  connected: boolean
  perform: (action: string, data?: object) => boolean
} {
  const paramsKey = JSON.stringify(params ?? {})
  const [connected, setConnected] = useState(false)

  const handler = useRef(onMessage)
  useLayoutEffect(() => {
    handler.current = onMessage
  })

  useEffect(() => {
    if (!channel) {
      setConnected(false)
      return
    }
    return joinChannel(channel, JSON.parse(paramsKey) as ChannelParams, {
      onMessage: (message) => handler.current?.(message as TMessage),
      onStatus: setConnected,
    })
  }, [channel, paramsKey])

  const perform = useCallback(
    (action: string, data?: object) =>
      channel
        ? performOnChannel(
            channel,
            JSON.parse(paramsKey) as ChannelParams,
            action,
            data
          )
        : false,
    [channel, paramsKey]
  )

  return useMemo(() => ({ connected, perform }), [connected, perform])
}
