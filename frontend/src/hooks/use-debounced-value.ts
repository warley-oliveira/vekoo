import { useEffect, useMemo, useRef, useState } from "react"

/** O valor só muda depois de `delay` ms sem novidade. Para busca sobre a API. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

export type DebouncedCallback<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void
  /** Executa já a chamada pendente, se houver. */
  flush: () => void
}

/** A função só roda depois de `delay` ms sem nova chamada; é cancelada ao desmontar. */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay = 300
): DebouncedCallback<Args> {
  const latest = useRef(callback)
  useEffect(() => {
    latest.current = callback
  })

  const debounced = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending: Args | undefined

    const run = (...args: Args) => {
      pending = args
      clearTimeout(timer)
      timer = setTimeout(() => {
        pending = undefined
        latest.current(...args)
      }, delay)
    }
    run.cancel = () => {
      clearTimeout(timer)
      pending = undefined
    }
    run.flush = () => {
      clearTimeout(timer)
      if (pending) {
        const args = pending
        pending = undefined
        latest.current(...args)
      }
    }
    return run
  }, [delay])

  useEffect(() => debounced.cancel, [debounced])

  return debounced
}
