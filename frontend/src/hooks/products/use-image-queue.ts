import { useCallback, useEffect, useRef, useState } from "react"

import { useImageMutations } from "@/hooks/products/use-products"
import { ApiError } from "@/lib/api"
import i18n from "@/lib/i18n"

export type PendingImage = {
  id: string
  name: string
  /** `blob:` do arquivo local, ou o próprio link. */
  previewUrl: string
  source: { file: File } | { url: string }
  status: "queued" | "uploading" | "failed"
  /** De 0 a 1. */
  progress: number
  error?: string
}

let nextId = 0

function release(entry: PendingImage) {
  if ("file" in entry.source) URL.revokeObjectURL(entry.previewUrl)
}

function messageOf(cause: unknown): string {
  if (cause instanceof ApiError && cause.serverMessage) return cause.serverMessage
  return i18n.t("products.images.uploadFailed")
}

/**
 * As fotos a caminho. Item novo ainda não tem onde guardar foto (a API pede o item salvo
 * antes), então elas esperam aqui e sobem assim que ele existir, em vez de mandar a pessoa
 * voltar depois. Uma de cada vez: a posição nasce da maior que já existe, e dois envios
 * juntos empatariam, deixando a ordem na mão do acaso.
 */
export function useImageQueue(itemId: string | null) {
  const { uploadImage, addImageUrl } = useImageMutations()
  const [pending, setPendingState] = useState<PendingImage[]>([])

  const latest = useRef(pending)
  const setPending = useCallback((update: (current: PendingImage[]) => PendingImage[]) => {
    latest.current = update(latest.current)
    setPendingState(latest.current)
  }, [])

  const running = useRef(false)
  const disposed = useRef(false)
  const controller = useRef<AbortController | null>(null)

  const patch = useCallback(
    (id: string, changes: Partial<PendingImage>) =>
      setPending((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry))
      ),
    [setPending]
  )

  const drain = useCallback(
    async (targetId: string) => {
      if (running.current) return
      running.current = true

      for (
        let entry = latest.current.find((candidate) => candidate.status === "queued");
        entry && !disposed.current;
        entry = latest.current.find((candidate) => candidate.status === "queued")
      ) {
        const current = entry
        const abort = new AbortController()
        controller.current = abort
        patch(current.id, { status: "uploading", progress: 0, error: undefined })

        try {
          if ("file" in current.source) {
            await uploadImage(targetId, current.source.file, {
              signal: abort.signal,
              onProgress: (progress) => patch(current.id, { progress }),
            })
          } else {
            await addImageUrl(targetId, current.source.url)
          }
          release(current)
          setPending((list) => list.filter((candidate) => candidate.id !== current.id))
        } catch (cause) {
          // Cancelada: `remove` já tirou da lista.
          if (!abort.signal.aborted) {
            patch(current.id, { status: "failed", error: messageOf(cause) })
          }
        }
      }

      controller.current = null
      running.current = false
    },
    [addImageUrl, patch, setPending, uploadImage]
  )

  const hasQueued = pending.some((entry) => entry.status === "queued")
  useEffect(() => {
    if (itemId && hasQueued) void drain(itemId)
  }, [drain, hasQueued, itemId])

  // Saiu da tela: nada de envio órfão, e nada de prévia presa na memória.
  useEffect(() => {
    disposed.current = false
    return () => {
      disposed.current = true
      controller.current?.abort()
      latest.current.forEach(release)
    }
  }, [])

  const addFiles = useCallback(
    (files: readonly File[]) =>
      setPending((current) => [
        ...current,
        ...files.map<PendingImage>((file) => ({
          id: `pending-${++nextId}`,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          source: { file },
          status: "queued",
          progress: 0,
        })),
      ]),
    [setPending]
  )

  const addUrl = useCallback(
    (url: string) =>
      setPending((current) => [
        ...current,
        {
          id: `pending-${++nextId}`,
          name: url,
          previewUrl: url,
          source: { url },
          status: "queued",
          progress: 0,
        },
      ]),
    [setPending]
  )

  const retry = useCallback((id: string) => patch(id, { status: "queued" }), [patch])

  const remove = useCallback(
    (id: string) => {
      const entry = latest.current.find((candidate) => candidate.id === id)
      if (!entry) return
      if (entry.status === "uploading") controller.current?.abort()
      release(entry)
      setPending((current) => current.filter((candidate) => candidate.id !== id))
    },
    [setPending]
  )

  return {
    pending,
    /** Há foto que ainda não chegou ao servidor: sair agora a perderia. */
    hasUnsent: pending.some((entry) => entry.status !== "failed"),
    addFiles,
    addUrl,
    retry,
    remove,
  }
}
