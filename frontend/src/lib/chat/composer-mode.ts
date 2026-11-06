import { isConnectorDown, type ChatConnector } from "./channel"
import type { Chat } from "./types"

// A regra única de "dá para escrever nesta conversa agora?". Na origem vivia em
// `use-composer-session-mode.ts`, para não ter uma cópia por tela.

export type ComposerMode =
  /** Pode escrever. */
  | "compose"
  /** WABA fora da janela de 24 horas: só modelo. */
  | "waba-expired"
  /** Instagram ou Messenger fora da janela: não há como enviar nada. */
  | "meta-expired"
  /** O canal caiu. */
  | "disconnected"
  /** A aba "Todos": a linha do tempo junta canais, e resposta precisa de um só. */
  | "read-only"

export function composerMode(
  chat: Pick<Chat, "activeSession"> | undefined,
  connector: ChatConnector | undefined,
  readOnly = false
): ComposerMode {
  if (readOnly) return "read-only"
  if (isConnectorDown(connector)) return "disconnected"

  const type = connector?.type
  if (type === "whatsapp_cloud" && !chat?.activeSession) return "waba-expired"
  if ((type === "instagram_direct" || type === "facebook_messenger") && !chat?.activeSession) {
    return "meta-expired"
  }
  return "compose"
}
