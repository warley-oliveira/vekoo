import { lazy, memo, Suspense, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckSquare, Copy, MoreHorizontal, Plus, Reply, SmilePlus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { ResponsivePopover } from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { canReactToMessage, meaningfulContent } from "@/lib/chat/message-rules"
import { useMessageSelection } from "@/lib/chat/stores"
import type { ChatMessage } from "@/lib/chat/types"
import { cn } from "@/lib/utils"
import { useThreadContext } from "./thread-context"

// `emoji-picker-react` é grande: só desce quando alguém pede "mais emojis".
const EmojiPicker = lazy(() => import("../composer/emoji-picker"))

/** As mesmas seis do menu rápido do WhatsApp, na mesma ordem. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

const actionButton = "size-7 text-muted-foreground pointer-coarse:size-9"

/**
 * Reagir. O popover só existe depois do primeiro clique: cada bolha na tela teria um, e rolar uma
 * conversa longa montaria dezenas a cada segundo sem ninguém abrir nenhum.
 */
function ReactionPicker({
  current,
  onSelect,
}: {
  current: string | null
  onSelect: (emoji: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={actionButton}
      aria-label={t("chat.message.react")}
      title={t("chat.message.react")}
      onClick={armed ? undefined : () => {
        setArmed(true)
        setOpen(true)
      }}
    >
      <SmilePlus className="size-4" />
    </Button>
  )

  if (!armed) return trigger

  const pick = (emoji: string) => {
    // Reagir de novo com o mesmo emoji tira a reação.
    onSelect(emoji === current ? "" : emoji)
    setOpen(false)
    setShowAll(false)
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setShowAll(false)
      }}
      trigger={trigger}
      title={t("chat.message.react")}
      className="w-auto gap-1 p-1"
    >
      <div className="flex items-center justify-center gap-0.5">
        {QUICK_REACTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={emoji}
            aria-pressed={emoji === current}
            className={cn("text-lg pointer-coarse:size-10", emoji === current && "bg-accent")}
            onClick={() => pick(emoji)}
          >
            {emoji}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("chat.message.moreEmojis")}
          aria-expanded={showAll}
          className="text-muted-foreground pointer-coarse:size-10"
          onClick={() => setShowAll((value) => !value)}
        >
          <Plus />
        </Button>
      </div>
      {showAll ? (
        <Suspense fallback={<Skeleton className="h-80 w-72" />}>
          <EmojiPicker onPick={pick} />
        </Suspense>
      ) : null}
    </ResponsivePopover>
  )
}

function MoreMenu({
  message,
  onReply,
}: {
  message: ChatMessage
  onReply: () => void
}) {
  const { t } = useTranslation()
  const { requestDelete } = useThreadContext()
  const [armed, setArmed] = useState(false)

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={actionButton}
      aria-label={t("chat.message.more")}
      title={t("chat.message.more")}
      onClick={armed ? undefined : () => setArmed(true)}
    >
      <MoreHorizontal className="size-4" />
    </Button>
  )

  if (!armed) return trigger

  const text = meaningfulContent(message.caption ?? message.content)

  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuItem onClick={onReply}>
          <Reply />
          {t("chat.message.reply")}
        </DropdownMenuItem>
        {text ? (
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => toast.success(t("chat.message.copied")))
                .catch(() => toast.error(t("chat.message.copyFailed")))
            }}
          >
            <Copy />
            {t("chat.message.copy")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => useMessageSelection.getState().enter(message.id)}>
          <CheckSquare />
          {t("chat.message.select")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => requestDelete([message])}>
          <Trash2 />
          {t("chat.message.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * As ações de uma mensagem. Aparecem ao passar o mouse ou ao focar; no toque, ao segurar a bolha,
 * que é quando `visible` vem ligado.
 */
export const MessageActions = memo(function MessageActions({
  message,
  own,
  visible,
}: {
  message: ChatMessage
  own: boolean
  visible: boolean
}) {
  const { t } = useTranslation()
  const { capabilities, react, reply, chatId } = useThreadContext()
  const selecting = useMessageSelection((state) => state.active)

  // Sem conversa única (aba "Todos"), ou escolhendo várias: não há ação por bolha.
  if (!chatId || selecting) return null

  const canReact = canReactToMessage(message, capabilities)
  const ownReaction = message.reactions?.find((item) => item.from === "assistant")?.emoji ?? null

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 self-center transition-opacity",
        own ? "flex-row-reverse" : "flex-row",
        visible
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100"
      )}
    >
      {canReact ? (
        <ReactionPicker current={ownReaction} onSelect={(emoji) => react(message, emoji)} />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={actionButton}
        aria-label={t("chat.message.reply")}
        title={t("chat.message.reply")}
        onClick={() => reply(message)}
      >
        <Reply className="size-4" />
      </Button>
      <MoreMenu message={message} onReply={() => reply(message)} />
    </div>
  )
})
