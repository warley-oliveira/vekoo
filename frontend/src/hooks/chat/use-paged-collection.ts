import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

// A engrenagem das duas listas do chat: páginas, eventos do socket e o recorte atual.
//
// Não usa `useSWRInfinite`, e isso foi uma escolha (ver DECISÕES no relatório): alterar o cache
// dele com uma busca no ar faz o SWR descartar o resultado dela, e a origem precisava de uma
// fila de eventos, de `isPaused` por recorte e de regravar o cache página por página para a
// lista não travar nem "ressuscitar" conversa. Aqui a lista é só estado. As regras são as
// mesmas: o evento vale na hora; se há busca no ar, ele é reaplicado por cima do que ela trouxer.

export type CollectionPage<T> = { items: T[]; hasMore: boolean }

export type CollectionSnapshot<T> = { items: T[]; page: number; hasMore: boolean }

export type CollectionCache<T> = Map<string, CollectionSnapshot<T>>

type CollectionState<T> = CollectionSnapshot<T> & {
  /** A primeira página deste recorte ainda não chegou. */
  loading: boolean
  /** Buscando por trás de dados que já estão na tela. */
  revalidating: boolean
  loadingMore: boolean
  error: unknown
  moreError: unknown
}

type Change<T> = (items: T[], context: { hasMore: boolean }) => T[]

export type UsePagedCollectionOptions<T> = {
  /** Muda quando o recorte muda: recomeça a lista. */
  signature: string
  /** Fora do componente: é o que faz voltar a um recorte, ou à tela, ser instantâneo. */
  cache: CollectionCache<T>
  fetchPage: (page: number, signal: AbortSignal) => Promise<CollectionPage<T>>
  idOf: (item: T) => string
  /** A chave de ordenação (última mensagem), do mais alto para o mais baixo. */
  orderOf: (item: T) => number
}

const MAX_CACHED_QUERIES = 8

