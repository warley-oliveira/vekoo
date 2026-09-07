import { useCallback } from "react"
import { useSWRConfig } from "swr"

import {
  carouselKey,
  isCarouselKey,
  toSummary,
} from "@/hooks/use-carousels"
import { apiDelete, apiPatch, apiPost } from "@/lib/api"
import type {
  CarouselCard,
  CarouselFormat,
  CarouselTheme,
} from "@/lib/doc"
import type { Carousel, CarouselSummary } from "@/lib/types"

// As mutações de carrossel, num hook só.
//
// Não é preguiça de separar: toda mutação precisa alcançar **mais de uma**
// chave do SWR — a lista da biblioteca, a da pasta, a da lixeira e o documento
// aberto são chaves diferentes, e mandar um carrossel para a lixeira mexe em
// duas ao mesmo tempo. O `mutate` global com casador de prefixo é o que permite
// isso sem enumerar chave por chave.

type ListData = { carousels: CarouselSummary[] } | undefined

/** Campos que o editor e os menus alteram. */
export type CarouselPatch = {
  title?: string
  caption?: string
  favorite?: boolean
  folderId?: string | null
  format?: CarouselFormat
  theme?: CarouselTheme
  cards?: CarouselCard[]
}

export type CreateCarouselInput = {
  title: string
  format: CarouselFormat
  theme: CarouselTheme
  cards: CarouselCard[]
  folderId?: string | null
}

export function useCarouselMutations() {
  const { mutate } = useSWRConfig()

  /** Remenda todas as listas de carrossel em cache de uma vez. */
  const patchLists = useCallback(
    (fn: (list: CarouselSummary[]) => CarouselSummary[], revalidate = false) =>
      mutate(
        isCarouselKey,
        (current: ListData) =>
          // Só as coleções têm `carousels`; a chave do documento passa reto.
          current && Array.isArray(current.carousels)
            ? { carousels: fn(current.carousels) }
            : current,
        { revalidate }
      ),
    [mutate]
  )

  /** Troca um carrossel dentro das listas, onde quer que ele esteja. */
  const patchOne = useCallback(
    (id: string, patch: Partial<CarouselSummary>) =>
      patchLists((list) =>
        list.map((c) => (c.id === id ? { ...c, ...patch } : c))
      ),
    [patchLists]
  )

  const removeFromLists = useCallback(
    (id: string) => patchLists((list) => list.filter((c) => c.id !== id)),
    [patchLists]
  )

  /** Depois de uma falha, a verdade é do servidor. */
  const resync = useCallback(() => mutate(isCarouselKey), [mutate])

  const update = useCallback(
    async (id: string, patch: CarouselPatch): Promise<Carousel> => {
      const saved = await apiPatch<Carousel>(carouselKey(id)!, { carousel: patch })
      await mutate(carouselKey(id), saved, { revalidate: false })
      await patchOne(id, toSummary(saved))
      return saved
    },
    [mutate, patchOne]
  )

  /** Otimista: o título aparece na hora e volta atrás se o servidor recusar. */
  const rename = useCallback(
    async (id: string, title: string) => {
      await patchOne(id, { title })
      try {
        await update(id, { title })
      } catch (error) {
        await resync()
        throw error
      }
    },
    [patchOne, resync, update]
  )

  const toggleFavorite = useCallback(
    async (carousel: CarouselSummary) => {
      const favorite = !carousel.favorite
      await patchOne(carousel.id, { favorite })
      try {
        await update(carousel.id, { favorite })
      } catch (error) {
        await resync()
        throw error
      }
    },
    [patchOne, resync, update]
  )

  /**
   * Mover de pasta muda de qual lista o carrossel faz parte, então não dá para
   * remendar em memória: as duas listas envolvidas precisam voltar do servidor.
   */
  const move = useCallback(
    async (id: string, folderId: string | null) => {
      try {
        await apiPatch<Carousel>(carouselKey(id)!, { carousel: { folderId } })
      } finally {
        await resync()
        // A contagem por pasta é do servidor.
        await mutate("/folders")
      }
    },
    [mutate, resync]
  )

  const setCaption = useCallback(
    (id: string, caption: string) => update(id, { caption }),
    [update]
  )

  const create = useCallback(
    async (input: CreateCarouselInput): Promise<Carousel> => {
      const created = await apiPost<Carousel>("/carousels", { carousel: input })
      await resync()
      await mutate("/folders")
      return created
    },
    [mutate, resync]
  )

  /**
   * Duplicar insere a cópia logo depois do original, como fazia o mock — é o
   * que faz a cópia aparecer ao lado, em vez de sumir para outro canto da
   * lista. Na próxima revalidação o servidor a joga para o topo (ela é a mais
   * recente), e tudo bem: o que importava era não perdê-la de vista agora.
   */
  const duplicate = useCallback(
    async (id: string): Promise<Carousel> => {
      const copy = await apiPost<Carousel>(`/carousels/${id}/duplicate`)
      const summary = toSummary(copy)
      await patchLists((list) => {
        const index = list.findIndex((c) => c.id === id)
        if (index < 0) return [summary, ...list]
        const next = [...list]
        next.splice(index + 1, 0, summary)
        return next
      })
      return copy
    },
    [patchLists]
  )

  /** Apagar é mandar para a lixeira — nada some sem passar por lá. */
  const trash = useCallback(
    async (id: string) => {
      await removeFromLists(id)
      try {
        await apiDelete(carouselKey(id)!)
      } finally {
        // A lixeira ganhou um item; a lista ativa perdeu.
        await resync()
      }
    },
    [removeFromLists, resync]
  )

  const restore = useCallback(
    async (id: string) => {
      await removeFromLists(id)
      try {
        await apiPost(`/carousels/${id}/restore`)
      } finally {
        await resync()
      }
    },
    [removeFromLists, resync]
  )

  const deleteForever = useCallback(
    async (id: string) => {
      await removeFromLists(id)
      try {
        await apiDelete(`/carousels/${id}/permanent`)
      } catch (error) {
        await resync()
        throw error
      }
    },
    [removeFromLists, resync]
  )

  const emptyTrash = useCallback(async () => {
    try {
      await apiDelete<{ deleted: number }>("/trash")
    } finally {
      await resync()
    }
  }, [resync])

  return {
    create,
    update,
    rename,
    toggleFavorite,
    move,
    setCaption,
    duplicate,
    trash,
    restore,
    deleteForever,
    emptyTrash,
  }
}
