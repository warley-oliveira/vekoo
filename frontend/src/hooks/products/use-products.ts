import { useCallback } from "react"
import { useSWRConfig, type Arguments } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api"
import { positionChanges, runPool, withPositions } from "@/lib/products/reorder"
import type {
  ProductCategory,
  ProductField,
  ProductImage,
  ProductItem,
  ProductItemDetail,
  ProductItemsResponse,
} from "@/lib/products/types"

// As leituras e mutações do catálogo. Uma mutação quase sempre alcança mais de uma chave
// do SWR (a lista filtrada, o item aberto, a contagem das categorias), então o caminho é
// o `mutate` global com casador de prefixo, como em `use-carousel-mutations`.

export const PRODUCT_CATEGORIES_KEY = "/products/categories"
export const PRODUCT_FIELDS_KEY = "/products/field-definitions"

/** Apagar é um a um no servidor: `bulk-destroy` recusa mais que isto de uma vez. */
export const BULK_DESTROY_LIMIT = 500
/** Quantos pedidos ao mesmo tempo nas ações em lote que não têm rota própria. */
const BULK_CONCURRENCY = 5
/** O maior `perPage` que a API aceita. */
export const ITEMS_MAX_PER_PAGE = 100

export const itemPath = (id: string) => `/products/items/${id}`

const isItemListKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith("/products/items?")
const isAnyItemKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith("/products/items")

type ListedData = ProductItemsResponse | undefined

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let start = 0; start < values.length; start += size) {
    chunks.push(values.slice(start, start + size))
  }
  return chunks
}

/* ---------- leituras ---------- */

export function useProductItems(path: string) {
  const { data, error, isLoading, isValidating, mutate } = useApi<ProductItemsResponse>(path, {
    keepPreviousData: true,
  })
  return { items: data?.items, meta: data?.meta, error, isLoading, isValidating, mutate }
}

/** Sem `keepPreviousData`: um item nunca pode aparecer no lugar de outro enquanto carrega. */
export function useProductItem(id: string | null) {
  const { data, error, isLoading, mutate } = useApi<ProductItemDetail>(id ? itemPath(id) : null, {
    keepPreviousData: false,
  })
  return { item: data, error, isLoading, mutate }
}

type CategoriesResponse = { categories: ProductCategory[] }

export function useProductCategories() {
  const { data, error, isLoading, mutate } = useApi<CategoriesResponse>(PRODUCT_CATEGORIES_KEY)
  return { categories: data?.categories, error, isLoading, mutate }
}

type FieldsResponse = { fieldDefinitions: ProductField[] }

export function useProductFields() {
  const { data, error, isLoading, mutate } = useApi<FieldsResponse>(PRODUCT_FIELDS_KEY)
  return { fields: data?.fieldDefinitions, error, isLoading, mutate }
}

/** Todos os ids de uma listagem, página a página: para "selecionar todos os resultados". */
export async function fetchAllItemIds(listPath: string): Promise<string[]> {
  const ids: string[] = []
  for (let page = 1; ; page += 1) {
    const url = new URL(listPath, "http://local")
    url.searchParams.set("page", String(page))
    url.searchParams.set("perPage", String(ITEMS_MAX_PER_PAGE))
    const { items, meta } = await apiGet<ProductItemsResponse>(`${url.pathname}${url.search}`)
    ids.push(...items.map((item) => item.id))
    if (!meta.hasMore) return ids
  }
}

/* ---------- itens ---------- */

export type ItemPayload = {
  title: string
  summary: string | null
  description: string | null
  externalId: string
  url: string | null
  active: boolean
  tags: string[]
  categoryIds: string[]
  customFields: Record<string, unknown>
}

