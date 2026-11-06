import { useState, type CSSProperties, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Virtuoso, type Components } from "react-virtuoso"
import { Loader2 } from "lucide-react"

import { EmptyState, type EmptyStateProps } from "@/components/empty-state"
import { ErrorState, InlineError } from "@/components/error-state"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ListSkeleton } from "./list-skeleton"

/**
 * O Virtuoso exige que o índice do primeiro item diminua quando itens entram no topo,
 * e isso é o que mantém a posição na tela ao carregar mensagens antigas. Começa alto
 * para ter como descer.
 */
const FIRST_INDEX_START = 1_000_000

export type InfiniteListProps<T> = {
  items: T[]
  getItemKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  /** Há mais para trazer: no fim da lista, ou no topo com `reverse`. */
  hasMore?: boolean
  /** Primeira carga: mostra o esqueleto. */
  loading?: boolean
  /** Buscando a próxima página. */
  loadingMore?: boolean
  /** Chegou na sentinela. Chamado uma vez por vez, enquanto `hasMore`. */
  onLoadMore?: () => void
  error?: unknown
  onRetry?: () => void
  /** Conteúdo do estado vazio. */
  empty?: EmptyStateProps
  /** No lugar do esqueleto padrão, para espelhar o layout real. */
  skeleton?: ReactNode
  /** Texto no fim da lista. `false` esconde. */
  endLabel?: ReactNode | false
  /**
   * Conversa: começa no fim, itens antigos carregam no topo sem mexer na posição, e
   * o que chega embaixo só rola a tela se a pessoa já estava no fim.
   */
  reverse?: boolean
  /** Rola a página em vez da própria lista: o elemento rolável que a contém. */
  scrollParent?: HTMLElement | null
  "aria-label"?: string
  className?: string
  style?: CSSProperties
}

type SlotContext = { header: ReactNode; footer: ReactNode }

// Fora do componente: um objeto novo a cada render remontaria a lista inteira.
const SLOTS: Components<unknown, SlotContext> = {
  Header: ({ context }) => <>{context?.header}</>,
  Footer: ({ context }) => <>{context?.footer}</>,
}

/**
 * Lista longa virtualizada: só o que está na tela existe no DOM. Precisa de altura
 * definida no pai (`h-full` num contêiner com altura) ou de `scrollParent`.
 */
export function InfiniteList<T>({
  items,
  getItemKey,
  renderItem,
  hasMore = false,
  loading = false,
  loadingMore = false,
  onLoadMore,
  error,
  onRetry,
  empty,
  skeleton,
  endLabel,
  reverse = false,
  scrollParent,
  "aria-label": ariaLabel,
  className,
  style,
}: InfiniteListProps<T>) {
  const { t } = useTranslation()

  // Itens novos no topo baixam o índice na mesma quantidade.
  const firstKey = items.length > 0 ? getItemKey(items[0]) : null
  const [anchor, setAnchor] = useState({ key: firstKey, index: FIRST_INDEX_START })
  if (firstKey !== anchor.key) {
    const moved = anchor.key === null
      ? -1
      : items.findIndex((item) => getItemKey(item) === anchor.key)
    setAnchor({
      key: firstKey,
      index: moved > 0 ? anchor.index - moved : FIRST_INDEX_START,
    })
  }

  if (loading && items.length === 0) {
    return (
      <div className={cn("overflow-hidden", className)} style={style}>
        {skeleton ?? <ListSkeleton />}
      </div>
    )
  }

  if (items.length === 0) {
    if (error) {
      return <ErrorState error={error} onRetry={onRetry} className={className} />
    }
    return (
      <EmptyState
        title={t("kit.list.emptyTitle")}
        {...empty}
        className={cn(className, empty?.className)}
      />
    )
  }

  const loadMore = () => {
    if (hasMore && !loadingMore && !error) onLoadMore?.()
  }

  const edge = (
    <div className="flex justify-center py-3">
      {error ? (
        <InlineError onRetry={onRetry} />
      ) : loadingMore ? (
        <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          {t("kit.loading")}
        </span>
      ) : hasMore ? (
        // A sentinela carrega sozinha; o botão é o caminho de quem navega por teclado.
        <Button type="button" variant="ghost" size="sm" onClick={onLoadMore}>
          {t("kit.list.loadMore")}
        </Button>
      ) : endLabel !== false ? (
        <span className="text-xs text-muted-foreground">
          {endLabel ?? t("kit.list.end")}
        </span>
      ) : null}
    </div>
  )

  return (
    <Virtuoso<T, SlotContext>
      aria-label={ariaLabel}
      className={className}
      style={scrollParent ? style : { height: "100%", minHeight: "16rem", ...style }}
      customScrollParent={scrollParent ?? undefined}
      data={items}
      context={reverse ? { header: edge, footer: null } : { header: null, footer: edge }}
      components={SLOTS as Components<T, SlotContext>}
      computeItemKey={(_, item) => getItemKey(item)}
      itemContent={(index, item) =>
        renderItem(item, reverse ? index - anchor.index : index)
      }
      increaseViewportBy={200}
      endReached={reverse ? undefined : loadMore}
      {...(reverse
        ? {
            firstItemIndex: anchor.index,
            initialTopMostItemIndex: items.length - 1,
            startReached: loadMore,
            alignToBottom: true,
            followOutput: (atBottom: boolean) => (atBottom ? "smooth" : false),
          }
        : {})}
    />
  )
}
