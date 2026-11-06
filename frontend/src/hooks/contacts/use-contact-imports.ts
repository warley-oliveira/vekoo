import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { mutate } from "swr"

import { useApi } from "@/hooks/use-api"
import { ApiError, apiPost } from "@/lib/api"
import {
  IMPORT_BATCH_SIZE,
  chunk,
  type ImportContactPayload,
} from "@/lib/contacts/import-parser"
import type {
  ContactImport,
  ContactImportsResponse,
  CreateContactImportResponse,
} from "@/lib/contacts/types"

// Importar é em duas partes. Primeiro a tela manda as linhas, em lotes de até 1000; depois o job
// transforma cada lote em conversas, e quem conta como vai é `GET /contact-imports`. Uma leitura
// só, da lista, serve para todos os lotes: perguntar um por um seriam dezenas de pedidos a cada
// poucos segundos.

const IMPORTS_KEY = "/contact-imports?perPage=100"
const POLL_MS = 3000
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1000

export function isImportRunning(contactImport: ContactImport): boolean {
  return contactImport.status === "pending" || contactImport.status === "processing"
}

export function reloadContactImports() {
  return mutate(IMPORTS_KEY)
}

/**
 * O lote que acabou de ser criado já entra na lista, sem esperar a leitura: é isto que liga a
 * sondagem, e que evita a tela dizer "concluída" antes de saber que ele existe.
 */
function storeContactImport(created: ContactImport) {
  void mutate<ContactImportsResponse>(
    IMPORTS_KEY,
    (current) =>
      current && {
        ...current,
        contactImports: [created, ...current.contactImports.filter((item) => item.id !== created.id)],
      },
    { revalidate: false }
  )
}

export function useContactImports() {
  const { data, error, isLoading, mutate: reload } = useApi<ContactImportsResponse>(IMPORTS_KEY, {
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest?.contactImports.some(isImportRunning) ? POLL_MS : 0),
  })

  return { imports: data?.contactImports, error, isLoading, reload }
}

/** Os lotes de um mesmo arquivo, vistos como uma coisa só. */
export type ImportGroup = {
  key: string
  fileName: string | null
  connectorId: string
  createdAt: number
  status: "running" | "completed" | "failed"
  /** Linhas enviadas. */
  total: number
  imported: number
  batches: number
  finishedBatches: number
  /** Quantos lotes o envio anunciou. Enquanto não chegaram todos, ainda pode vir mais. */
  expectedBatches: number
}

/**
 * Junta o que veio em sequência, do mesmo arquivo e canal. A API não dá um id para o envio
 * inteiro, então lotes vizinhos com `totalBatches` igual são considerados o mesmo. A chave é o
 * primeiro lote, para não mudar enquanto chegam os outros. A lista vem do mais novo para o mais
 * antigo, então o primeiro lote é o último a passar por aqui.
 */
export function groupImports(imports: ContactImport[]): ImportGroup[] {
  const groups: ImportGroup[] = []
  let current: ImportGroup | null = null

  for (const entry of imports) {
    const continues =
      current !== null &&
      entry.totalBatches !== null &&
      entry.totalBatches > 1 &&
      current.batches < entry.totalBatches &&
      current.connectorId === entry.connectorId &&
      current.fileName === entry.fileName

    if (!continues || !current) {
      current = {
        key: entry.id,
        fileName: entry.fileName,
        connectorId: entry.connectorId,
        createdAt: entry.createdAt,
        status: "completed",
        total: 0,
        imported: 0,
        batches: 0,
        finishedBatches: 0,
        expectedBatches: entry.totalBatches ?? 1,
      }
      groups.push(current)
    }

    current.key = entry.id
    current.total += entry.totalContacts
    current.imported += entry.importedContactsCount
    current.batches += 1
    if (!isImportRunning(entry)) current.finishedBatches += 1
    current.createdAt = Math.min(current.createdAt, entry.createdAt)

    if (entry.status === "failed") current.status = "failed"
    else if (isImportRunning(entry) && current.status !== "failed") current.status = "running"
  }

  return groups
}

/**
 * Avisa quando uma importação acaba, para a lista recarregar e a pessoa saber. O que já estava
 * pronto na primeira leitura é história. Lista pequena pode nascer e terminar entre duas
 * leituras: por isso vale tudo que aparece pronto depois, e não só o que foi visto andando.
 */
export function useImportFinished(onFinished: (group: ImportGroup) => void) {
  const { imports } = useContactImports()
  const groups = useMemo(() => groupImports(imports ?? []), [imports])

  const reported = useRef<Set<string> | null>(null)
  const handler = useRef(onFinished)
  useEffect(() => {
    handler.current = onFinished
  })

  useEffect(() => {
    if (!imports) return

    if (!reported.current) {
      reported.current = new Set(
        groups.filter((group) => group.status !== "running").map((group) => group.key)
      )
      return
    }

    for (const group of groups) {
      // Lote que ainda vai chegar: o job pode ser mais rápido que o envio.
      const waitingForMore = group.batches < group.expectedBatches
      if (group.status === "running" || waitingForMore || reported.current.has(group.key)) continue

      reported.current.add(group.key)
      handler.current(group)
    }
  }, [groups, imports])

  return groups
}

