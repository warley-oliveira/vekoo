import { memo, useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useMotionPreset } from "@/lib/motion"
import { useMessageSelection } from "@/lib/chat/stores"
import { getThreadMessages } from "@/lib/chat/thread-store"
import type { ChatMessage } from "@/lib/chat/types"

/** A barra de quando se escolhe várias mensagens, por cima do cabeçalho. Esc sai. */
export const SelectionBar = memo(function SelectionBar({
  threadKey,
  onDelete,
}: {
  threadKey: string
  onDelete: (messages: ChatMessage[]) => void
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const active = useMessageSelection((state) => state.active)
  const count = useMessageSelection((state) => state.ids.size)
  const clear = useMessageSelection((state) => state.clear)

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [active, clear])

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key="selection"
          {...preset.fade}
          className="absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-2 border-b bg-background px-3"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pointer-coarse:size-10"
            aria-label={t("chat.selection.cancel")}
            onClick={clear}
          >
            <X />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">
            {t("chat.selection.count", { count })}
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={count === 0}
            onClick={() => {
              const { ids } = useMessageSelection.getState()
              onDelete(getThreadMessages(threadKey).filter((message) => ids.has(message.id)))
            }}
          >
            <Trash2 />
            {t("chat.selection.delete")}
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
})
