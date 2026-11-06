import { useCallback, useMemo, useSyncExternalStore } from "react"

import { safeLocalStorage } from "@/lib/safe-local-storage"

// Componentes com a mesma chave ficam em dia, nesta aba e nas outras. O que não
// couber no storage segue valendo em memória até recarregar a página.

const memory = new Map<string, string | null>()
const subscribers = new Map<string, Set<() => void>>()

function notify(key: string) {
  subscribers.get(key)?.forEach((listener) => listener())
}

function readRaw(key: string): string | null {
  return memory.has(key) ? (memory.get(key) ?? null) : safeLocalStorage.getItem(key)
}

function writeRaw(key: string, raw: string | null) {
  memory.set(key, raw)
  if (raw === null) safeLocalStorage.removeItem(key)
  else safeLocalStorage.setItem(key, raw)
  notify(key)
}

function subscribe(key: string, listener: () => void) {
  const listeners = subscribers.get(key) ?? new Set()
  listeners.add(listener)
  subscribers.set(key, listeners)

  const onStorage = (event: StorageEvent) => {
    // `key` nulo é o `localStorage.clear()` de outra aba.
    if (event.key === key || event.key === null) {
      memory.delete(key)
      listener()
    }
  }
  window.addEventListener("storage", onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    // Valor antigo ou corrompido não pode derrubar a tela.
    return fallback
  }
}

/** Estado persistido em JSON. A terceira posição apaga a chave e volta ao padrão. */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (next: T | ((current: T) => T)) => void, () => void] {
  const raw = useSyncExternalStore(
    useCallback((listener) => subscribe(key, listener), [key]),
    () => readRaw(key)
  )
  // O padrão costuma ser um literal novo a cada render, então só a chave e o texto
  // gravado decidem quando reinterpretar.
  const value = useMemo(() => parse(raw, defaultValue), [raw, key])

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = parse(readRaw(key), defaultValue)
      const resolved =
        typeof next === "function" ? (next as (current: T) => T)(current) : next
      writeRaw(key, JSON.stringify(resolved))
    },
    [key]
  )

  const remove = useCallback(() => writeRaw(key, null), [key])

  return [value, setValue, remove]
}
