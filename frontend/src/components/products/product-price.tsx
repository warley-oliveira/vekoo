import { useTranslation } from "react-i18next"

import { Money } from "@/components/shared"
import { itemPrice, type PriceKeys } from "@/lib/products/pricing"
import type { ProductItem } from "@/lib/products/types"
import { cn } from "@/lib/utils"

type ProductPriceProps = {
  item: Pick<ProductItem, "customFields">
  priceKeys: PriceKeys
  className?: string
}

/** O preço que vale e, em promoção, o de antes riscado. Sem preço, não desenha nada. */
export function ProductPrice({ item, priceKeys, className }: ProductPriceProps) {
  const { t } = useTranslation()
  const price = itemPrice(item, priceKeys)

  if (!price) return null

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <Money value={price.current} className="font-medium" />
      {price.previous !== null ? (
        <span className="text-xs text-muted-foreground line-through">
          <span className="sr-only">{t("products.list.previousPrice")}</span>
          <Money value={price.previous} />
        </span>
      ) : null}
    </span>
  )
}
