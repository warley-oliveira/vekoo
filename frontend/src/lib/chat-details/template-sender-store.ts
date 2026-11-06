import { create } from "zustand"

// Qual conversa está com o envio de modelo aberto. O botão mora em três lugares (aviso de 24 horas,
// composer e menu "..."), e o diálogo, num só.

type TemplateSenderState = {
  chatId: string | null
}

export const useTemplateSender = create<TemplateSenderState>()(() => ({ chatId: null }))

export function openTemplateSender(chatId: string): void {
  useTemplateSender.setState({ chatId })
}

export function closeTemplateSender(): void {
  useTemplateSender.setState({ chatId: null })
}
