import { memo } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useSuggestReply } from "@/hooks/chat-details/use-suggest-reply"
import { useChatFields } from "@/hooks/chat-details/use-chat-fields"
import { openTemplateSender } from "@/lib/chat-details/template-sender-store"

const FIELDS = ["connectorId"] as const

/** Quanto custa uma sugestão. `aiCosts`, em `GET /catalog`, ainda não traz este valor. */
export const SUGGESTION_COST = 1

function ExtraButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={label}
            className="shrink-0 rounded-full text-muted-foreground pointer-coarse:size-10"
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Sugerir resposta e enviar modelo, na tela larga. No celular, moram na folha do "+". */
export const ComposerActions = memo(function ComposerActions({
  chatId,
  insertText,
  disabled,
}: {
  chatId: string
  insertText: (text: string) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const { byId } = useChatConnectors()
  const chat = useChatFields(chatId, FIELDS)
  const { suggest, loading } = useSuggestReply(chatId, insertText)

  const connector = chat?.connectorId ? byId.get(chat.connectorId) : undefined
  const canSendTemplate = connector?.type === "whatsapp_cloud"
  const suggestLabel = t("chatDetails.suggest.label", { count: SUGGESTION_COST })
  const icon = loading ? <Loader2 className="animate-spin" /> : <Sparkles />

  return (
    <>
      <ExtraButton label={suggestLabel} disabled={disabled || loading} onClick={() => void suggest()}>
        {icon}
      </ExtraButton>
      {canSendTemplate ? (
        <ExtraButton
          label={t("chatDetails.template.open")}
          disabled={disabled}
          onClick={() => openTemplateSender(chatId)}
        >
          <FileText />
        </ExtraButton>
      ) : null}
    </>
  )
})
