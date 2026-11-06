import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ImageOff, Play } from "lucide-react"

import { mediaSource } from "@/lib/chat/media"
import { messageKind } from "@/lib/chat/message-rules"
import { useMessageSelection, useThreadUi } from "@/lib/chat/stores"
import type { ChatMessage } from "@/lib/chat/types"
import { cn } from "@/lib/utils"

const STICKER_SIZE = "size-32"

/** Caixa estável enquanto a imagem não chega: a lista virtual não pula quando ela carrega. */
const DEFAULT_BOX = { width: 280, height: 210 }
const MAX_WIDTH = 280
const MAX_HEIGHT = 320

function boxOf(message: ChatMessage): { width: number; aspectRatio: string } {
  const { width, height } = message.mediaProperties ?? {}
  if (!width || !height) {
    return {
      width: DEFAULT_BOX.width,
      aspectRatio: `${DEFAULT_BOX.width} / ${DEFAULT_BOX.height}`,
    }
  }

  const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1)
  return {
    width: Math.max(Math.round(width * scale), 120),
    aspectRatio: `${width} / ${height}`,
  }
}

export function openViewer(threadKey: string, messageId: string) {
  useThreadUi.setState({ viewer: { threadKey, messageId } })
}

function Unavailable({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-xl bg-foreground/[0.04] text-xs text-muted-foreground",
        className
      )}
    >
      <ImageOff aria-hidden className="size-4" />
      {t("chat.media.unavailable")}
    </span>
  )
}

/** A foto ou o vídeo de uma mensagem. O clique abre o visualizador; vídeo também toca nele. */
export const MessageMedia = memo(function MessageMedia({
  message,
  threadKey,
}: {
  message: ChatMessage
  threadKey: string
}) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const kind = messageKind(message)
  const source = mediaSource(message.mediaUrl)
  const box = boxOf(message)

  if (!source || failed) {
    return <Unavailable className="h-32 w-56 max-w-full" />
  }

  return (
    <button
      type="button"
      aria-label={t(kind === "video" ? "chat.media.openVideo" : "chat.media.openImage")}
      onClick={() => openViewer(threadKey, message.id)}
      style={{ width: box.width, aspectRatio: box.aspectRatio }}
      className="relative block max-w-full overflow-hidden rounded-xl bg-foreground/[0.04] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {kind === "video" ? (
        <>
          <video
            src={source}
            preload="metadata"
            muted
            playsInline
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-foreground/60 text-background">
              <Play aria-hidden className="size-4 fill-current" />
            </span>
          </span>
        </>
      ) : (
        <img
          src={source}
          alt={message.caption ?? ""}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </button>
  )
})

/** Figurinha: só a imagem, sem bolha, como no WhatsApp. */
export const StickerImage = memo(function StickerImage({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const source = mediaSource(message.mediaUrl)

  if (!source || failed) {
    return <span className="text-sm text-muted-foreground italic">{t("chat.media.stickerUnavailable")}</span>
  }

  return (
    <img
      src={source}
      alt={t("chat.preview.sticker")}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(STICKER_SIZE, "object-contain")}
    />
  )
})

/** Mídias enviadas em sequência: grade de até quatro, e o resto em "+N". */
export const MediaGrid = memo(function MediaGrid({
  messages,
  threadKey,
  selecting,
}: {
  messages: ChatMessage[]
  threadKey: string
  selecting: boolean
}) {
  const { t } = useTranslation()
  const visible = messages.slice(0, 4)
  const hidden = messages.length - visible.length

  return (
    <div className="grid grid-cols-2 gap-1">
      {visible.map((message, index) => (
        <GridTile
          key={message.id}
          message={message}
          threadKey={threadKey}
          selecting={selecting}
          // Três mídias: a primeira ocupa a linha inteira.
          wide={messages.length === 3 && index === 0}
          overlay={
            index === visible.length - 1 && hidden > 0
              ? t("chat.media.more", { count: hidden })
              : null
          }
        />
      ))}
    </div>
  )
})

const GridTile = memo(function GridTile({
  message,
  threadKey,
  selecting,
  wide,
  overlay,
}: {
  message: ChatMessage
  threadKey: string
  selecting: boolean
  wide: boolean
  overlay: string | null
}) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const selected = useMessageSelection((state) => state.ids.has(message.id))
  const kind = messageKind(message)
  const source = mediaSource(message.mediaUrl)

  const onClick = () => {
    if (selecting) useMessageSelection.getState().toggle(message.id)
    else openViewer(threadKey, message.id)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecting ? selected : undefined}
      aria-label={t(kind === "video" ? "chat.media.openVideo" : "chat.media.openImage")}
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg bg-foreground/[0.04] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        wide && "col-span-2 aspect-video",
        selected && "ring-2 ring-primary"
      )}
    >
      {!source || failed ? (
        <Unavailable className="size-full rounded-none" />
      ) : kind === "video" ? (
        <>
          <video
            src={source}
            preload="metadata"
            muted
            playsInline
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-8 items-center justify-center rounded-full bg-foreground/60 text-background">
              <Play aria-hidden className="size-3.5 fill-current" />
            </span>
          </span>
        </>
      ) : (
        <img
          src={source}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
      {overlay ? (
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-lg font-medium text-background">
          {overlay}
        </span>
      ) : null}
    </button>
  )
})