export function useItemMutations() {
  const { mutate } = useSWRConfig()

  const refreshItems = useCallback(() => {
    void mutate(isAnyItemKey)
    // Criar, excluir e trocar de categoria mexem na contagem de cada categoria.
    void mutate(PRODUCT_CATEGORIES_KEY)
  }, [mutate])

  const patchListed = useCallback(
    (ids: readonly string[], changes: Partial<ProductItem>) => {
      const selected = new Set(ids)
      void mutate(
        isItemListKey,
        (data: ListedData) =>
          data && {
            ...data,
            items: data.items.map((item) =>
              selected.has(item.id) ? { ...item, ...changes } : item
            ),
          },
        { revalidate: false }
      )
    },
    [mutate]
  )

  const saveItem = useCallback(
    async (id: string | null, payload: ItemPayload) => {
      const saved = id
        ? await apiPatch<ProductItemDetail>(itemPath(id), { item: payload })
        : await apiPost<ProductItemDetail>("/products/items", { item: payload })
      void mutate(itemPath(saved.id), saved, { revalidate: false })
      void mutate(isItemListKey)
      void mutate(PRODUCT_CATEGORIES_KEY)
      return saved
    },
    [mutate]
  )

  /** Otimista: o selo muda na hora. Em erro, a revalidação põe o que vale de volta. */
  const setItemActive = useCallback(
    async (id: string, active: boolean) => {
      patchListed([id], { active })
      try {
        await apiPatch(itemPath(id), { item: { active } })
      } finally {
        refreshItems()
      }
    },
    [patchListed, refreshItems]
  )

  const setItemsActive = useCallback(
    async (ids: readonly string[], active: boolean) => {
      patchListed(ids, { active })
      // Sem rota de lote para isto: um pedido por item, em poucos de cada vez.
      const result = await runPool(ids, BULK_CONCURRENCY, (id) =>
        apiPatch(itemPath(id), { item: { active } })
      )
      refreshItems()
      return result
    },
    [patchListed, refreshItems]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      await apiDelete(itemPath(id))
      refreshItems()
    },
    [refreshItems]
  )

  const deleteItems = useCallback(
    async (ids: readonly string[]) => {
      let deleted = 0
      try {
        for (const part of chunk(ids, BULK_DESTROY_LIMIT)) {
          const response = await apiPost<{ deleted: number }>("/products/items/bulk-destroy", {
            ids: part,
          })
          deleted += response.deleted
        }
      } finally {
        refreshItems()
      }
      return deleted
    },
    [refreshItems]
  )

  return { saveItem, setItemActive, setItemsActive, deleteItem, deleteItems, refreshItems }
}

/* ---------- imagens ---------- */

export function useImageMutations() {
  const { mutate } = useSWRConfig()

  const setImages = useCallback(
    (itemId: string, update: (images: ProductImage[]) => ProductImage[]) =>
      mutate<ProductItemDetail>(
        itemPath(itemId),
        (data) => data && { ...data, images: update(data.images) },
        { revalidate: false }
      ),
    [mutate]
  )

  const refreshLists = useCallback(() => void mutate(isItemListKey), [mutate])

  const uploadImage = useCallback(
    async (
      itemId: string,
      file: File,
      options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
    ) => {
      const body = new FormData()
      body.append("file", file)
      const image = await apiUpload<ProductImage>(`${itemPath(itemId)}/images`, body, options)
      await setImages(itemId, (images) => [...images, image])
      refreshLists()
      return image
    },
    [refreshLists, setImages]
  )

  const addImageUrl = useCallback(
    async (itemId: string, sourceUrl: string) => {
      const image = await apiPost<ProductImage>(`${itemPath(itemId)}/images`, {
        image: { sourceUrl },
      })
      await setImages(itemId, (images) => [...images, image])
      refreshLists()
      return image
    },
    [refreshLists, setImages]
  )

  const deleteImage = useCallback(
    async (itemId: string, imageId: string) => {
      await apiDelete(`/products/images/${imageId}`)
      await setImages(itemId, (images) => images.filter((image) => image.id !== imageId))
      refreshLists()
    },
    [refreshLists, setImages]
  )

  /** A primeira da lista é a principal: reordenar é também como se escolhe a principal. */
  const reorderImages = useCallback(
    async (itemId: string, ordered: readonly ProductImage[]) => {
      await setImages(itemId, () => withPositions(ordered))
      try {
        await Promise.all(
          positionChanges(ordered).map(({ id, position }) =>
            apiPatch(`/products/images/${id}`, { image: { position } })
          )
        )
      } finally {
        void mutate(itemPath(itemId))
        refreshLists()
      }
    },
    [mutate, refreshLists, setImages]
  )

  return { uploadImage, addImageUrl, deleteImage, reorderImages }
}

