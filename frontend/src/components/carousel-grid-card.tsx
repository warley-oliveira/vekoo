import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { useTranslation } from "react-i18next"
import { MoreHorizontal, Star } from "lucide-react"

import { CAROUSEL_DRAG_TYPE } from "@/components/app-sidebar"
import { CarouselActionsMenu } from "@/components/carousel-actions"
import { CardArt } from "@/components/editor/card-art"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"
import type { Carousel } from "@/lib/mock-data"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

type CarouselGridCardProps = {
  carousel: Carousel
  /** Vindo da busca: rola até o card e dá um flash no anel. */
  highlighted?: boolean
}

export function CarouselGridCard({
  carousel,
  highlighted = false,
}: CarouselGridCardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { dispatch } = useStore()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }, [highlighted])

  function openEditor() {
    navigate(`/carousels/${carousel.id}/edit`)
  }

  return (
    <div
      ref={ref}
      className={cn(
        "group/card relative outline-none",
        highlighted && "animate-pulse [animation-iteration-count:2]"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(CAROUSEL_DRAG_TYPE, carousel.id)
        e.dataTransfer.effectAllowed = "move"
      }}
    >
      <button
        type="button"
        onClick={openEditor}
        aria-label={t("carousels.openAria", { title: carousel.title })}
        className={cn(
          "block w-full cursor-pointer outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          highlighted && "ring-3 ring-ring/60 ring-offset-2 ring-offset-background"
        )}
      >
        <CardArt
          card={carousel.cards[0]}
          theme={carousel.theme}
          format={carousel.format}
          className="transition-transform duration-200 group-hover/card:scale-[1.015]"
        />
      </button>

      {/* Estrela e menu — aparecem no hover/focus; a estrela fica se favoritado */}
      <div
        className={cn(
          "absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity duration-150",
          "group-hover/card:opacity-100 group-focus-within/card:opacity-100",
          carousel.favorite && "opacity-100"
        )}
      >
        <Button
          variant="secondary"
          size="icon-sm"
          className="bg-background/85 shadow-sm backdrop-blur-sm hover:bg-background"
          aria-label={
            carousel.favorite
              ? t("carousels.favoriteRemove")
              : t("carousels.favoriteAdd")
          }
          aria-pressed={carousel.favorite}
          onClick={() =>
            dispatch({ type: "carousel/toggle-favorite", id: carousel.id })
          }
        >
          <Star
            className={cn(
              carousel.favorite && "fill-amber-400 stroke-amber-400"
            )}
          />
        </Button>
        <span
          className={cn(
            carousel.favorite &&
              "opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
          )}
        >
          <CarouselActionsMenu
            carousel={carousel}
            trigger={
              <Button
                variant="secondary"
                size="icon-sm"
                className="bg-background/85 shadow-sm backdrop-blur-sm hover:bg-background"
                aria-label={t("carousels.actionsAria", { title: carousel.title })}
              >
                <MoreHorizontal />
              </Button>
            }
          />
        </span>
      </div>

      <div className="mt-2.5 space-y-0.5">
        <h3 className="truncate text-sm font-medium">{carousel.title}</h3>
        <p className="text-xs text-muted-foreground">
          {t("carousels.cardCount", { count: carousel.cards.length })} ·{" "}
          {carousel.format} ·{" "}
          {t("carousels.editedAt", {
            when: formatRelative(carousel.editedAt, language),
          })}
        </p>
      </div>
    </div>
  )
}
