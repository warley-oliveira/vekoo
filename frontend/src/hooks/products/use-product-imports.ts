import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSWRConfig, type Arguments } from "swr"

import { useApi } from "@/hooks/use-api"
import { useChannel } from "@/hooks/use-channel"
import { apiDelete, apiPost } from "@/lib/api"
import type {
  ProductImport,
  ProductImportEvent,
  ProductImportsResponse,
} from "@/lib/products/types"

// Importação em duas fases: o arquivo sobe (`POST /products/imports`, feito pelo
// `FileDropzone`), a pessoa confere as colunas, e o `start` põe o job na fila. O progresso
// chega pelo canal. Como a transmissão é melhor esforço, quem manda de verdade é a leitura
// de `GET /products/imports/:id`: o canal só deixa a tela mais viva.

const IMPORTS_PREFIX = "/products/imports"
const isImportKey = (key: Arguments) =>
  typeof key === "string" && key.startsWith(IMPORTS_PREFIX)
const isCatalogDataKey = (key: Arguments) =>
  typeof key === "string" &&
  (key.startsWith("/products/items") || key.startsWith("/products/categories"))

/** Com o canal de pé, a leitura é só a rede de segurança. Sem ele, é ela que dá o progresso. */
const POLL_CONNECTED_MS = 8000
const POLL_DISCONNECTED_MS = 3000
const HISTORY_POLL_MS = 5000

/** Na fila ou processando: `start` responde ainda em `ready`, e o job é que muda o estado. */
export function isImportRunning(entry: Pick<ProductImport, "status" | "mapping">): boolean {
  return (
    entry.status === "processing" ||
    (entry.status === "ready" && Object.keys(entry.mapping).length > 0)
  )
}

/** Subiu o arquivo e parou na tela de colunas: não dá para retomar, só enviar de novo. */
export function isImportAbandoned(entry: Pick<ProductImport, "status" | "mapping">): boolean {
  return (
    entry.status === "pending" ||
    (entry.status === "ready" && Object.keys(entry.mapping).length === 0)
  )
}

export function useProductImports(page = 1, perPage = 20) {
  const { data, error, isLoading, mutate } = useApi<ProductImportsResponse>(
    `${IMPORTS_PREFIX}?page=${page}&perPage=${perPage}`,
    {
      keepPreviousData: true,
      refreshInterval: (latest) =>
        latest?.imports.some(isImportRunning) ? HISTORY_POLL_MS : 0,
    }
  )
  return { imports: data?.imports, meta: data?.meta, error, isLoading, mutate }
}

export function useProductImport(id: string | null, connected: boolean) {
  const { data, error, isLoading, mutate } = useApi<ProductImport>(
    id ? `${IMPORTS_PREFIX}/${id}` : null,
    {
      keepPreviousData: false,
      refreshInterval: (latest) =>
        latest && !isImportRunning(latest)
          ? 0
          : connected
            ? POLL_CONNECTED_MS
            : POLL_DISCONNECTED_MS,
    }
  )
  return { entry: data, error, isLoading, mutate }
}

export function useImportMutations() {
  const { mutate } = useSWRConfig()

  const startImport = useCallback(
    async (
      id: string,
      mapping: Record<string, string>,
      options: { dedupeByTitle: boolean; mirrorImages: boolean }
    ) => {
      const started = await apiPost<ProductImport>(`${IMPORTS_PREFIX}/${id}/start`, {
        mapping,
        options,
      })
      void mutate(isImportKey)
      return started
    },
    [mutate]
  )

  const deleteImport = useCallback(
    async (id: string) => {
      await apiDelete(`${IMPORTS_PREFIX}/${id}`)
      void mutate(isImportKey)
    },
    [mutate]
  )

  return { startImport, deleteImport }
}

/** O último aviso do canal sobre uma importação. */
export type ImportLive =
  | {
      kind: "progress" | "completed"
      processed: number
      total: number
      created: number
      updated: number
      errors: number
      percentage: number
    }
  | { kind: "error"; code: string; message: string }

type FeedOptions = {
  /** Terminou, bem ou mal. Vale para toda a organização, não só para quem começou. */
  onFinished?: (importId: string, live: ImportLive) => void
}

/**
 * A assinatura do canal, enquanto a tela do catálogo estiver aberta: pega a importação de
 * qualquer pessoa da organização, e por isso tudo aqui é por `importId`. Fica no alto da
 * página, e não no painel, para o aviso de "terminou" chegar com o painel fechado.
 */
export function useImportFeed({ onFinished }: FeedOptions = {}) {
  const { mutate } = useSWRConfig()
  const [live, setLive] = useState<Record<string, ImportLive>>({})

  const finished = useRef(onFinished)
  useEffect(() => {
    finished.current = onFinished
  })

  const { connected } = useChannel<ProductImportEvent>(
    "ProductImportChannel",
    {},
    (event) => {
      const importId = event.data?.importId
      if (!importId) return

      const next: ImportLive =
        event.action === "error"
          ? { kind: "error", code: event.data.code, message: event.data.message }
          : {
              kind: event.action,
              processed: event.data.processed,
              total: event.data.total,
              created: event.data.created,
              updated: event.data.updated,
              errors: event.data.errors,
              percentage: event.data.percentage,
            }

      setLive((current) => ({ ...current, [importId]: next }))
      void mutate(isImportKey)

      if (next.kind !== "progress") {
        // A importação cria itens e categorias: o que está na tela ficou velho.
        void mutate(isCatalogDataKey)
        finished.current?.(importId, next)
      }
    }
  )

  // Voltou de uma queda: o que se perdeu no meio está na leitura.
  useEffect(() => {
    if (connected) void mutate(isImportKey)
  }, [connected, mutate])

  return useMemo(() => ({ live, connected }), [connected, live])
}

export type ImportFeed = ReturnType<typeof useImportFeed>
