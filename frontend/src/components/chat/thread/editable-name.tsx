import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pencil } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { updateChat } from "@/lib/chat/actions"
import type { Chat } from "@/lib/chat/types"

const MAX_LENGTH = 120

/** O nome do contato, editável ali mesmo. Enter e sair do campo salvam; Esc desiste. */
export function EditableName({ chat, name }: { chat: Chat; name: string }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const input = useRef<HTMLInputElement>(null)
  // Esc também tira o foco: sem isto, o `blur` salvaria o que a pessoa acabou de desistir.
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const start = () => {
    cancelled.current = false
    setDraft(chat.displayName || chat.userName || "")
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (cancelled.current) return

    const next = draft.trim().slice(0, MAX_LENGTH)
    if (next === (chat.displayName ?? "") || next === name) return

    updateChat(chat.id, { displayName: next || null }).catch(() => {
      toast.error(t("chat.header.renameFailed"))
    })
  }

  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        maxLength={MAX_LENGTH}
        aria-label={t("chat.header.rename")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === "Escape") {
            event.stopPropagation()
            cancelled.current = true
            event.currentTarget.blur()
          }
        }}
        className="w-full min-w-0 rounded-sm bg-transparent font-heading text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    )
  }

  return (
    <span className="group/name flex min-w-0 items-center gap-1">
      <h2 className="truncate font-heading text-base leading-6 font-semibold tracking-tight">
        {name}
      </h2>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground opacity-0 group-hover/name:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        aria-label={t("chat.header.rename")}
        title={t("chat.header.rename")}
        onClick={start}
      >
        <Pencil />
      </Button>
    </span>
  )
}
