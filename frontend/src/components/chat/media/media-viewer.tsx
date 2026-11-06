import { useEffect, useMemo, useState } from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { AnimatePresence, motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useMotionPreset } from "@/lib/motion"
import { downloadMedia, mediaSource } from "@/lib/chat/media"
import { messageKind } from "@/lib/chat/message-rules"
import { useThreadUi } from "@/lib/chat/stores"
import { useThreadStore } from "@/lib/chat/thread-store"
import type { ChatMessage } from "@/lib/chat/types"
import { cn } from "@/lib/utils"

const NO_MESSAGES: ChatMessage[] = []

function isViewable(message: ChatMessage): boolean {
  if (message.deletedAt || !message.mediaUrl) return false
  const kind = messageKind(message)
  return kind === "image" || kind === "video"
}

/**
 * A mídia em tela cheia: ← e → andam por todas as fotos e vídeos já carregados da conversa, Esc
 * fecha, e o foco fica preso aqui, pelo diálogo do Base UI. Usa a primitiva direto, e não o
 * `ResponsiveDialog`, porque não é um diálogo com título e corpo: é a imagem e nada mais.
 */
export function MediaViewer() {
  const viewer = useThreadUi((state) => state.viewer)
  const close = () => useThreadUi.setState({ viewer: null })

  return (
    <DialogPrimitive.Root open={Boolean(viewer)} onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        {viewer ? <ViewerContent threadKey={viewer.threadKey} startId={viewer.messageId} onClose={close} /> : null}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function ViewerContent({
  threadKey,
  startId,
  onClose,
}: {
  threadKey: string
  startId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const messages = useThreadStore((state) => state.threads[threadKey]?.messages ?? NO_MESSAGES)
  const items = useMemo(() => messages.filter(isViewable), [messages])

  const [currentId, setCurrentId] = useState(startId)
  const [downloading, setDownloading] = useState(false)

  const index = Math.max(
    items.findIndex((item) => item.id === currentId),
    0
  )
  const current: ChatMessage | undefined = items[index]
  const hasMany = items.length > 1

  const go = (delta: number) => {
    if (!hasMany) return
    const next = (index + delta + items.length) % items.length
    setCurrentId(items[next].id)
  }

  // Sumiu (foi apagada enquanto estava aberta): nada a mostrar.
  useEffect(() => {
    if (!current) onClose()
  }, [current, onClose])

  if (!current) return null

  const kind = messageKind(current)
  const source = mediaSource(current.mediaUrl) as string

  const download = async () => {
    if (downloading || !current.mediaUrl) return
    setDownloading(true)
    try {
      await downloadMedia(current.mediaUrl, current.mediaProperties?.fileName)
    } finally {
      setDownloading(false)
    }
  }

  const iconButton =
    "text-background hover:bg-background/15 hover:text-background pointer-coarse:size-10"

  return (
    <DialogPrimitive.Popup
      aria-label={t("chat.media.viewer")}
      className="fixed inset-0 z-50 flex flex-col bg-foreground pt-safe pb-safe outline-none"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(1)
        if (event.key === "ArrowLeft") go(-1)
      }}
    >
      <DialogPrimitive.Title className="sr-only">{t("chat.media.viewer")}</DialogPrimitive.Title>

      <div className="flex shrink-0 items-center justify-end gap-1 p-2">
        {hasMany ? (
          <span className="mr-auto pl-2 text-xs text-background/70 tabular-nums">
            {t("chat.media.position", { current: index + 1, total: items.length })}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconButton}
          disabled={downloading}
          aria-label={t("chat.media.downloadCurrent")}
          onClick={() => void download()}
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
        </Button>
        <DialogPrimitive.Close
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={iconButton}
              aria-label={t("chat.media.close")}
            />
          }
        >
          <X />
        </DialogPrimitive.Close>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-14">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.id}
            className="flex size-full items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={preset.reduced ? { duration: 0 } : { duration: 0.15 }}
          >
            {kind === "video" ? (
              <video
                key={source}
                src={source}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg"
              />
            ) : (
              <img
                src={source}
                alt={current.caption ?? ""}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )}
          </motion.div>
        </AnimatePresence>

        {hasMany ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={cn(iconButton, "absolute top-1/2 left-1 -translate-y-1/2 md:left-3")}
              aria-label={t("chat.media.previous")}
              onClick={() => go(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={cn(iconButton, "absolute top-1/2 right-1 -translate-y-1/2 md:right-3")}
              aria-label={t("chat.media.next")}
              onClick={() => go(1)}
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
      </div>

      {current.caption ? (
        <p className="shrink-0 px-4 pt-2 text-center text-sm whitespace-pre-wrap text-background/90">
          {current.caption}
        </p>
      ) : null}

      {hasMany ? (
        <div className="flex shrink-0 justify-center gap-1.5 overflow-x-auto p-3 [scrollbar-width:none]">
          {items.map((item, position) => {
            const thumb = mediaSource(item.mediaUrl) as string
            const active = position === index
            return (
              <button
                key={item.id}
                type="button"
                aria-label={t("chat.media.goTo", { position: position + 1 })}
                aria-current={active ? "true" : undefined}
                onClick={() => setCurrentId(item.id)}
                className={cn(
                  "size-12 shrink-0 overflow-hidden rounded-lg outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-background/60",
                  active ? "ring-2 ring-background" : "opacity-50 hover:opacity-90"
                )}
              >
                {messageKind(item) === "video" ? (
                  <video src={thumb} muted preload="metadata" className="size-full object-cover" />
                ) : (
                  <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </button>
            )
          })}
        </div>
      ) : null}
    </DialogPrimitive.Popup>
  )
}
