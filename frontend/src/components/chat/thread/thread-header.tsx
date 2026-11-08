import { memo, useCallback, useRef } from "react"
import { useNavigate } from "@/lib/router"
import { useTranslation } from "react-i18next"
import {
  Bot,
  BotOff,
  CheckCircle2,
  MoreVertical,
  PanelRight,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"

import { UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useThreadActions } from "@/hooks/chat/use-thread-actions"
import { useIsTouch } from "@/hooks/use-media-query"
import { apiAssetUrl } from "@/lib/api"
import { channelKey, contactHandle, type ChatConnector } from "@/lib/chat/channel"
import { chatDisplayName } from "@/lib/chat/chat-store"
import { toggleContactDetails } from "@/lib/chat-details/panel-store"
import { useThreadStore } from "@/lib/chat/thread-store"
import type { Chat } from "@/lib/chat/types"
import { cn } from "@/lib/utils"
import { ChannelBadge } from "../channel-icon"
import { HAS_DETAILS_PANEL, ThreadHeaderExtras, ThreadMenuExtras } from "../extension-points"
import { EditableName, type EditableNameHandle } from "./editable-name"

/** O que todo cabeçalho de conversa recebe: o da tela larga e o do celular. */
export type ThreadHeaderProps = {
  chat: Chat
  connector: ChatConnector | undefined
  onBack: () => void
}

/**
 * O cabeçalho da conversa: quem é, por qual canal e o que dá para fazer. As ações mais usadas ficam
 * à mão; o resto, no menu. Ações novas entram por `ThreadHeaderExtras` e `ThreadMenuExtras`.
 */
export const ThreadHeader = memo(function ThreadHeader({ chat, connector }: ThreadHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const typing = useThreadStore((state) => state.threads[chat.id]?.typing ?? false)
  const nameField = useRef<EditableNameHandle>(null)
  const isTouch = useIsTouch()

  const channel = channelKey(connector, chat.audienceType)
  const name = chatDisplayName(chat, {
    visitor: t("chat.contact.visitor"),
    contact: t("chat.contact.fallback"),
  })
  const handle = contactHandle(chat, channel)
  const channelName = connector?.name ?? t(`chat.channel.${channel}`)
  const ready = !chat.partial

  const onRemoved = useCallback(() => navigate("/chat", { replace: true }), [navigate])
  const {
    closed,
    automationOn,
    automationLabel,
    statusLabel,
    toggleStatus,
    toggleAutomation,
    remove,
  } = useThreadActions(chat, { onRemoved })

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-3 md:px-4">
      <span className="relative shrink-0">
        <UserAvatar
          size="lg"
          name={name}
          src={chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null}
        />
        <ChannelBadge channel={channel} label={t(`chat.channel.${channel}`)} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col pl-1">
        {ready ? (
          <EditableName ref={nameField} chat={chat} name={name} />
        ) : (
          <h2 className="truncate font-heading text-base leading-6 font-semibold tracking-tight">{name}</h2>
        )}
        <p className="truncate text-xs text-muted-foreground" aria-live="polite">
          {typing ? t("chat.thread.typing") : [handle, channelName].filter(Boolean).join(" · ")}
        </p>
      </div>

      {ready ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <ThreadHeaderExtras chat={chat} />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-pressed={automationOn}
                  aria-label={`${automationLabel}. ${automationOn ? t("chat.automation.pause") : t("chat.automation.resume")}`}
                  className={cn("pointer-coarse:size-10", !automationOn && "text-muted-foreground")}
                  onClick={toggleAutomation}
                />
              }
            >
              {automationOn ? <Bot /> : <BotOff />}
            </TooltipTrigger>
            <TooltipContent>{automationLabel}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={statusLabel}
                  className={cn("pointer-coarse:size-10", closed && "text-muted-foreground")}
                  onClick={toggleStatus}
                />
              }
            >
              {closed ? <RotateCcw /> : <CheckCircle2 />}
            </TooltipTrigger>
            <TooltipContent>{statusLabel}</TooltipContent>
          </Tooltip>

          {HAS_DETAILS_PANEL ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("chat.header.details")}
                    className="pointer-coarse:size-10"
                    onClick={toggleContactDetails}
                  />
                }
              >
                <PanelRight />
              </TooltipTrigger>
              <TooltipContent>{t("chat.header.details")}</TooltipContent>
            </Tooltip>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("chat.header.more")}
                  className="pointer-coarse:size-10"
                />
              }
            >
              <MoreVertical />
            </DropdownMenuTrigger>
            {/* Com dedo, "Editar nome" leva o foco para o campo: o menu não pode puxá-lo de volta. */}
            <DropdownMenuContent
              align="end"
              className="w-auto min-w-52"
              finalFocus={isTouch ? false : undefined}
            >
              <ThreadMenuExtras chat={chat} />
              <DropdownMenuItem className="pointer-fine:hidden" onClick={() => nameField.current?.edit()}>
                <Pencil />
                {t("chat.header.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleStatus}>
                {closed ? <RotateCcw /> : <CheckCircle2 />}
                {statusLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
                <Trash2 />
                {t("chat.remove.action")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </header>
  )
})
