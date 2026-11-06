import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ExternalLink, Globe, ImageOff, Megaphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InstagramGlyph, MessengerGlyph } from "@/components/connectors/channel-glyphs"
import type { ChatMessage } from "@/lib/chat/types"

function httpUrl(url: unknown): string | undefined {
  return typeof url === "string" && /^https?:\/\//.test(url) ? url : undefined
}

function AdSourceIcon({ source }: { source: string | null | undefined }) {
  if (source === "instagram") return <InstagramGlyph className="size-3.5" />
  if (source === "facebook") return <MessengerGlyph className="size-3.5" />
  return <Megaphone aria-hidden className="size-3.5" />
}

/** A saudação automática de quem veio de um anúncio, com de onde veio e os detalhes do anúncio. */
export const AdGreeting = memo(function AdGreeting({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(false)

  const ad = message.externalAdReply ?? {}
  const source = ad.sourceApp
  const label =
    source === "instagram" || source === "facebook"
      ? t(`chat.ad.source.${source}`)
      : t("chat.ad.source.other")
  const image = httpUrl(ad.originalImageUrl) ?? httpUrl(ad.thumbnailUrl) ?? httpUrl(ad.mediaUrl)
  const link = httpUrl(ad.sourceUrl) ?? httpUrl(ad.mediaUrl)
  const greeting = ad.greetingMessageBody ?? message.content ?? ""
  const hasDetails = Boolean(ad.title || ad.body || link)

  return (
    <div className="flex justify-end px-3 pt-3 md:px-5" data-message-id={message.id}>
      <div className="flex w-[min(22rem,82%)] flex-col gap-2 rounded-2xl bg-accent p-2 text-sm">
        <div className="flex items-center gap-2 rounded-xl bg-foreground/[0.04] p-1.5">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.06] text-muted-foreground">
            {image && !broken ? (
              <img
                src={image}
                alt={ad.title ?? label}
                loading="lazy"
                onError={() => setBroken(true)}
                className="size-full object-cover"
              />
            ) : (
              <ImageOff aria-hidden className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-xs font-medium">
              <AdSourceIcon source={source} />
              {label}
            </p>
            {hasDetails ? (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto p-0 text-muted-foreground"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? t("chat.ad.hideDetails") : t("chat.ad.showDetails")}
              </Button>
            ) : null}
          </div>
        </div>

        {open ? (
          <div className="flex flex-col gap-1 px-1 text-xs">
            {ad.title ? <p className="font-medium">{ad.title}</p> : null}
            {ad.body ? <p className="whitespace-pre-line text-muted-foreground">{ad.body}</p> : null}
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                {t("chat.ad.open")}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {greeting ? <p className="px-1 leading-5 whitespace-pre-line">{greeting}</p> : null}
        <p className="px-1 text-xs text-muted-foreground italic">{t("chat.ad.greeting")}</p>
      </div>
    </div>
  )
})

type WidgetProduct = {
  name?: string | null
  price?: string | number | null
  currency?: string | null
  sku?: string | null
  url?: string | null
  image_url?: string | null
  imageUrl?: string | null
}

type WidgetVisitor = {
  name?: string | null
  email?: string | null
  phone?: string | null
  verified?: boolean | null
}

type WidgetEvent = { name?: string | null; props?: Record<string, unknown> | null }

const KNOWN_SECTIONS = new Set(["page", "product", "visitor", "events"])

/**
 * O que o site contou sobre a página em que o visitante está: página, produto, quem é e eventos.
 * Seção que a tela não conhece aparece como chave e valor, porque o formato evolui sem depender
 * de nova versão aqui.
 */
export const WidgetContext = memo(function WidgetContext({ message }: { message: ChatMessage }) {
  const { t } = useTranslation()
  const context = (message.contextMessage ?? {}) as Record<string, unknown>

  const page = context.page as { title?: string | null; url?: string | null } | undefined
  const product = context.product as WidgetProduct | undefined
  const visitor = context.visitor as WidgetVisitor | undefined
  const events = Array.isArray(context.events)
    ? (context.events as WidgetEvent[]).filter((event) => event?.name)
    : []
  const others = Object.entries(context).filter(
    ([key, value]) => !KNOWN_SECTIONS.has(key) && value !== null && value !== ""
  )

  const pageUrl = httpUrl(page?.url)
  const visitorText = [visitor?.name, visitor?.email, visitor?.phone].filter(Boolean).join(" · ")
  const productImage = httpUrl(product?.imageUrl ?? product?.image_url)
  const productLink = httpUrl(product?.url)
  const price = [product?.currency, product?.price].filter(Boolean).join(" ")

  if (!product && !page?.title && !pageUrl && !visitorText && events.length === 0 && others.length === 0) {
    return null
  }

  return (
    <div className="flex justify-center px-4 pt-3" data-message-id={message.id}>
      <div className="flex w-full max-w-md flex-col gap-1.5 rounded-xl border border-dashed px-3 py-2 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Globe aria-hidden className="size-3.5" />
          {t("chat.widget.title")}
        </p>

        {product ? (
          <div className="flex items-center gap-2">
            {productImage ? (
              <img
                src={productImage}
                alt=""
                loading="lazy"
                className="size-11 shrink-0 rounded-lg object-cover"
              />
            ) : null}
            <div className="min-w-0">
              {product.name ? <p className="truncate font-medium">{product.name}</p> : null}
              {price ? <p className="font-medium text-foreground">{price}</p> : null}
              <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                {product.sku ? <span>{t("chat.widget.sku", { sku: product.sku })}</span> : null}
                {productLink ? (
                  <a
                    href={productLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                  >
                    {t("chat.widget.viewProduct")}
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}

        {page?.title || pageUrl ? (
          <p className="truncate text-muted-foreground">
            {pageUrl ? (
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                {page?.title ?? pageUrl}
              </a>
            ) : (
              page?.title
            )}
          </p>
        ) : null}

        {visitorText ? (
          <p className="text-muted-foreground">
            {visitorText}
            {" · "}
            {visitor?.verified ? t("chat.widget.verified") : t("chat.widget.notVerified")}
          </p>
        ) : null}

        {events.length > 0 ? (
          <p className="text-muted-foreground">
            {t("chat.widget.events", { events: events.map((event) => event.name).join(", ") })}
          </p>
        ) : null}

        {others.map(([key, value]) => (
          <p key={key} className="truncate text-muted-foreground">
            {key}: {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </p>
        ))}
      </div>
    </div>
  )
})
