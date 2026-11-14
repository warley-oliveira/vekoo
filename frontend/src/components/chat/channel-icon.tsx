import { Globe, MessageCircle } from "lucide-react"

import {
  InstagramGlyph,
  MessengerGlyph,
  WhatsappGlyph,
} from "@/components/connectors/channel-glyphs"
import type { ChannelKey } from "@/lib/chat/channel"
import { cn } from "@/lib/utils"

/**
 * A cor reconhecível de cada canal, contida: o verde do WhatsApp, o rosa do Instagram, o azul do
 * Messenger e um azul-acinzentado para o site, sempre sobre um fundo suave do mesmo matiz. Tokens
 * `channel-*` do tema. É o que deixa a pessoa reconhecer o canal sem ler.
 */
const CHANNEL_TONE: Record<ChannelKey, { icon: string; soft: string }> = {
  whatsapp: { icon: "text-channel-whatsapp", soft: "bg-channel-whatsapp-soft" },
  whatsapp_cloud: { icon: "text-channel-whatsapp", soft: "bg-channel-whatsapp-soft" },
  instagram: { icon: "text-channel-instagram", soft: "bg-channel-instagram-soft" },
  messenger: { icon: "text-channel-messenger", soft: "bg-channel-messenger-soft" },
  web: { icon: "text-channel-web", soft: "bg-channel-web-soft" },
  other: { icon: "text-channel-other", soft: "bg-channel-other-soft" },
}

/** A marca do canal. `colored` pinta na cor do canal; sem, segue a cor do texto em volta. */
export function ChannelIcon({
  channel,
  className,
  colored = false,
}: {
  channel: ChannelKey
  className?: string
  colored?: boolean
}) {
  const classes = cn(colored && CHANNEL_TONE[channel].icon, className)
  switch (channel) {
    case "whatsapp":
    case "whatsapp_cloud":
      return <WhatsappGlyph className={classes} />
    case "instagram":
      return <InstagramGlyph className={classes} />
    case "messenger":
      return <MessengerGlyph className={classes} />
    case "web":
      return <Globe aria-hidden className={classes} />
    default:
      return <MessageCircle aria-hidden className={classes} />
  }
}

/** A marca pequena no canto do avatar, na cor do canal, com um aro do fundo para descolar da foto. */
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
        "absolute -right-1 -bottom-1 flex size-[1.125rem] items-center justify-center rounded-full ring-2 ring-background",
        CHANNEL_TONE[channel].soft,
        className
      )}
    >
      <ChannelIcon channel={channel} colored className="size-2.5" />
    </span>
  )
}
