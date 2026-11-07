import { lazy, Suspense, useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckSquare, Copy, Plus, Reply, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/shell/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBackLayer } from "@/hooks/use-back-layer"
import { useRetained } from "@/hooks/use-panel-session"
import { canReactToMessage, copyableText, QUICK_REACTIONS } from "@/lib/chat/message-rules"
import { useMessageSelection, useThreadUi } from "@/lib/chat/stores"
import { useThreadStore } from "@/lib/chat/thread-store"
import { cn } from "@/lib/utils"
import { QuotedMessage } from "../thread/message-parts"
import { useThreadContext } from "../thread/thread-context"
import { SheetRow } from "./sheet-row"

const EmojiPicker = lazy(() => import("../composer/emoji-picker"))

/**
 * Segurar uma bolha abre esta folha: reagir no alto, onde a pessoa reconhece a fileira do WhatsApp, e
 * as ações embaixo, ao alcance do polegar. Na tela larga a mesma coisa aparece ao lado da bolha. O
 * voltar do aparelho fecha a folha, e também sai da escolha de várias mensagens.
 */
export default function MobileMessageSheet() {
  const { t } = useTranslation()
  const { threadKey, chatId, capabilities, contactName, react, reply, requestDelete } =
    useThreadContext()

  const activeId = useThreadUi((state) => state.activeMessageId)
  const message = useThreadStore((state) =>
    activeId ? state.threads[threadKey]?.messages.find((item) => item.id === activeId) : undefined
  )
  const shown = useRetained(message)
  const [allEmojis, setAllEmojis] = useState(false)

  const close = useCallback(() => {
    useThreadUi.setState({ activeMessageId: null })
    setAllEmojis(false)
  }, [])

  const selecting = useMessageSelection((state) => state.active)
  const clearSelection = useMessageSelection((state) => state.clear)
  useBackLayer(selecting, clearSelection)

  const open = Boolean(chatId && message)
  const canReact = shown ? canReactToMessage(shown, capabilities) : false
  const ownReaction = shown?.reactions?.find((item) => item.from === "assistant")?.emoji ?? null
  const text = shown ? copyableText(shown) : null

  const pickReaction = (emoji: string) => {
    if (!shown) return
    // Reagir de novo com o mesmo emoji tira a reação.
    react(shown, emoji === ownReaction ? "" : emoji)
    close()
  }

  return (
    <BottomSheet open={open} onClose={close} title={t("chatMobile.message.title")} disableDrag={allEmojis}>
      {shown ? (
        <div className="flex flex-col gap-2 pb-3">
          <QuotedMessage message={shown} contactName={contactName} className="mb-0" />

          {canReact ? (
            <div className="flex items-center justify-between gap-0.5 py-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  data-slot="reaction"
                  aria-label={emoji}
                  aria-pressed={emoji === ownReaction}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-[1.5rem] leading-none transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted",
                    emoji === ownReaction && "bg-accent"
                  )}
                  onClick={() => pickReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("chat.message.moreEmojis")}
                aria-expanded={allEmojis}
                className="size-11 rounded-full text-muted-foreground [&_svg]:size-5"
                onClick={() => setAllEmojis((value) => !value)}
              >
                <Plus />
              </Button>
            </div>
          ) : null}

          {allEmojis ? (
            <div data-no-sheet-drag>
              <Suspense fallback={<Skeleton className="h-75 w-full" />}>
                <EmojiPicker onPick={pickReaction} height={300} />
              </Suspense>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <SheetRow
                icon={<Reply />}
                title={t("chat.message.reply")}
                onClick={() => {
                  close()
                  reply(shown)
                }}
              />
              {text ? (
                <SheetRow
                  icon={<Copy />}
                  title={t("chat.message.copy")}
                  onClick={() => {
                    close()
                    void navigator.clipboard
                      .writeText(text)
                      .then(() => toast.success(t("chat.message.copied")))
                      .catch(() => toast.error(t("chat.message.copyFailed")))
                  }}
                />
              ) : null}
              <SheetRow
                icon={<CheckSquare />}
                title={t("chat.message.select")}
                onClick={() => {
                  close()
                  useMessageSelection.getState().enter(shown.id)
                }}
              />
              <SheetRow
                destructive
                icon={<Trash2 />}
                title={t("chat.message.delete")}
                onClick={() => {
                  close()
                  requestDelete([shown])
                }}
              />
            </div>
          )}
        </div>
      ) : null}
    </BottomSheet>
  )
}
