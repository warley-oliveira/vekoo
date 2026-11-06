import { memo } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMotionPreset } from "@/lib/motion"
import type { MessageReaction } from "@/lib/chat/types"
import { cn } from "@/lib/utils"

/**
 * As reações, sobre a borda de baixo da bolha, do lado de fora. Numa conversa de duas pessoas há
 * no máximo uma por lado, então não há contador. Clicar na própria tira. A pílula entra com uma
 * mola curta: é o único jeito de quem está lendo notar que alguém reagiu.
 */
export const MessageReactions = memo(function MessageReactions({
  reactions,
  own,
  contactName,
  onRemoveOwn,
}: {
  reactions: MessageReaction[] | null | undefined
  own: boolean
  contactName: string
  onRemoveOwn?: () => void
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()

  const items = (reactions ?? []).filter((reaction) => reaction.emoji)
  const ownReaction = items.find((reaction) => reaction.from === "assistant")
  const clickable = Boolean(ownReaction && onRemoveOwn)

  const describe = (reaction: MessageReaction) =>
    reaction.from === "assistant"
      ? (reaction.senderName ?? t("chat.reply.you"))
      : (reaction.senderName ?? contactName)

  const tooltip = items.map((reaction) => `${reaction.emoji} ${describe(reaction)}`).join(" · ")

  return (
    <AnimatePresence initial={false}>
      {items.length > 0 ? (
        <motion.div
          key="reactions"
          initial={preset.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={preset.reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={preset.spring}
          className={cn("absolute -bottom-2.5 z-[1]", own ? "right-2" : "left-2")}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={onRemoveOwn}
                  aria-label={clickable ? t("chat.message.removeReaction") : tooltip}
                  className={cn(
                    "flex h-5 items-center gap-0.5 rounded-full border bg-background px-1.5 text-xs leading-none shadow-xs outline-none disabled:cursor-default",
                    clickable && "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  )}
                />
              }
            >
              {items.map((reaction) => (
                <span key={`${reaction.from}-${reaction.emoji}`}>{reaction.emoji}</span>
              ))}
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
})
