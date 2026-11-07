import { lazy, memo, Suspense, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowLeft,
  Bot,
  BotOff,
  CheckCircle2,
  FileText,
  MoreVertical,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react"

import { BottomSheet } from "@/components/shell/bottom-sheet"
import { UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useThreadActions } from "@/hooks/chat/use-thread-actions"
import { apiAssetUrl } from "@/lib/api"
import { channelKey, contactHandle, isConnectorDown } from "@/lib/chat/channel"
import { chatDisplayName } from "@/lib/chat/chat-store"
import { useThreadStore } from "@/lib/chat/thread-store"
import { openCopilot, toggleContactDetails } from "@/lib/chat-details/panel-store"
import { openTemplateSender } from "@/lib/chat-details/template-sender-store"
import { cn } from "@/lib/utils"
import { ChannelBadge } from "../channel-icon"
import { ThreadHeaderExtras } from "../extension-points"
import type { ThreadHeaderProps } from "../thread/thread-header"
import { SheetRow } from "./sheet-row"

const RenameDialog = lazy(() => import("./rename-dialog"))

/**
 * O topo da conversa no celular: voltar, quem é, e o resto numa folha. Na tela larga são quatro ícones,
 * que aqui espremiam o nome em poucas letras e ficavam longe do polegar. Tocar em quem é abre o painel
 * do contato, como nos apps de mensagem.
 */
export default memo(function MobileThreadHeader({ chat, connector, onBack }: ThreadHeaderProps) {
  const { t } = useTranslation()
  const typing = useThreadStore((state) => state.threads[chat.id]?.typing ?? false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const closeRename = useCallback(() => setRenaming(false), [])

  const channel = channelKey(connector, chat.audienceType)
  const name = chatDisplayName(chat, {
    visitor: t("chat.contact.visitor"),
    contact: t("chat.contact.fallback"),
  })
  const handle = contactHandle(chat, channel)
  const channelName = connector?.name ?? t(`chat.channel.${channel}`)
  const ready = !chat.partial

  const {
    closed,
    automationOn,
    automationLabel,
    statusLabel,
    toggleStatus,
    toggleAutomation,
    remove,
  } = useThreadActions(chat, { onRemoved: onBack })

  const canSendTemplate = connector?.type === "whatsapp_cloud" && !isConnectorDown(connector)

  const fromMenu = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <header className="shrink-0 border-b bg-background pt-safe">
      <div className="flex h-14 items-center gap-0.5 pr-1 pl-1 landscape:h-11">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 [&_svg]:size-5"
          aria-label={t("chat.header.back")}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>

        <button
          type="button"
          disabled={!ready}
          aria-label={t("chatMobile.thread.openDetails", { name })}
          onClick={toggleContactDetails}
          className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl pr-2 pl-1 text-left transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/70 disabled:active:bg-transparent"
        >
          <span className="relative shrink-0">
            <UserAvatar
              name={name}
              src={chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null}
              className="size-9"
            />
            <ChannelBadge channel={channel} label={t(`chat.channel.${channel}`)} className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-heading text-[0.9375rem] leading-5 font-semibold tracking-tight">
              {name}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground" aria-live="polite">
              {typing ? (
                <span className="truncate text-primary">{t("chat.thread.typing")}</span>
              ) : (
                <>
                  {ready ? (
                    <span className={cn("shrink-0", closed && "text-foreground")}>
                      {closed ? t("chatMobile.thread.closed") : t("chatMobile.thread.open")}
                    </span>
                  ) : null}
                  {automationOn && ready ? (
                    <Bot role="img" aria-label={automationLabel} className="size-3.5 shrink-0" />
                  ) : null}
                  <span className="truncate">
                    {ready && !automationOn ? "· " : ""}
                    {handle ?? channelName}
                  </span>
                </>
              )}
            </span>
          </span>
        </button>

        {ready ? (
          <>
            <ThreadHeaderExtras chat={chat} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 [&_svg]:size-5"
              aria-label={t("chat.header.more")}
              onClick={() => setMenuOpen(true)}
            >
              <MoreVertical />
            </Button>

            <BottomSheet
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              title={t("chat.header.more")}
            >
              <div className="flex flex-col gap-0.5 pb-3">
                <SheetRow
                  icon={closed ? <RotateCcw /> : <CheckCircle2 />}
                  title={statusLabel}
                  hint={closed ? t("chatMobile.thread.closedHint") : t("chatMobile.thread.openHint")}
                  onClick={fromMenu(toggleStatus)}
                />
                <SheetRow
                  icon={automationOn ? <Bot /> : <BotOff />}
                  title={automationOn ? t("chat.automation.pause") : t("chat.automation.resume")}
                  hint={automationLabel}
                  onClick={fromMenu(toggleAutomation)}
                />
                <SheetRow
                  icon={<UserRound />}
                  title={t("chat.header.details")}
                  onClick={fromMenu(toggleContactDetails)}
                />
                <SheetRow
                  icon={<Pencil />}
                  title={t("chat.header.rename")}
                  onClick={fromMenu(() => setRenaming(true))}
                />
                {canSendTemplate ? (
                  <SheetRow
                    icon={<FileText />}
                    title={t("chatDetails.template.open")}
                    onClick={fromMenu(() => openTemplateSender(chat.id))}
                  />
                ) : null}
                <SheetRow
                  icon={<Sparkles />}
                  title={t("chatDetails.copilot.open")}
                  onClick={fromMenu(openCopilot)}
                />
                <SheetRow
                  destructive
                  icon={<Trash2 />}
                  title={t("chat.remove.action")}
                  onClick={fromMenu(() => void remove())}
                />
              </div>
            </BottomSheet>

            {renaming ? (
              <Suspense fallback={null}>
                <RenameDialog chat={chat} onClose={closeRename} />
              </Suspense>
            ) : null}
          </>
        ) : null}
      </div>
    </header>
  )
})
