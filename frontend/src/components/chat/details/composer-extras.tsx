import { memo } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useChatConnectors } from "@/hooks/chat/use-chat-refs"
import { useSuggestReply } from "@/hooks/chat-details/use-suggest-reply"
import { useIsMobile } from "@/hooks/use-is-mobile"
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

/**
 * Sugerir resposta e enviar modelo. No celular cada botão a mais tira espaço do que se escreve: com os
 * dois, viram um só, com menu.
 */
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
  const isMobile = useIsMobile()
  const { byId } = useChatConnectors()
  const chat = useChatFields(chatId, FIELDS)
  const { suggest, loading } = useSuggestReply(chatId, insertText)

  const connector = chat?.connectorId ? byId.get(chat.connectorId) : undefined
  const canSendTemplate = connector?.type === "whatsapp_cloud"
  const suggestLabel = t("chatDetails.suggest.label", { count: SUGGESTION_COST })
  const icon = loading ? <Loader2 className="animate-spin" /> : <Sparkles />

  if (isMobile && canSendTemplate) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || loading}
              aria-label={t("chatDetails.suggest.menu")}
              className="shrink-0 rounded-full text-muted-foreground pointer-coarse:size-10"
            />
          }
        >
          {icon}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-auto min-w-52">
          <DropdownMenuItem onClick={() => void suggest()}>
            <Sparkles />
            {suggestLabel}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openTemplateSender(chatId)}>
            <FileText />
            {t("chatDetails.template.open")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

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
