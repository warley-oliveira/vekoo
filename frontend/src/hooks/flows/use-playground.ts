import { useCallback, useEffect, useRef, useState } from "react"

import { useChannel } from "@/hooks/use-channel"
import { apiDelete, apiPost, ApiError } from "@/lib/api"
import type { PlaygroundMessage } from "@/lib/flows/types"

// O teste do editor: `POST playground`, assinar `FlowPlaygroundChannel` e só então `run`, para não perder os
// primeiros eventos. A conversa é de mentira (nada sai pelo canal), mas o modelo e as funções são de verdade.

export type TestStatus = "idle" | "starting" | "running" | "waiting" | "waitingTime" | "completed" | "failed" | "stopped"

export type TestItem =
  | { id: string; kind: "user"; text: string; at: number }
  | { id: string; kind: "bot"; text: string; sender?: string | null; at: number }
  | { id: string; kind: "media"; url: string | null; attachmentId: string | null; caption: string | null; at: number }
  | { id: string; kind: "options"; text: string; options: { id: string; title: string }[]; at: number }
  | { id: string; kind: "note"; tone: "info" | "warning" | "danger" | "success"; code: string; params?: Record<string, unknown>; at: number }
  | {
      id: string
      kind: "tool"
      name: string
      native: boolean
      input: unknown
      output: unknown
      error: string | null
      simulated: boolean
      durationMs: number
      at: number
    }

export type TestStep = {
  id: string
  nodeId: string
  nodeType: string
  status: "success" | "suspended" | "error" | "decision"
  durationMs?: number
  error?: string
  decision?: { label: string | null; reason: string | null; stay: boolean; turn: number | null }
}

let sequence = 0
const nextId = () => `t${(sequence += 1)}`

type Handlers = {
  onEnter: (nodeId: string) => void
  onComplete: (nodeId: string, status: "success" | "suspended" | "error") => void
  onFinish: () => void
  onReset: () => void
}

export function usePlayground(flowId: string, handlers: Handlers) {
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [status, setStatus] = useState<TestStatus>("idle")
  const [items, setItems] = useState<TestItem[]>([])
  const [steps, setSteps] = useState<TestStep[]>([])
  const [variables, setVariables] = useState<Record<string, unknown>>({})

  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  const pushItem = useCallback((item: TestItem) => setItems((current) => [...current, item]), [])
  const note = useCallback(
    (tone: "info" | "warning" | "danger" | "success", code: string, params?: Record<string, unknown>) =>
      pushItem({ id: nextId(), kind: "note", tone, code, params, at: Date.now() }),
    [pushItem]
  )

  const handleMessage = useCallback(
    (message: PlaygroundMessage) => {
      const at = Date.now()
      switch (message.kind) {
        case "node_entered":
          setStatus("running")
          handlersRef.current.onEnter(message.nodeId)
          break
        case "node_completed":
          handlersRef.current.onComplete(message.nodeId, message.status)
          setSteps((current) => [
            ...current,
            {
              id: nextId(),
              nodeId: message.nodeId,
              nodeType: message.nodeType,
              status: message.status,
              durationMs: message.durationMs,
              error: message.error,
            },
          ])
          break
        case "text":
          pushItem({ id: nextId(), kind: "bot", text: message.body, sender: message.sender, at })
          break
        case "media":
          pushItem({ id: nextId(), kind: "media", url: message.url, attachmentId: message.attachmentId, caption: message.caption, at })
          break
        case "event": {
          const payload = message.payload ?? {}
          if (message.name === "interactive_sent") {
            pushItem({
              id: nextId(),
              kind: "options",
              text: String(payload.text ?? ""),
              options: (payload.buttons as { id: string; title: string }[]) ?? [],
              at,
            })
          } else if (message.name === "template_sent") {
            note("info", "templateSent", { name: payload.name })
          } else if (message.name === "pipeline_skipped") {
            note("warning", "pipelineSkipped", { type: payload.type })
          } else if (message.name === "attachment_missing") {
            const reasons = (payload.reasons as string[] | undefined) ?? []
            note("warning", "attachmentMissing", { reason: reasons.join("; ") })
          } else {
            note("info", "event", { name: message.name })
          }
          break
        }
        case "ai_decision": {
          const stay = message.decision === "stay"
          setSteps((current) => [
            ...current,
            {
              id: nextId(),
              nodeId: message.nodeId,
              nodeType: "ai_assistant",
              status: "decision",
              decision: { label: message.label, reason: message.reason, stay, turn: message.turn },
            },
          ])
          if (!stay) {
            note("success", "aiLeft", { name: message.label ?? message.decision, reason: message.reason ?? "" })
          }
          break
        }
        case "tool_call":
          pushItem({
            id: nextId(),
            kind: "tool",
            name: message.name,
            native: message.native,
            input: message.input,
            output: message.output,
            error: message.error,
            simulated: message.simulated,
            durationMs: message.durationMs,
            at,
          })
          break
        case "variables":
          setVariables(message.variables ?? {})
          break
        case "suspended":
          setStatus(message.status === "waiting" ? "waitingTime" : "waiting")
          if (message.status === "waiting") note("info", "waitingTime")
          break
        case "completed":
          setStatus("completed")
          handlersRef.current.onFinish()
          note("success", "completed")
          break
        case "failed":
          setStatus("failed")
          handlersRef.current.onFinish()
          note("danger", "failed", { message: message.message ?? "" })
          break
        case "stopped":
          setStatus("stopped")
          handlersRef.current.onFinish()
          note("info", "stopped")
          break
        case "user_message":
          break
        default:
          break
      }
    },
    [note, pushItem]
  )

  const { connected } = useChannel<PlaygroundMessage>(
    executionId ? "FlowPlaygroundChannel" : null,
    executionId ? { executionId } : undefined,
    handleMessage
  )

  // Só depois de o canal confirmar: é o que garante os primeiros eventos.
  const ranFor = useRef<string | null>(null)
  useEffect(() => {
    if (!connected || !executionId || ranFor.current === executionId) return
    ranFor.current = executionId
    setStatus("running")
    apiPost(`/flows/${flowId}/playground/${executionId}/run`).catch(() => {
      setStatus("failed")
      note("danger", "startFailed")
    })
  }, [connected, executionId, flowId, note])

  const start = useCallback(async () => {
    setItems([])
    setSteps([])
    setVariables({})
    setStatus("starting")
    handlersRef.current.onReset()
    try {
      const response = await apiPost<{ executionId: string }>(`/flows/${flowId}/playground`, { useDraft: true })
      setExecutionId(response.executionId)
    } catch {
      setStatus("failed")
      note("danger", "startFailed")
    }
  }, [flowId, note])

  const send = useCallback(
    async (text: string) => {
      if (!executionId) return false
      pushItem({ id: nextId(), kind: "user", text, at: Date.now() })
      setStatus("running")
      try {
        await apiPost(`/flows/${flowId}/playground/${executionId}/message`, { text })
        return true
      } catch (error) {
        setStatus("waiting")
        note(
          "warning",
          error instanceof ApiError && error.code === "notWaiting" ? "notWaiting" : "sendFailed"
        )
        return false
      }
    },
    [executionId, flowId, note, pushItem]
  )

  const stop = useCallback(async () => {
    if (!executionId) return
    await apiDelete(`/flows/${flowId}/playground/${executionId}`).catch(() => undefined)
  }, [executionId, flowId])

  return { executionId, status, items, steps, variables, connected, start, send, stop }
}
