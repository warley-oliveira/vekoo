import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Mic } from "lucide-react"

import type { ContactPresence } from "@/lib/chat/thread-store"
import { cn } from "@/lib/utils"

/**
 * "digitando…" com os três pontos, ou "gravando áudio…" com o microfone. O mesmo desenho no
 * cabeçalho, na lista e no fim da conversa, para a pessoa reconhecer de relance.
 */
export const PresenceIndicator = memo(function PresenceIndicator({
  presence,
  className,
}: {
  presence: Exclude<ContactPresence, null>
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {presence === "recording" ? (
        <Mic aria-hidden className="chat-typing-dot size-3.5 shrink-0" />
      ) : (
        <span aria-hidden className="flex shrink-0 items-center gap-0.5">
          <span className="chat-typing-dot size-1 rounded-full bg-current" />
          <span className="chat-typing-dot size-1 rounded-full bg-current" />
          <span className="chat-typing-dot size-1 rounded-full bg-current" />
        </span>
      )}
      <span className="truncate">
        {t(presence === "recording" ? "chat.thread.recording" : "chat.thread.typing")}
      </span>
    </span>
  )
})