/* ---------- categorias ---------- */

export type CategoryPayload = {
  name?: string
  parentId?: string | null
  position?: number
}

export function useCategoryMutations() {
  const { mutate } = useSWRConfig()

  const saveCategory = useCallback(
    async (id: string | null, payload: CategoryPayload) => {
      const saved = id
        ? await apiPatch<ProductCategory>(`/products/categories/${id}`, { category: payload })
        : await apiPost<ProductCategory>("/products/categories", { category: payload })
      // O nome e o caminho de quem está dentro mudam juntos: só o servidor sabe a árvore.
      await mutate(PRODUCT_CATEGORIES_KEY)
      return saved
    },
    [mutate]
  )

  const deleteCategory = useCallback(
    async (id: string) => {
      await apiDelete(`/products/categories/${id}`)
      void mutate(PRODUCT_CATEGORIES_KEY)
      void mutate(isAnyItemKey)
    },
    [mutate]
  )

  const reorderCategories = useCallback(
    async (siblings: readonly ProductCategory[]) => {
      const positions = new Map(siblings.map((category, index) => [category.id, index]))
      await mutate<CategoriesResponse>(
        PRODUCT_CATEGORIES_KEY,
        (data) =>
          data && {
            ...data,
            categories: data.categories.map((category) => ({
              ...category,
              position: positions.get(category.id) ?? category.position,
            })),
          },
        { revalidate: false }
      )
      try {
        await Promise.all(
          positionChanges(siblings).map(({ id, position }) =>
            apiPatch(`/products/categories/${id}`, { category: { position } })
          )
        )
      } finally {
        void mutate(PRODUCT_CATEGORIES_KEY)
      }
    },
    [mutate]
  )

  return { saveCategory, deleteCategory, reorderCategories }
}

/* ---------- campos personalizados ---------- */

export type FieldPayload = {
  name?: string
  description?: string | null
  valueType?: ProductField["valueType"]
  optionValues?: string[]
  defaultValue?: string | null
  required?: boolean
  searchable?: boolean
  position?: number
}

export function useFieldMutations() {
  const { mutate } = useSWRConfig()

  const saveField = useCallback(
    async (id: string | null, payload: FieldPayload) => {
      const saved = id
        ? await apiPatch<ProductField>(`/products/field-definitions/${id}`, {
            fieldDefinition: payload,
          })
        : await apiPost<ProductField>("/products/field-definitions", {
            fieldDefinition: payload,
          })
      await mutate(PRODUCT_FIELDS_KEY)
      return saved
    },
    [mutate]
  )

  const deleteField = useCallback(
    async (id: string) => {
      await apiDelete(`/products/field-definitions/${id}`)
      await mutate(PRODUCT_FIELDS_KEY)
    },
    [mutate]
  )

  const reorderFields = useCallback(
    async (ordered: readonly ProductField[]) => {
      await mutate<FieldsResponse>(
        PRODUCT_FIELDS_KEY,
        (data) => data && { ...data, fieldDefinitions: withPositions(ordered) },
        { revalidate: false }
      )
      try {
        await Promise.all(
          positionChanges(ordered).map(({ id, position }) =>
            apiPatch(`/products/field-definitions/${id}`, { fieldDefinition: { position } })
          )
        )
      } finally {
        void mutate(PRODUCT_FIELDS_KEY)
      }
    },
    [mutate]
  )

  return { saveField, deleteField, reorderFields }
}