/**
 * O que os lotes enviados já viraram. Quem saiu da lista recente (mais de 100 lotes) é contado
 * como terminado: a fila é em ordem, e os mais antigos são os primeiros a acabar.
 */
export function useImportOutcome(importIds: string[], send: SendState) {
  const { imports } = useContactImports()

  const byId = new Map<string, ContactImport>((imports ?? []).map((entry) => [entry.id, entry]))
  const entries = importIds.flatMap((id) => {
    const entry = byId.get(id)
    return entry ? [entry] : []
  })

  const runningBatches = entries.filter(isImportRunning).length
  const finishedBatches = importIds.length - runningBatches
  const waitingFirstRead = imports === undefined && importIds.length > 0

  return {
    finishedBatches,
    totalBatches: importIds.length,
    running: send.phase === "sending" || runningBatches > 0 || waitingFirstRead,
    imported: entries.reduce((sum, entry) => sum + entry.importedContactsCount, 0),
    errors: entries.reduce((sum, entry) => sum + entry.errorsCount, 0),
    failedBatches: entries.filter((entry) => entry.status === "failed").length,
  }
}

export type SendState = {
  phase: "idle" | "sending" | "sent" | "failed"
  sentBatches: number
  totalBatches: number
  importIds: string[]
  error: unknown
}

const NOT_SENT: SendState = {
  phase: "idle",
  sentBatches: 0,
  totalBatches: 0,
  importIds: [],
  error: null,
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function isRetryable(error: unknown) {
  return error instanceof ApiError && (error.code === "network" || error.status >= 500)
}

export type SendRequest = {
  connectorId: string
  fileName: string
  contacts: ImportContactPayload[]
}

/**
 * Manda os lotes em ordem, com nova tentativa quando o servidor falha, como na origem. Se um
 * lote não passar, `resume` continua dele: os anteriores já estão na fila, e reenviar não
 * duplica, porque quem já tem conversa no canal não ganha outra.
 */
export function useImportSender() {
  const [state, setState] = useState<SendState>(NOT_SENT)
  const abort = useRef<AbortController | null>(null)
  const request = useRef<{ batches: ImportContactPayload[][]; meta: SendRequest } | null>(null)

  const sendFrom = useCallback(async (start: number, previous: string[]) => {
    const current = request.current
    if (!current) return

    const controller = new AbortController()
    abort.current = controller

    const { batches, meta } = current
    const importIds = [...previous]
    setState({
      phase: "sending",
      sentBatches: start,
      totalBatches: batches.length,
      importIds,
      error: null,
    })

    for (let index = start; index < batches.length; index++) {
      let attempt = 0
      for (;;) {
        if (controller.signal.aborted) return
        try {
          const response = await apiPost<CreateContactImportResponse>("/contact-imports", {
            connectorId: meta.connectorId,
            contacts: batches[index],
            // O número já sai pronto daqui: o servidor não deve mexer de novo.
            includeCountryCode: false,
            batchIndex: index,
            totalBatches: batches.length,
            fileName: meta.fileName,
          })
          importIds.push(response.contactImport.id)
          storeContactImport(response.contactImport)
          break
        } catch (error) {
          if (attempt < MAX_RETRIES && isRetryable(error)) {
            attempt++
            await delay(RETRY_BASE_MS * attempt, controller.signal)
            continue
          }
          setState({
            phase: "failed",
            sentBatches: index,
            totalBatches: batches.length,
            importIds: [...importIds],
            error,
          })
          void reloadContactImports()
          return
        }
      }

      setState((state) => ({ ...state, sentBatches: index + 1, importIds: [...importIds] }))
    }

    setState((state) => ({ ...state, phase: "sent" }))
    void reloadContactImports()
  }, [])

  const send = useCallback(
    (meta: SendRequest) => {
      request.current = { meta, batches: chunk(meta.contacts, IMPORT_BATCH_SIZE) }
      void sendFrom(0, [])
    },
    [sendFrom]
  )

  const resume = useCallback(() => {
    void sendFrom(state.sentBatches, state.importIds)
  }, [sendFrom, state.importIds, state.sentBatches])

  /** Para de mandar. O que já foi continua sendo processado. */
  const stop = useCallback(() => {
    abort.current?.abort()
    void reloadContactImports()
  }, [])

  const reset = useCallback(() => {
    abort.current?.abort()
    request.current = null
    setState(NOT_SENT)
  }, [])

  return { state, send, resume, stop, reset }
}
