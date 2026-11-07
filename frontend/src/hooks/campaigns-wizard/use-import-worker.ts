import { useCallback, useEffect, useRef, useState } from "react"

import type { ImportRow } from "@/lib/contacts/import-parser"
import type {
  ColumnChoice,
  ImportContact,
  MappedSummary,
  ParsedSummary,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/campaigns-wizard/import-protocol"

export type ReadProgress = { phase: "reading" | "organizing"; fraction: number | null }

type Pending = {
  resolve: (value: never) => void
  reject: (reason: Error) => void
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never

/** O worker que lê a planilha, com uma promessa por pedido. Morre com o painel, e leva o arquivo junto. */
export function useImportWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextId = useRef(0)
  const [progress, setProgress] = useState<ReadProgress | null>(null)

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(new URL("../../lib/campaigns-wizard/import.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === "progress") {
        setProgress({ phase: message.phase, fraction: message.fraction })
        return
      }

      const pending = pendingRef.current.get(message.id)
      if (!pending) return
      pendingRef.current.delete(message.id)

      if (message.type === "error") pending.reject(new Error(message.code))
      else if (message.type === "parsed") pending.resolve(message.result as never)
      else if (message.type === "mapped") pending.resolve(message.result as never)
      else pending.resolve(message.contacts as never)
    }
    worker.onerror = () => {
      for (const pending of pendingRef.current.values()) pending.reject(new Error("unknownFormat"))
      pendingRef.current.clear()
    }
    workerRef.current = worker
    return worker
  }, [])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    []
  )

  const request = useCallback(
    <T>(message: WithoutId<WorkerRequest>) =>
      new Promise<T>((resolve, reject) => {
        const id = ++nextId.current
        pendingRef.current.set(id, { resolve: resolve as (value: never) => void, reject })
        getWorker().postMessage({ ...message, id } as WorkerRequest)
      }),
    [getWorker]
  )

  const readFile = useCallback(
    async (file: File) => {
      setProgress({ phase: "reading", fraction: 0 })
      try {
        return await request<ParsedSummary>({ type: "read", file })
      } finally {
        setProgress(null)
      }
    },
    [request]
  )

  const loadRows = useCallback(
    (headers: string[], rows: ImportRow[]) => request<ParsedSummary>({ type: "load", headers, rows }),
    [request]
  )

  const mapColumns = useCallback(
    (columns: ColumnChoice, includeCountryCode: boolean) =>
      request<MappedSummary>({ type: "map", columns, includeCountryCode }),
    [request]
  )

  const nextBatch = useCallback(
    (offset: number, size: number) => request<ImportContact[]>({ type: "batch", offset, size }),
    [request]
  )

  return { progress, readFile, loadRows, mapColumns, nextBatch }
}
