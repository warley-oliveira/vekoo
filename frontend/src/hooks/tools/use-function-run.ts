import { useCallback, useEffect, useRef, useState } from "react"

import type { CodeRunResult } from "@/components/code-editor"
import { runToolTest } from "@/hooks/flows/use-flow-references"
import { ApiError } from "@/lib/api"

/**
 * Testar uma função: enfileira e consulta até sair o resultado. Sair da tela ou cancelar para de consultar; o script
 * que já estava rodando termina do lado de lá, porque o motor não tem como interromper por fora.
 */
export function useFunctionRun(failedMessage: string) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CodeRunResult | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const run = useCallback(
    async (id: string, args: Record<string, unknown>, chatId?: string | null) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      setRunning(true)
      setResult(null)
      try {
        const latest = await runToolTest(id, args, chatId, current.signal)
        if (!current.signal.aborted) setResult(latest)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setResult({ status: "failed", error: error instanceof ApiError ? error.message : failedMessage })
      } finally {
        if (controller.current === current) setRunning(false)
      }
    },
    [failedMessage]
  )

  const cancel = useCallback(() => {
    controller.current?.abort()
    setRunning(false)
  }, [])

  return { running, result, run, cancel, setResult }
}
