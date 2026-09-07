import { useApi } from "@/hooks/use-api"
import type { Carousel, CarouselSummary } from "@/lib/types"

// Leitura dos carrosséis.
//
// Só `folder_id` e `trashed` entram na chave. Favorito, a aba "recentes" e a
// ordenação ficam no cliente: a lista de uma organização cabe na memória, trocar
// de aba fica instantâneo, e cada chave a menos é uma lista a menos para
// remendar em cada atualização otimista.

export type CarouselFilters = {
  folderId?: string | null
  trashed?: boolean
}

export function carouselsKey(filters: CarouselFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.trashed) params.set("trashed", "true")
  if (filters.folderId) params.set("folder_id", filters.folderId)
  const query = params.toString()
  return `/carousels${query ? `?${query}` : ""}`
}

export function carouselKey(id: string | null | undefined): string | null {
  return id ? `/carousels/${id}` : null
}

/** Uma chave de carrossel? Serve para invalidar a família inteira de uma vez. */
export function isCarouselKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith("/carousels")
}

type ListResponse = { carousels: CarouselSummary[] }

export function useCarousels(filters: CarouselFilters = {}) {
  const { data, error, isLoading, mutate } = useApi<ListResponse>(
    carouselsKey(filters)
  )

  return {
    carousels: data?.carousels,
    isLoading,
    error,
    reload: () => mutate(),
  }
}

/** O documento inteiro — é isto que o editor abre. */
export function useCarousel(id: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<Carousel>(carouselKey(id))

  return { carousel: data, isLoading, error, reload: () => mutate() }
}

/** O resumo que a grade desenha, a partir do documento completo. */
export function toSummary(carousel: Carousel): CarouselSummary {
  return {
    ...carousel,
    cards: carousel.cards.slice(0, 1),
    cardCount: carousel.cards.length,
  }
}
