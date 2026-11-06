import { Globe, MessageCircle } from "lucide-react"

import {
  InstagramGlyph,
  MessengerGlyph,
  WhatsappGlyph,
} from "@/components/connectors/channel-glyphs"
import type { ChannelKey } from "@/lib/chat/channel"
import { cn } from "@/lib/utils"

/** A marca do canal, em uma cor só: a interface é quieta e o acento é o violeta. */
export function ChannelIcon({ channel, className }: { channel: ChannelKey; className?: string }) {
  switch (channel) {
    case "whatsapp":
    case "whatsapp_cloud":
      return <WhatsappGlyph className={className} />
    case "instagram":
      return <InstagramGlyph className={className} />
    case "messenger":
      return <MessengerGlyph className={className} />
    case "web":
      return <Globe aria-hidden className={className} />
    default:
      return <MessageCircle aria-hidden className={className} />
  }
}

/** A marca pequena no canto do avatar, sem disputar com a foto. */
export function ChannelBadge({
  channel,
  label,
  className,
}: {
  channel: ChannelKey
  /** Nome do canal, para quem passa o mouse ou usa leitor de tela. */
  label: string
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "absolute -right-0.5 -bottom-0.5 flex size-[1.125rem] items-center justify-center rounded-full bg-background text-foreground/70 ring-1 ring-border",
        className
      )}
    >
      <ChannelIcon channel={channel} className="size-2.5" />
    </span>
  )
}
