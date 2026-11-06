import { memo, type ReactNode } from "react"
import { useDraggable } from "@dnd-kit/core"
import { useTranslation } from "react-i18next"
import { ArrowRightLeft, MessageSquare, PanelRight, Reply, StickyNote, UserRound } from "lucide-react"

import { ActionsMenu, RelativeTime, TagChip, UserAvatar } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import { apiAssetUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import { chatName, contactPhone } from "./chat-format"
import type { BoardChat } from "./types"

const VISIBLE_TAGS = 3

/** A prévia não é o texto cru: áudio sem transcrição vem como "-", e mídia pode vir sem nada. */
function usePreview(chat: BoardChat): string | null {
  const { t } = useTranslation()
  const content = chat.lastMessageContent?.trim()
  const isMedia = chat.lastMessageType && chat.lastMessageType !== "text"
  if (isMedia && (!content || content === "-")) {
    const kind = ["image", "audio"].includes(chat.lastMessageType ?? "") ? chat.lastMessageType : "media"
    return t(`funnels.card.preview.${kind}`)
  }
  return content || null
}

type ChatCardProps = {
  chat: BoardChat
  /** O movimento de ir à conversa, às etapas e ao painel vem da tela. */
  onOpen: (chat: BoardChat) => void
  onOpenChat: (chat: BoardChat) => void
  onMove: (chat: BoardChat) => void
  /** Sem arrastar no celular: uma coluna por vez, e o botão "Mover" no lugar. */
  draggable: boolean
}

/** O cartão no quadro. `memo`: mover um não redesenha os outros 80. */
export const ChatCard = memo(function ChatCard({ chat, onOpen, onOpenChat, onMove, draggable }: ChatCardProps) {
  const { t } = useTranslation()
  const name = chatName(chat, t("funnels.card.noName"))
  const canChat = useCan("chat")

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: chat.id,
    disabled: !draggable,
    data: { chat },
    attributes: { roleDescription: t("funnels.dnd.roleDescription") },
  })

  return (
    <ChatCardBody
      chat={chat}
      rootRef={setNodeRef}
      className={cn(isDragging && "opacity-40")}
      footerAction={
        draggable ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative z-10 -mr-1.5 h-7 px-1.5 text-xs text-muted-foreground"
            onClick={() => onMove(chat)}
          >
            <ArrowRightLeft />
            {t("funnels.card.moveShort")}
          </Button>
        )
      }
      menu={
        <ActionsMenu
          label={t("funnels.card.actionsOf", { name })}
          className="relative z-10 -mt-1 -mr-1.5"
          actions={[
            {
              label: t("funnels.card.openChat"),
              icon: <MessageSquare />,
              hidden: !canChat,
              onSelect: () => onOpenChat(chat),
            },
            {
              label: t("funnels.card.details"),
              icon: <PanelRight />,
              onSelect: () => onOpen(chat),
            },
            {
              label: t("funnels.card.move"),
              icon: <ArrowRightLeft />,
              onSelect: () => onMove(chat),
            },
          ]}
        />
      }
      title={
        // O botão cobre o cartão inteiro por um `after`: clicar abre o painel, arrastar move, e as
        // ações ficam acima dele. Um elemento só para o foco, e o Espaço pega o cartão.
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-disabled={undefined}
          aria-label={t("funnels.card.open", { name })}
          onClick={() => onOpen(chat)}
          className={cn(
            "block w-full truncate rounded text-left text-sm font-medium outline-none",
            "after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50",
            draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          )}
        >
          {name}
        </button>
      }
    />
  )
})

/** O cartão em si, sem arrastar: é o que a sombra mostra enquanto ele viaja. */
export function ChatCardPreview({ chat }: { chat: BoardChat }) {
  const { t } = useTranslation()
  return (
    <ChatCardBody
      chat={chat}
      className="cursor-grabbing shadow-lg ring-foreground/20"
      title={<span className="block truncate text-sm font-medium">{chatName(chat, t("funnels.card.noName"))}</span>}
    />
  )
}

type ChatCardBodyProps = {
  chat: BoardChat
  title: ReactNode
  menu?: ReactNode
  footerAction?: ReactNode
  rootRef?: (node: HTMLElement | null) => void
  className?: string
}

function ChatCardBody({ chat, title, menu, footerAction, rootRef, className }: ChatCardBodyProps) {
  const { t } = useTranslation()
  const preview = usePreview(chat)
  const name = chatName(chat, t("funnels.card.noName"))
  const phone = contactPhone(chat.phoneNumber)
  const isOpen = chat.status === "open"
  const hiddenTags = chat.chatTags.length - VISIBLE_TAGS

  return (
    <article
      ref={rootRef}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <UserAvatar
          name={name}
          src={chat.profilePictureUrl ? apiAssetUrl(chat.profilePictureUrl) : null}
          status={chat.activeSession ? "online" : undefined}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          {title}
          {phone ? <p className="truncate text-xs text-muted-foreground tabular-nums">{phone}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {chat.unreadMessages > 0 ? (
            <span
              aria-label={t("funnels.card.unread", { count: chat.unreadMessages })}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground tabular-nums"
            >
              {chat.unreadMessages}
            </span>
          ) : null}
          {menu}
        </div>
      </div>

      {preview ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {chat.lastMessageBy === "assistant" ? (
            <Reply
              aria-label={t("funnels.card.sentByUs")}
              className="mr-1 inline size-3 align-[-2px]"
            />
          ) : null}
          {preview}
        </p>
      ) : null}

      {chat.chatTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {chat.chatTags.slice(0, VISIBLE_TAGS).map((tag) => (
            <TagChip key={tag.id} color={tag.color} className="max-w-28 truncate">
              {tag.name}
            </TagChip>
          ))}
          {hiddenTags > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("funnels.card.moreTags", { count: hiddenTags })}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-1">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", isOpen ? "bg-status-success" : "bg-muted-foreground/50")}
          />
          {t(isOpen ? "funnels.card.open_status" : "funnels.card.closed_status")}
        </span>
        {chat.assignedAccountName ? (
          <span className="inline-flex min-w-0 items-center gap-1" title={chat.assignedAccountName}>
            <UserRound aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{chat.assignedAccountName}</span>
          </span>
        ) : null}
        {chat.notes ? (
          <span title={chat.notes} className="shrink-0">
            <StickyNote aria-label={t("funnels.card.hasNote")} className="size-3" />
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {chat.lastMessageAt ? <RelativeTime value={chat.lastMessageAt} className="tabular-nums" /> : null}
          {footerAction}
        </span>
      </div>
    </article>
  )
}
