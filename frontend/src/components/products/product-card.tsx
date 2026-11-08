import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Images } from "lucide-react"

import { ActionsMenu, StatusBadge, type RowAction } from "@/components/shared"
import { Checkbox } from "@/components/ui/checkbox"
import { useLongPress } from "@/hooks/use-long-press"
import { useIsTouch } from "@/hooks/use-media-query"
import { formatNumber } from "@/lib/format-number"
import { useLanguage } from "@/lib/i18n"
import { displaySku } from "@/lib/products/item-form"
import type { PriceKeys } from "@/lib/products/pricing"
import type { ProductItem } from "@/lib/products/types"
import { cn } from "@/lib/utils"
import { ProductPrice } from "./product-price"
import { ProductThumb } from "./product-thumb"

type ProductCardProps = {
  item: ProductItem
  priceKeys: PriceKeys
  actions: RowAction[]
  selected: boolean
  /** Há algo selecionado: tocar passa a marcar, e não a abrir. */
  selecting: boolean
  onToggleSelect: (item: ProductItem) => void
  /** Vai junto da navegação, para o item saber voltar à grade com os mesmos filtros. */
  linkState?: unknown
}

/**
 * Um item na grade. A foto manda, como numa vitrine: o lojista reconhece o produto pela
 * imagem, e o resto (preço, resumo, código) vem em ordem de importância.
 */
export function ProductCard({
  item,
  priceKeys,
  actions,
  selected,
  selecting,
  onToggleSelect,
  linkState,
}: ProductCardProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const isTouch = useIsTouch()
  const { handlers, didFire } = useLongPress(() => onToggleSelect(item))

  const sku = displaySku(item.externalId)
  const details = sku ? [sku, ...item.tags] : item.tags

  return (
    <article className="group/card relative flex h-full flex-col">
      <Link
        to={`/catalog/${item.id}`}
        state={linkState}
        {...(isTouch ? handlers : {})}
        onClick={(event) => {
          if (didFire()) {
            event.preventDefault()
          } else if (selecting) {
            event.preventDefault()
            onToggleSelect(item)
          }
        }}
        className="flex flex-1 flex-col gap-2.5 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className={cn(
            "relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5 transition-shadow",
            selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
        >
          <ProductThumb
            image={item.images[0]}
            alt={item.title}
            iconClassName="size-8"
            className={cn(
              "transition-[transform,opacity] duration-200 motion-safe:group-hover/card:scale-[1.02]",
              !item.active && "opacity-50"
            )}
          />
          {!item.active ? (
            <StatusBadge
              tone="neutral"
              className="absolute bottom-2 left-2 bg-background/90 text-foreground shadow-xs"
            >
              {t("products.status.inactive")}
            </StatusBadge>
          ) : null}
          {item.images.length > 1 ? (
            <span className="absolute right-2 bottom-2 inline-flex h-5 items-center gap-1 rounded-full bg-background/90 px-1.5 text-xs font-medium tabular-nums shadow-xs">
              <Images aria-hidden className="size-3" />
              <span className="sr-only">
                {t("products.list.photos", {
                  count: item.images.length,
                  formatted: formatNumber(item.images.length, language),
                })}
              </span>
              <span aria-hidden>{formatNumber(item.images.length, language)}</span>
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1 px-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</h3>
          <ProductPrice item={item} priceKeys={priceKeys} className="text-sm" />
          {item.summary ? (
            <p className="line-clamp-2 hidden text-xs text-muted-foreground md:block">
              {item.summary}
            </p>
          ) : null}
          {/* Código e tags em uma linha de texto: chips quebravam linha e deixavam cada card
              de um tamanho. Quem precisa comparar tem a lista. */}
          {details.length > 0 ? (
            <p className="hidden truncate text-xs text-muted-foreground/80 md:block">
              {details.join(" · ")}
            </p>
          ) : null}
        </div>
      </Link>

      {/* Fora do link: dentro dele, clicar aqui também abriria o item. No toque, selecionar
          começa por pressionar e segurar ou pelo menu: uma caixa em cada foto pesaria. */}
      <div
        className={cn(
          "absolute top-2 left-2 flex size-6 items-center justify-center rounded-md bg-background/90 opacity-0 shadow-xs transition-opacity group-hover/card:opacity-100 focus-within:opacity-100 pointer-coarse:hidden",
          (selecting || selected) && "opacity-100 pointer-coarse:flex"
        )}
      >
        <Checkbox
          checked={selected}
          aria-label={t("products.list.selectItem", { title: item.title })}
          onCheckedChange={() => onToggleSelect(item)}
        />
      </div>

      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 pointer-coarse:opacity-100">
        <ActionsMenu
          actions={actions}
          label={t("products.list.actionsOf", { title: item.title })}
          className="bg-background/90 text-foreground shadow-xs hover:bg-background"
        />
      </div>
    </article>
  )
}
