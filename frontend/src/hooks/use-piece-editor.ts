import { useCallback } from "react"
import { useSWRConfig } from "swr"

import { useApi } from "@/hooks/use-api"
import { apiPatch } from "@/lib/api"
import { getClientId } from "@/lib/cable"
import type { Piece } from "@/lib/engines"
import type { PieceDocument } from "@/lib/piece-document"
import type { RenderLayout, RenderPayload } from "@/lib/piece-render"

// O editor de uma peça-documento: o que ele lê para abrir (o mesmo payload
// do render + a biblioteca de layouts do formato) e como grava.

export function pieceEditorKey(brandId: string, pieceId: string): string {
  return `/brands/${brandId}/pieces/${pieceId}/render-payload`
}

/**
 * Abre o editor numa leitura só: documento, tema da marca publicada,
 * arquivos e a geometria dos layouts que o formato aceita (o seletor de
 * layout precisa de todos, não só do atual).
 */
export function usePieceEditorData(brandId: string, pieceId: string) {
  // Sem revalidar no foco: o editor é dono do documento enquanto está aberto.
  const payload = useApi<RenderPayload>(pieceEditorKey(brandId, pieceId), { revalidateOnFocus: false, revalidateIfStale: false })
  const format = payload.data?.document.format
  const library = useApi<{ layouts: RenderLayout[] }>(format ? `/layouts?format=${format}` : null, { revalidateOnFocus: false })

  return {
    payload: payload.data,
    layouts: library.data?.layouts,
    isLoading: (payload.isLoading && !payload.data) || (library.isLoading && !library.data),
    error: payload.error ?? library.error,
    reload: () => {
      void payload.mutate()
      void library.mutate()
    },
  }
}

export type SaveResult = { piece: Piece; versionId: string; warnings: Array<{ path: string; code: string; detail?: string }> }

export function usePieceEditorSave(brandId: string, pieceId: string) {
  const { mutate } = useSWRConfig()

  /** O salvamento automático: o documento inteiro, a partir da versão base. */
  const saveDocument = useCallback(
    async (document: PieceDocument, baseVersionId: string): Promise<SaveResult> => {
      const result = await apiPatch<SaveResult>(
        `/brands/${brandId}/pieces/${pieceId}/document`,
        { document, baseVersionId },
        { headers: { "X-Client-Id": getClientId() } }
      )
      // A peça (status, renders) acompanha; o payload do editor não — quem
      // manda no documento aberto é o próprio editor.
      await mutate(`/brands/${brandId}/pieces/${pieceId}`, result.piece, { revalidate: false })
      return result
    },
    [brandId, mutate, pieceId]
  )

  return { saveDocument }
}
