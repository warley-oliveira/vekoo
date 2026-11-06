import { useCallback } from "react"
import useSWR, { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiDelete, apiPatch, apiUpload, type PaginationMeta } from "@/lib/api"
import { nameFromFileName } from "@/lib/content/attachment-file"
import type {
  Attachment,
  AttachmentKind,
  AttachmentSortField,
} from "@/lib/content/types"
import { fetchAllPages } from "@/lib/people/fetch-all-pages"

export type AttachmentListParams = {
  page: number
  perPage: number
  search?: string
  kinds?: readonly AttachmentKind[]
  sortBy?: AttachmentSortField
  sortOrder?: "asc" | "desc"
}

/** Uma página da biblioteca, com busca, tipo e ordem no servidor. */
export function useAttachments(params: AttachmentListParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    perPage: String(params.perPage),
  })
  if (params.search?.trim()) query.set("search", params.search.trim())
  if (params.kinds?.length) query.set("kind", params.kinds.join(","))
  if (params.sortBy) query.set("sortBy", params.sortBy)
  if (params.sortOrder) query.set("sortOrder", params.sortOrder)

  const { data, error, isLoading, isValidating, mutate } = useApi<{
    attachments: Attachment[]
    meta: PaginationMeta
  }>(`/attachments?${query}`, { keepPreviousData: true })

  return {
    attachments: data?.attachments,
    meta: data?.meta,
    error,
    isLoading,
    isValidating,
    reload: () => mutate(),
  }
}

/** Um anexo só, para o painel aberto por link, que pode não estar na página atual. */
export function useAttachment(id: string | null) {
  const { data, error, isLoading } = useApi<{ attachment: Attachment }>(
    id ? `/attachments/${id}` : null,
    { keepPreviousData: false }
  )
  return { attachment: data?.attachment ?? null, error, isLoading }
}

export const ATTACHMENT_LIBRARY_KEY = "/attachments?perPage=100&sortBy=name&sortOrder=asc"

/** A biblioteca inteira, para escolher anexo e dar nome às citações do texto. */
export function useAttachmentLibrary() {
  const { data, error, isLoading, mutate } = useSWR<Attachment[]>(ATTACHMENT_LIBRARY_KEY, () =>
    fetchAllPages<Attachment>(ATTACHMENT_LIBRARY_KEY, "attachments")
  )
  return { attachments: data, error, isLoading, reload: () => mutate() }
}

type TransferOptions = { onProgress?: (fraction: number) => void; signal?: AbortSignal }

export type AttachmentChanges = { name: string; description: string | null; file?: File | null }

export function useAttachmentMutations() {
  const { mutate } = useSWRConfig()

  // Toda página em cache e a biblioteca inteira: a ordem e os filtros de cada uma são do servidor.
  const revalidate = useCallback(
    () => mutate((key) => typeof key === "string" && key.startsWith("/attachments")),
    [mutate]
  )

  const uploadAttachment = useCallback(
    async (file: File, options: TransferOptions = {}) => {
      const body = new FormData()
      body.append("file", file)
      body.append("name", nameFromFileName(file.name))
      const { attachment } = await apiUpload<{ attachment: Attachment }>(
        "/attachments",
        body,
        options
      )
      void revalidate()
      return attachment
    },
    [revalidate]
  )

  const updateAttachment = useCallback(
    async (id: string, changes: AttachmentChanges, options: TransferOptions = {}) => {
      let response: { attachment: Attachment }
      if (changes.file) {
        const body = new FormData()
        body.append("name", changes.name)
        body.append("description", changes.description ?? "")
        body.append("file", changes.file)
        response = await apiUpload(`/attachments/${id}`, body, { ...options, method: "PATCH" })
      } else {
        response = await apiPatch(`/attachments/${id}`, {
          name: changes.name,
          description: changes.description ?? "",
        })
      }
      await revalidate()
      return response.attachment
    },
    [revalidate]
  )

  const deleteAttachment = useCallback(
    async (id: string) => {
      await apiDelete(`/attachments/${id}`)
      void revalidate()
    },
    [revalidate]
  )

  return { uploadAttachment, updateAttachment, deleteAttachment, revalidate }
}
