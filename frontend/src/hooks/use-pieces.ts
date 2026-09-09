import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { BASE_URL, ApiError, apiDelete, apiPost } from "@/lib/api"
import { getClientId } from "@/lib/cable"
import { currentLanguage } from "@/lib/i18n"
import { getToken } from "@/lib/token"
import type { Piece, PieceFormat, PieceValues } from "@/lib/engines"

// As peças de uma marca (`/brands/:id/pieces`). Toda função recebe a marca.

export type PieceFilters = { engine?: string; outdated?: boolean }

export function piecesKey(brandId: string, filters: PieceFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.engine) params.set("engine", filters.engine)
  if (filters.outdated) params.set("outdated", "true")
  const query = params.toString()
  return `/brands/${brandId}/pieces${query ? `?${query}` : ""}`
}

export function pieceKey(brandId: string, id: string | undefined): string | null {
  return id ? `/brands/${brandId}/pieces/${id}` : null
}

/** Qualquer chave de peça, de qualquer marca — para o canal invalidar. */
export function isPieceKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith("/brands/") && key.includes("/pieces")
}

export function usePieces(brandId: string, filters: PieceFilters = {}) {
  const { data, error, isLoading, mutate } = useApi<{ pieces: Piece[] }>(piecesKey(brandId, filters))
  return { pieces: data?.pieces, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export function usePiece(brandId: string, id: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<Piece>(pieceKey(brandId, id))
  return { piece: data, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export type CreatePieceInput = {
  engineId: string
  format: PieceFormat
  title?: string
  values: PieceValues
}

export function usePieceMutations(brandId: string) {
  const { mutate } = useSWRConfig()
  const base = `/brands/${brandId}/pieces`
  const resync = useCallback(() => mutate(isPieceKey), [mutate])

  const create = useCallback(
    async (input: CreatePieceInput): Promise<Piece> => {
      const piece = await apiPost<Piece>(base, { piece: input }, { headers: { "X-Client-Id": getClientId() } })
      await resync()
      return piece
    },
    [base, resync]
  )

  const regenerate = useCallback(
    async (id: string): Promise<Piece> => {
      const piece = await apiPost<Piece>(`${base}/${id}/regenerate`)
      await mutate(pieceKey(brandId, id), piece, { revalidate: false })
      await resync()
      return piece
    },
    [base, brandId, mutate, resync]
  )

  const remove = useCallback(
    async (id: string) => {
      await mutate(
        isPieceKey,
        (current?: { pieces: Piece[] } | Piece) =>
          current && "pieces" in current ? { pieces: current.pieces.filter((p) => p.id !== id) } : current,
        { revalidate: false }
      )
      try {
        await apiDelete(`${base}/${id}`)
      } finally {
        await resync()
      }
    },
    [base, mutate, resync]
  )

  /**
   * A prévia é uma imagem, não JSON — vai direto pelo `fetch`, com o mesmo
   * cabeçalho de sessão. Erro volta no envelope de sempre (422 com código).
   */
  const preview = useCallback(
    async (engineId: string, values: PieceValues, format: PieceFormat, signal?: AbortSignal): Promise<Blob> => {
      const token = getToken()
      const response = await fetch(`${BASE_URL}/brands/${brandId}/engines/${engineId}/preview`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": currentLanguage(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ piece: { values, format } }),
      })
      if (!response.ok) {
        let envelope: { error?: { code?: string; field?: string; message?: string; details?: Record<string, string[]> } } = {}
        try {
          envelope = await response.json()
        } catch {
          /* corpo não-JSON */
        }
        throw new ApiError({
          status: response.status,
          code: (envelope.error?.code as ApiError["code"]) ?? "unknown",
          field: envelope.error?.field,
          details: envelope.error?.details,
          serverMessage: envelope.error?.message,
        })
      }
      return response.blob()
    },
    [brandId]
  )

  return { create, regenerate, remove, preview, resync }
}
