import { useMemo } from "react"
import { useSearchParams } from "react-router"

import { FlowEditor } from "@/components/flows/editor/flow-editor"
import { useFullBleed } from "@/hooks/use-app-shell"
import type { DefinitionEdge, DefinitionNode, FlowDetail } from "@/lib/flows/types"

// Só em desenvolvimento: um fluxo grande de mentira, sem salvar nada, para medir o editor. `?blocks=100`.
// Abra, arraste um bloco, digite no inspetor e leia `window.__flowRenders` no console: é a contagem de renders de
// cada bloco, que precisa subir só no bloco mexido.

function bigFlow(count: number): FlowDetail {
  const nodes: DefinitionNode[] = [
    { id: "start", type: "trigger_message_received", position: { x: 0, y: 0 }, data: {} },
  ]
  const edges: DefinitionEdge[] = []

  let previous = "start"
  for (let index = 1; index < count; index += 1) {
    const id = `b${index}`
    const column = (index - 1) % 10
    const row = Math.floor((index - 1) / 10)
    const isCondition = index % 7 === 0
    nodes.push({
      id,
      type: isCondition ? "condition" : "send_text",
      position: { x: 360 + column * 360, y: row * 220 },
      data: isCondition
        ? { match: "all", rules: [{ field: "message.text", operator: "contains", value: "sim" }] }
        : { text: `Mensagem ${index}: olá, {{contact.name}}!` },
    })
    edges.push({ id: `e${index}`, source: previous, target: id, sourceHandle: previous.startsWith("b") && Number(previous.slice(1)) % 7 === 0 ? "true" : "next" })
    previous = id
  }

  const definition = { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
  const version = { id: "demo", versionNumber: 1, definition, publishedAt: null, updatedAt: 0 }
  return {
    id: "demo",
    name: `Medição com ${count} blocos`,
    description: null,
    status: "draft",
    triggerType: "message_received",
    connectorFilter: { connectorIds: [] },
    published: false,
    updatedAt: 0,
    createdAt: 0,
    draft: version,
    publishedVersion: null,
  }
}

export default function FlowPerfPage() {
  useFullBleed(true)
  const [params] = useSearchParams()
  const count = Number(params.get("blocks") ?? 100)
  const flow = useMemo(() => bigFlow(count), [count])
  return <FlowEditor key={count} flow={flow} reload={async () => undefined} demo />
}
