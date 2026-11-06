import { useState } from "react"
import { BadgeCheck, Globe, MessageCircle } from "lucide-react"

import { apiAssetUrl } from "@/lib/api"
import type { Connector, ConnectorType } from "@/lib/connectors/types"
import { connectorPicture } from "@/lib/connectors/channels"
import { cn } from "@/lib/utils"
import { InstagramGlyph, MessengerGlyph, WhatsappGlyph } from "./channel-glyphs"

/** O desenho de cada tipo, em uma cor só. */
function ChannelGlyph({ type, className }: { type: ConnectorType; className?: string }) {
  switch (type) {
    case "whatsapp_web":
    case "zapi":
    case "whatsapp_cloud":
      return <WhatsappGlyph className={className} />
    case "instagram_direct":
      return <InstagramGlyph className={className} />
    case "facebook_messenger":
      return <MessengerGlyph className={className} />
    case "web_widget":
      return <Globe className={className} aria-hidden />
    default:
      return <MessageCircle className={className} aria-hidden />
  }
}

const SIZES = {
  sm: { box: "size-8 rounded-lg", glyph: "size-4", badge: "size-3.5 -right-1 -bottom-1" },
  md: { box: "size-10 rounded-xl", glyph: "size-5", badge: "size-4 -right-1 -bottom-1" },
  lg: { box: "size-14 rounded-2xl", glyph: "size-7", badge: "size-5 -right-1 -bottom-1" },
} as const

export type ChannelMarkProps = {
  type: ConnectorType
  /** A foto do perfil, quando o canal tem. Sem ela, a marca do canal. */
  picture?: string | null
  size?: keyof typeof SIZES
  className?: string
}

/**
 * A marca de um canal. A API oficial leva um selo: é o mesmo WhatsApp do desenho, e é
 * esse selo que separa os dois numa lista.
 */
export function ChannelMark({ type, picture, size = "md", className }: ChannelMarkProps) {
  const sizes = SIZES[size]
  const [failed, setFailed] = useState<string | null>(null)
  const source = picture ? apiAssetUrl(picture) : null
  const showPicture = source !== null && failed !== source

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {showPicture ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          onError={() => setFailed(source)}
          className={cn(sizes.box, "rounded-full object-cover ring-1 ring-foreground/10")}
        />
      ) : (
        <span
          className={cn(
            sizes.box,
            "flex items-center justify-center bg-muted text-foreground/70"
          )}
        >
          <ChannelGlyph type={type} className={sizes.glyph} />
        </span>
      )}
      {type === "whatsapp_cloud" ? (
        <BadgeCheck
          aria-hidden
          className={cn(
            "absolute rounded-full bg-background text-foreground/70",
            sizes.badge
          )}
        />
      ) : null}
    </span>
  )
}

export function ConnectorMark({
  connector,
  size,
  className,
}: {
  connector: Connector
  size?: ChannelMarkProps["size"]
  className?: string
}) {
  return (
    <ChannelMark
      type={connector.type}
      picture={connectorPicture(connector)}
      size={size}
      className={className}
    />
  )
}
