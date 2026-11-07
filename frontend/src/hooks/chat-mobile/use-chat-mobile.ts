import { MOBILE_QUERY } from "@/hooks/use-is-mobile"
import { useMediaQuery } from "@/hooks/use-media-query"

/**
 * O celular deitado passa de 768 px de largura, e ali o que falta é altura: com o cabeçalho, a barra
 * e o teclado, duas colunas sobrariam sem nada para ler. Uma coluna só, como nos apps de mensagem.
 */
export const CHAT_MOBILE_QUERY = `${MOBILE_QUERY}, (max-height: 500px) and (pointer: coarse)`

/** Se o chat está na forma de celular: é o que escolhe a árvore em `ChatLayout`. */
export function useChatMobile(): boolean {
  return useMediaQuery(CHAT_MOBILE_QUERY)
}
