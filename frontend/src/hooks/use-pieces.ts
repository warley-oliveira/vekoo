import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { BASE_URL, ApiError, apiDelete, apiPost } from "@/lib/api"
import { getClientId } from "@/lib/cable"
import { currentLanguage } from "@/lib/i18n"
import { getToken } from "@/lib/token"
import type { Piece, PieceFormat, PieceValues } from "@/lib/engines"

export type PieceFilters = { engine?: string; stale?: boolean }

export function piecesKey(filters: PieceFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.engine) params.set("engine", filters.engine)
  if (filters.stale) params.set("stale", "true")
  const query = params.toString()
  return `/pieces${query ? `?${query}` : ""}`
}

export function pieceKey(id: string | undefined): string | null {
  return id ? `/pieces/${id}` : null
}

export function isPieceKey(key: unknown): key is string {
  return typeof key === "string" && key.startsWith("/pieces")
}

export function usePieces(filters: PieceFilters = {}) {
  const { data, error, isLoading, mutate } = useApi<{ pieces: Piece[] }>(piecesKey(filters))
  return { pieces: data?.pieces, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export function usePiece(id: string | undefined) {
  const { data, error, isLoading, mutate } = useApi<Piece>(pieceKey(id))
  return { piece: data, isLoading: isLoading && !data, error, reload: () => mutate() }
}

export type CreatePieceInput = {
  engineId: string
  format: PieceFormat
  title?: string
  values: PieceValues
}

export function usePieceMutations() {
  const { mutate } = useSWRConfig()
  const resync = useCallback(() => mutate(isPieceKey), [mutate])

  const create = useCallback(
    async (input: CreatePieceInput): Promise<Piece> => {
      const piece = await apiPost<Piece>("/pieces", { piece: input }, { headers: { "X-Client-Id": getClientId() } })
      await resync()
      return piece
    },
    [resync]
  )

  const regenerate = useCallback(
    async (id: string): Promise<Piece> => {
      const piece = await apiPost<Piece>(`/pieces/${id}/regenerate`)
      await mutate(pieceKey(id), piece, { revalidate: false })
      await resync()
      return piece
    },
    [mutate, resync]
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
        await apiDelete(`/pieces/${id}`)
      } finally {
        await resync()
      }
    },
    [mutate, resync]
  )

  /**
   * A prévia é uma imagem, não JSON — vai direto pelo `fetch`, com o mesmo
   * cabeçalho de sessão. Erro volta no envelope de sempre (422 com código).
   */
  const preview = useCallback(
    async (engineId: string, values: PieceValues, format: PieceFormat, signal?: AbortSignal): Promise<Blob> => {
      const token = getToken()
      const response = await fetch(`${BASE_URL}/engines/${engineId}/preview`, {
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
    []
  )

  return { create, regenerate, remove, preview, resync }
}
