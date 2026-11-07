import { memo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, Globe, MapPin, Phone, Star, Store } from "lucide-react"

import { CopyButton, KeyValueList, type KeyValueItem } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { Place, PlaceContact } from "@/lib/campaigns/types"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** A foto do Google vem em tamanho cheio: pede só o que o quadradinho precisa. */
function smallPhoto(url: string): string {
  if (!url.includes("googleusercontent.com")) return url
  const size = Math.round(56 * (window.devicePixelRatio || 2))
  return url.replace(/=w\d+[^&\s]*/, `=s${size}-c`).replace(/=s\d+[^&\s]*/, `=s${size}-c`)
}

function PlacePhoto({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false)

  return (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground",
        className
      )}
    >
      {src && !failed ? (
        <img
          src={smallPhoto(src)}
          alt=""
          loading="lazy"
          decoding="async"
          // O Google limita quem pede foto em rajada; sem o `Referer`, a chance é menor.
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Store aria-hidden className="size-5" />
      )}
    </span>
  )
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href.startsWith("http") ? href : `https://${href}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded text-foreground underline underline-offset-2 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </a>
  )
}

const stripProtocol = (value: string) => value.replace(/^https?:\/\//, "").replace(/\/$/, "")

type PlaceCardProps = {
  place: Place | PlaceContact
  className?: string
}

/** Um estabelecimento encontrado: o que importa para disparar à mostra, o resto ao abrir. */
export const PlaceCard = memo(function PlaceCard({ place, className }: PlaceCardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const [open, setOpen] = useState(false)

  const details: KeyValueItem[] = [
    ...(place.street && place.street !== place.address
      ? [{ label: t("campaigns.places.fields.street"), value: place.street }]
      : []),
    ...(place.neighborhood ? [{ label: t("campaigns.places.fields.neighborhood"), value: place.neighborhood }] : []),
    ...(place.city || place.state
      ? [
          {
            label: t("campaigns.places.fields.cityState"),
            value: [place.city, place.state].filter(Boolean).join(", "),
          },
        ]
      : []),
    ...(place.postalCode ? [{ label: t("campaigns.places.fields.postalCode"), value: place.postalCode }] : []),
    ...(place.instagram
      ? [
          {
            label: t("campaigns.places.fields.instagram"),
            value: place.instagram.startsWith("http") ? (
              <ExternalLink href={place.instagram}>{stripProtocol(place.instagram)}</ExternalLink>
            ) : (
              place.instagram
            ),
          },
        ]
      : []),
    ...(place.facebook
      ? [
          {
            label: t("campaigns.places.fields.facebook"),
            value: place.facebook.startsWith("http") ? (
              <ExternalLink href={place.facebook}>{stripProtocol(place.facebook)}</ExternalLink>
            ) : (
              place.facebook
            ),
          },
        ]
      : []),
  ]

  const source = "extractionQuery" in place ? place : null
  const hasMore =
    details.length > 0 ||
    place.categories.length > 0 ||
    place.openingHours.length > 0 ||
    Boolean(place.url) ||
    Boolean(source)

  return (
    <article className={cn("flex flex-col rounded-xl bg-card ring-1 ring-foreground/10", className)}>
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3 p-3">
          <div className="flex min-w-0 gap-3">
            <PlacePhoto src={place.imageUrl} />
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm leading-snug font-medium wrap-anywhere">{place.title}</h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {place.categoryName ? <span>{place.categoryName}</span> : null}
                {place.totalScore > 0 ? (
                  <span className="inline-flex items-center gap-0.5 tabular-nums">
                    <Star aria-hidden className="size-3 fill-current" />
                    <span className="sr-only">{t("campaigns.places.fields.score")}</span>
                    {formatNumber(place.totalScore, language, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    <span>
                      {t("campaigns.places.reviews", {
                        count: place.reviewsCount,
                        formatted: formatNumber(place.reviewsCount, language),
                      })}
                    </span>
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <ul className="flex min-w-0 flex-col gap-1 text-sm text-muted-foreground">
            <li className="flex min-w-0 items-center gap-2">
              <Phone aria-hidden className="size-3.5 shrink-0" />
              {place.phone ? (
                <>
                  <span className="truncate text-foreground tabular-nums">{place.phone}</span>
                  <CopyButton value={place.phoneUnformatted || place.phone} size="icon-xs" className="-my-1 shrink-0" />
                </>
              ) : (
                <span>{t("kit.noValue")}</span>
              )}
            </li>
            {place.address ? (
              <li className="flex min-w-0 items-start gap-2">
                <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span className="line-clamp-2 text-pretty">{place.address}</span>
              </li>
            ) : null}
            {place.website ? (
              <li className="flex min-w-0 items-center gap-2">
                <Globe aria-hidden className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">
                  <ExternalLink href={place.website}>{stripProtocol(place.website)}</ExternalLink>
                </span>
              </li>
            ) : null}
          </ul>
        </div>

        {hasMore ? (
          <>
            <CollapsibleContent className="border-t px-3 py-3">
              <div className="flex flex-col gap-3 text-sm">
                {details.length > 0 ? <KeyValueList items={details} /> : null}

                {place.categories.length > 0 ? (
                  <div className="space-y-1">
                    <h4 className="text-muted-foreground">{t("campaigns.places.fields.categories")}</h4>
                    <p className="text-pretty">{place.categories.join(", ")}</p>
                  </div>
                ) : null}

                {place.openingHours.length > 0 ? (
                  <div className="space-y-1">
                    <h4 className="text-muted-foreground">{t("campaigns.places.fields.hours")}</h4>
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                      {place.openingHours.map((entry) => (
                        <div key={entry.day} className="contents">
                          <dt className="capitalize">{entry.day}</dt>
                          <dd className="text-muted-foreground tabular-nums">{entry.hours}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                {source ? (
                  <p className="text-xs text-muted-foreground">
                    {source.extractionLocation
                      ? t("campaigns.places.fromSearchIn", {
                          query: source.extractionQuery,
                          location: source.extractionLocation,
                        })
                      : t("campaigns.places.fromSearch", { query: source.extractionQuery })}
                  </p>
                ) : null}

                {place.url ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    className="self-start pointer-coarse:h-10"
                    render={<a href={place.url} target="_blank" rel="noopener noreferrer" />}
                  >
                    <MapPin />
                    {t("campaigns.places.viewOnMap")}
                  </Button>
                ) : null}
              </div>
            </CollapsibleContent>

            <div className="border-t p-1">
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground pointer-coarse:h-10"
                  />
                }
              >
                {t(open ? "campaigns.places.showLess" : "campaigns.places.showMore")}
                <ChevronDown
                  aria-hidden
                  className={cn("transition-transform duration-200", open && "rotate-180")}
                />
              </CollapsibleTrigger>
            </div>
          </>
        ) : null}
      </Collapsible>
    </article>
  )
})