function dedupe<T>(items: T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const id = idOf(item)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * A primeira página nova sobre o que já estava carregado. Dentro da janela dela, o servidor é a
 * verdade; o que era de páginas seguintes fica, menos o que subiu para a janela.
 */
function reconcileFirstPage<T>(
  current: T[],
  fresh: CollectionPage<T>,
  currentHasMore: boolean,
  idOf: (item: T) => string,
  orderOf: (item: T) => number
): { items: T[]; hasMore: boolean } {
  const freshIds = new Set(fresh.items.map(idOf))
  const lastOrder = fresh.items.length > 0 ? orderOf(fresh.items[fresh.items.length - 1]) : Infinity
  const older = fresh.hasMore
    ? current.filter((item) => !freshIds.has(idOf(item)) && orderOf(item) <= lastOrder)
    : []

  return {
    items: [...fresh.items, ...older],
    hasMore: older.length > 0 ? currentHasMore : fresh.hasMore,
  }
}

export function usePagedCollection<T>(options: UsePagedCollectionOptions<T>) {
  const { signature, cache } = options

  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })

  const [state, setState] = useState<CollectionState<T>>(() => {
    const cached = cache.get(signature)
    return {
      items: cached?.items ?? [],
      page: cached?.page ?? 0,
      hasMore: cached?.hasMore ?? false,
      loading: !cached,
      revalidating: Boolean(cached),
      loadingMore: false,
      error: null,
      moreError: null,
    }
  })

  // O valor mais novo, para evento e resposta nunca decidirem com o estado de um render atrás.
  const current = useRef(state)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const inFlight = useRef(0)
  const replay = useRef<Change<T>[]>([])
  const signatureRef = useRef(signature)

  const commit = useCallback(
    (next: CollectionState<T>) => {
      current.current = next
      setState(next)

      // Enquanto a primeira página não vem, a tela mostra a lista do recorte anterior: ela não
      // pode ficar guardada como se fosse a deste.
      if (next.loading) return

      cache.delete(signatureRef.current)
      cache.set(signatureRef.current, {
        items: next.items,
        page: next.page,
        hasMore: next.hasMore,
      })
      if (cache.size > MAX_CACHED_QUERIES) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
    },
    [cache]
  )

  const settle = useCallback(() => {
    inFlight.current -= 1
    if (inFlight.current <= 0) {
      inFlight.current = 0
      replay.current = []
    }
  }, [])

  const applyReplay = useCallback((items: T[], hasMore: boolean) => {
    return replay.current.reduce((list, change) => change(list, { hasMore }), items)
  }, [])

  const fetchFirstPage = useCallback(
    async (mode: "replace" | "reconcile") => {
      const run = generation.current
      const signal = controller.current?.signal ?? new AbortController().signal
      inFlight.current += 1

      try {
        const fresh = await latest.current.fetchPage(1, signal)
        if (run !== generation.current) return

        const { idOf, orderOf } = latest.current
        const before = current.current
        const merged =
          mode === "reconcile"
            ? reconcileFirstPage(before.items, fresh, before.hasMore, idOf, orderOf)
            : fresh

        commit({
          ...before,
          items: dedupe(applyReplay(merged.items, merged.hasMore), idOf),
          hasMore: merged.hasMore,
          page: mode === "reconcile" ? Math.max(before.page, 1) : 1,
          loading: false,
          revalidating: false,
          error: null,
        })
      } catch (error) {
        if (run !== generation.current) return
        commit({ ...current.current, loading: false, revalidating: false, error })
      } finally {
        if (run === generation.current) settle()
      }
    },
    [applyReplay, commit, settle]
  )

  // Recorte novo: a lista anterior fica na tela até a nova chegar, sem piscar um vazio. Recorte
  // já visitado volta na hora, e a primeira página é conferida por trás.
  useEffect(() => {
    generation.current += 1
    controller.current?.abort()
    controller.current = new AbortController()
    inFlight.current = 0
    replay.current = []
    signatureRef.current = signature

    const cached = cache.get(signature)
    const base = current.current
    commit({
      items: cached?.items ?? base.items,
      page: cached?.page ?? 0,
      hasMore: cached?.hasMore ?? false,
      loading: !cached,
      revalidating: Boolean(cached),
      loadingMore: false,
      error: null,
      moreError: null,
    })

    void fetchFirstPage(cached ? "reconcile" : "replace")

    return () => {
      generation.current += 1
      controller.current?.abort()
    }
    // `commit` e `fetchFirstPage` são estáveis; `cache` também, vem de fora do componente.
  }, [cache, commit, fetchFirstPage, signature])

  const loadMore = useCallback(async () => {
    const before = current.current
    if (!before.hasMore || before.loadingMore || before.loading) return

    const run = generation.current
    const signal = controller.current?.signal ?? new AbortController().signal
    inFlight.current += 1
    commit({ ...before, loadingMore: true, moreError: null })

    try {
      const fresh = await latest.current.fetchPage(before.page + 1, signal)
      if (run !== generation.current) return

      const { idOf } = latest.current
      const now = current.current
      commit({
        ...now,
        items: dedupe(applyReplay([...now.items, ...fresh.items], fresh.hasMore), idOf),
        page: before.page + 1,
        hasMore: fresh.hasMore,
        loadingMore: false,
        moreError: null,
      })
    } catch (error) {
      if (run !== generation.current) return
      commit({ ...current.current, loadingMore: false, moreError: error })
    } finally {
      if (run === generation.current) settle()
    }
  }, [applyReplay, commit, settle])

  /** Mudança vinda de fora (socket). Vale agora e, com busca no ar, de novo por cima dela. */
  const update = useCallback(
    (change: Change<T>) => {
      const before = current.current
      if (inFlight.current > 0) replay.current.push(change)

      const items = change(before.items, { hasMore: before.hasMore })
      if (items !== before.items) commit({ ...before, items })
    },
    [commit]
  )

  /** Confere a primeira página, sem mexer no que já foi carregado depois dela. */
  const revalidateFirstPage = useCallback(() => {
    const before = current.current
    if (before.loading || before.revalidating) return
    commit({ ...before, revalidating: true })
    void fetchFirstPage("reconcile")
  }, [commit, fetchFirstPage])

  /** O botão de tentar de novo: a primeira página ou a seguinte, conforme o que falhou. */
  const retry = useCallback(() => {
    const before = current.current
    if (before.moreError) {
      void loadMore()
      return
    }
    commit({ ...before, loading: before.items.length === 0, error: null })
    void fetchFirstPage(before.items.length === 0 ? "replace" : "reconcile")
  }, [commit, fetchFirstPage, loadMore])

  return { ...state, loadMore, update, revalidateFirstPage, retry }
}

/**
 * Agrupa pedidos de conferir a lista: uma rajada de eventos vira uma requisição só. Espera o
 * silêncio, mas sem passar do teto: debounce puro nunca disparava em organização movimentada.
 */
export function createCoalescer(run: () => void, waitMs = 1200, maxWaitMs = 5000) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstAt = 0

  const fire = () => {
    timer = null
    firstAt = 0
    run()
  }

  return {
    schedule() {
      const now = Date.now()
      if (!firstAt) firstAt = now
      if (timer) clearTimeout(timer)
      timer = setTimeout(fire, Math.min(waitMs, Math.max(0, firstAt + maxWaitMs - now)))
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      firstAt = 0
    },
  }
}
