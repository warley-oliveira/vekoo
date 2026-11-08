import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "@/lib/router"
import { Search } from "lucide-react"

import {
  ErrorState,
  ListSkeleton,
  ResponsiveDialog,
  StatusBadge,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApi } from "@/hooks/use-api"
import { displaySku } from "@/lib/products/item-form"
import type { PriceKeys } from "@/lib/products/pricing"
import type { ProductSearchResponse, SearchStrategy } from "@/lib/products/types"
import { ProductPrice } from "./product-price"
import { ProductThumb } from "./product-thumb"

/** A busca semântica não participou: é o que explica "por que não achou". */
const NO_MEANING: readonly SearchStrategy[] = ["lexical", "text"]

type SearchTestPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O que a pessoa estava buscando na grade: já chega testado. */
  initialQuery?: string
  priceKeys: PriceKeys
}

/**
 * Sucessor do teste de busca da assistente. A assistente saiu, mas a pergunta continua: é
 * a mesma busca que um bloco de fluxo usa (`Products::SearchService`), e a grade não mostra
 * isso, porque filtra por palavra e não ranqueia. Diz o que seria encontrado, em que ordem,
 * e de que jeito.
 */
export function SearchTestPanel({
  open,
  onOpenChange,
  initialQuery = "",
  priceKeys,
}: SearchTestPanelProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)

  useEffect(() => {
    if (open) {
      setText(initialQuery)
      setQuery(initialQuery)
    }
  }, [initialQuery, open])

  const { data, error, isLoading, mutate } = useApi<ProductSearchResponse>(
    open && query ? `/products/search?q=${encodeURIComponent(query)}` : null,
    { keepPreviousData: false, revalidateOnFocus: false }
  )

  function submit(event: FormEvent) {
    event.preventDefault()
    setQuery(text.trim())
  }

  const strategy = data?.meta.strategy
  const items = data?.items ?? []

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("products.searchTest.title")}
      description={t("products.searchTest.description")}
    >
      <div className="flex flex-col gap-4">
        <form onSubmit={submit} className="flex items-center gap-2">
          <Input
            autoFocus
            value={text}
            enterKeyHint="search"
            aria-label={t("products.searchTest.label")}
            placeholder={t("products.searchTest.placeholder")}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" disabled={!text.trim()} className="pointer-coarse:h-10">
            <Search />
            {t("products.searchTest.run")}
          </Button>
        </form>

        {!query ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {t("products.searchTest.idle")}
          </p>
        ) : error ? (
          <ErrorState error={error} onRetry={() => void mutate()} />
        ) : isLoading || !data ? (
          <ListSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-3" role="status">
            <div className="flex flex-wrap items-center gap-2">
              {strategy ? (
                <StatusBadge tone="neutral" dot={false}>
                  {t(`products.searchTest.strategy.${strategy}`)}
                </StatusBadge>
              ) : null}
              {data.meta.total > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("products.searchTest.count", { count: data.meta.total })}
                  {data.meta.total > items.length
                    ? ` · ${t("products.searchTest.limited", { shown: items.length })}`
                    : null}
                </span>
              ) : null}
            </div>

            {strategy && NO_MEANING.includes(strategy) ? (
              <p className="text-xs text-pretty text-muted-foreground">
                {t("products.searchTest.noMeaningHint")}
              </p>
            ) : null}

            {items.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-pretty text-muted-foreground">
                {t("products.searchTest.noResults")}
              </p>
            ) : (
              <ol className="flex flex-col divide-y">
                {items.map((item, index) => {
                  const sku = displaySku(item.externalId)
                  return (
                    <li key={item.id}>
                      <Link
                        to={`/catalog/${item.id}`}
                        className="flex items-center gap-3 rounded-md py-2 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <span className="size-10 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/5">
                          <ProductThumb image={item.images[0]} alt={item.title} iconClassName="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          {sku ? (
                            <span className="block truncate text-xs text-muted-foreground">{sku}</span>
                          ) : null}
                        </span>
                        <ProductPrice item={item} priceKeys={priceKeys} className="text-sm" />
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
            <p className="text-xs text-muted-foreground">{t("products.searchTest.inactiveNote")}</p>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  )
}
