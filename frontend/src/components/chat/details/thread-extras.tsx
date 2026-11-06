import { lazy, memo, Suspense, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { openCopilot } from "@/lib/chat-details/panel-store"
import {
  closeTemplateSender,
  openTemplateSender,
  useTemplateSender,
} from "@/lib/chat-details/template-sender-store"
import { isConnectorDown } from "@/lib/chat/channel"
import { useChat } from "@/lib/chat/chat-store"
import type { Chat } from "@/lib/chat/types"

const TemplateDialog = lazy(() => import("./template-dialog"))

/** O diálogo do modelo. Mora no cabeçalho, que está na tela em todo modo do composer. */
export const TemplateDialogHost = memo(function TemplateDialogHost({ chatId }: { chatId: string }) {
  const openFor = useTemplateSender((state) => state.chatId)
  const chat = useChat(chatId)
  const close = useCallback(() => closeTemplateSender(), [])

  // Sair da conversa fecha: voltar a ela não pode reabrir um diálogo que ninguém pediu.
  useEffect(() => closeTemplateSender, [chatId])

  if (openFor !== chatId || !chat) return null

  return (
    <Suspense fallback={null}>
      <TemplateDialog chat={chat} onClose={close} />
    </Suspense>
  )
})

/** Copiloto e modelo no menu "...". Modelo só existe no WhatsApp oficial. */
export function ThreadMenuItems({ chat }: { chat: Chat }) {
  const { t } = useTranslation()
  const { byId } = useChatConnectors()
  const connector = chat.connectorId ? byId.get(chat.connectorId) : undefined

  return (
    <>
      {connector?.type === "whatsapp_cloud" && !isConnectorDown(connector) ? (
        <DropdownMenuItem onClick={() => openTemplateSender(chat.id)}>
          <FileText />
          {t("chatDetails.template.open")}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onClick={openCopilot}>
        <Sparkles />
        {t("chatDetails.copilot.open")}
      </DropdownMenuItem>
    </>
  )
}

/** O botão do aviso de 24 horas: é o que resolve o que o aviso acabou de explicar. */
export function TemplateNoticeButton({ chatId }: { chatId: string }) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      className="mt-2 w-full sm:w-auto pointer-coarse:h-10"
      onClick={() => openTemplateSender(chatId)}
    >
      <FileText />
      {t("chatDetails.template.open")}
    </Button>
  )
}
