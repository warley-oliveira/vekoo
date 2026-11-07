import { createContext, useContext } from "react"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

import { blockEntry, isTrigger } from "@/lib/flows/catalog"
import { syncFieldRefs } from "@/lib/flows/fields"
import { arrangeBlocks, BLOCK_WIDTH, estimatedHeight, nudgeFree, placeAfter } from "@/lib/flows/layout"
import { blockOutputs, dedupeEdges, DEFAULT_OUTPUT, normalizeHandle } from "@/lib/flows/outputs"
import type { BlockData, FlowDefinition, FlowField } from "@/lib/flows/types"

// O estado do editor, fora do React. É o que permite arrastar um bloco ou digitar no inspetor sem
// redesenhar o quadro: cada bloco assina só o que é dele, e o xyflow compara os objetos por identidade,
// então mudar um bloco cria um objeto novo só para ele.
//
// Um store por fluxo aberto (nasce em `FlowEditor`). O histórico guarda referências: duas fotos em
// seguida dividem tudo o que não mudou, e por isso 100 passos de desfazer não pesam.

export type BlockNode = Node<BlockData, string>
export type LinkEdge = Edge

type Snapshot = {
  nodes: BlockNode[]
  edges: LinkEdge[]
  fields: FlowField[]
  basePrompt: string
}

const HISTORY_LIMIT = 100
const COALESCE_MS = 800

export type PickerRequest = {
  /** Saída de onde a pessoa puxou: o bloco novo nasce ligado a ela. */
  source?: { nodeId: string; handle: string }
  /** Onde abrir, em pixels da tela. Sem isso, abre no botão da barra. */
  screen?: { x: number; y: number }
  /** Onde o bloco nasce no quadro, quando quem pediu já sabe (soltar a linha no vazio). */
  flow?: { x: number; y: number }
}

export type EditorState = Snapshot & {
  /** O bloco que o inspetor mostra. Vários selecionados: nenhum. */
  selectedId: string | null
  selectionCount: number
  past: Snapshot[]
  future: Snapshot[]
  /** Sobe a cada alteração de conteúdo. O salvamento compara com o que já foi gravado. */
  revision: number
  /** Quantos blocos já foram excluídos. É o que dispara o "Desfazer" na tela. */
  deletions: number
  /** Saídas ligadas de cada bloco, "next|true". Um valor por bloco: é o que evita varrer as conexões. */
  outlets: Record<string, string>
  picker: PickerRequest | null
  clipboard: { nodes: BlockNode[]; edges: LinkEdge[] } | null

  onNodesChange: (changes: NodeChange<BlockNode>[]) => void
  onEdgesChange: (changes: EdgeChange<LinkEdge>[]) => void
  connect: (connection: Connection) => void
  startDrag: () => void
  endDrag: () => void
  addBlock: (type: string, options?: { position?: { x: number; y: number }; source?: { nodeId: string; handle: string } }) => string
  updateData: (id: string, patch: BlockData, options?: { coalesce?: string; renames?: Record<string, string> }) => void
  changeTrigger: (id: string, type: string) => void
  linkOutput: (sourceId: string, handle: string, targetId: string | null) => void
  deleteBlocks: (ids: string[]) => void
  duplicateBlocks: (ids: string[]) => string[]
  copySelection: () => number
  paste: (at?: { x: number; y: number }) => void
  selectBlock: (id: string | null) => void
  setFields: (fields: FlowField[]) => void
  setBasePrompt: (prompt: string) => void
  arrange: () => void
  replaceDefinition: (definition: FlowDefinition, options?: { track?: boolean }) => void
  undo: () => void
  redo: () => void
  openPicker: (request: PickerRequest) => void
  closePicker: () => void
  serialize: (viewport?: { x: number; y: number; zoom: number }) => FlowDefinition
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

/** O que o leitor de tela diz de cada peça: o xyflow só fala "node" e "edge" em inglês. */
export type EditorLabels = { block: string; link: string }

function toNodes(definition: FlowDefinition, labels: EditorLabels): BlockNode[] {
  return (definition.nodes ?? []).map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position ?? { x: 0, y: 0 },
    data: node.data ?? {},
    // O gatilho não sai: todo fluxo começa por um, e a pessoa troca qual é no inspetor.
    deletable: !isTrigger(node.type),
    domAttributes: { "aria-roledescription": labels.block },
    // O tamanho antes de medir. Com muitos blocos só o que está na tela existe no DOM, e sem isto o enquadramento
    // inicial não enxerga o resto do fluxo.
    initialWidth: BLOCK_WIDTH,
    initialHeight: estimatedHeight({ id: node.id, type: node.type, data: node.data, position: { x: 0, y: 0 } }),
  }))
}

function toEdges(definition: FlowDefinition, labels: EditorLabels): LinkEdge[] {
  return dedupeEdges(definition.edges ?? []).map((edge) => linkEdge(edge, labels))
}

function linkEdge(
  edge: { id: string; source: string; target: string; sourceHandle?: string | null; label?: string },
  labels: EditorLabels
): LinkEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: normalizeHandle(edge.sourceHandle),
    ...(edge.label ? { label: edge.label } : null),
    type: "link",
    ariaLabel: labels.link,
    domAttributes: { "aria-roledescription": labels.link },
  }
}

function outletsOf(edges: LinkEdge[]): Record<string, string> {
  const handles = new Map<string, string[]>()
  edges.forEach((edge) => {
    const list = handles.get(edge.source)
    const handle = normalizeHandle(edge.sourceHandle)
    if (list) list.push(handle)
    else handles.set(edge.source, [handle])
  })
  return Object.fromEntries(Array.from(handles, ([id, list]) => [id, list.sort().join("|")]))
}

export function createEditorStore(
  definition: FlowDefinition,
  labels: EditorLabels
): StoreApi<EditorState> {
  const initialEdges = toEdges(definition, labels)
  let lastCoalesce: { key: string; at: number } | null = null
  let dragSnapshot: Snapshot | null = null

  return createStore<EditorState>()((set, get) => {
    const snapshot = (): Snapshot => {
      const { nodes, edges, fields, basePrompt } = get()
      return { nodes, edges, fields, basePrompt }
    }

    const pushPast = (photo: Snapshot) => {
      const { past } = get()
      set({
        past: past.length >= HISTORY_LIMIT ? [...past.slice(1), photo] : [...past, photo],
        future: [],
      })
    }

    /** Antes de mexer no conteúdo. Com `coalesce`, várias teclas seguidas viram um passo só. */
    const track = (coalesce?: string) => {
      const now = Date.now()
      if (coalesce && lastCoalesce?.key === coalesce && now - lastCoalesce.at < COALESCE_MS) {
        lastCoalesce.at = now
        return
      }
      lastCoalesce = coalesce ? { key: coalesce, at: now } : null
      pushPast(snapshot())
    }

    const bump = () => get().revision + 1

    const restore = (photo: Snapshot) => {
      const { selectedId } = get()
      const exists = photo.nodes.some((node) => node.id === selectedId)
      set({
        ...photo,
        nodes: photo.nodes.map((node) => {
          const selected = node.id === selectedId
          return Boolean(node.selected) === selected ? node : { ...node, selected }
        }),
        outlets: outletsOf(photo.edges),
        selectedId: exists ? selectedId : null,
        selectionCount: exists ? 1 : 0,
        revision: bump(),
      })
      lastCoalesce = null
    }

    return {
      nodes: toNodes(definition, labels),
      edges: initialEdges,
      fields: definition.fields ?? [],
      basePrompt: definition.base_prompt ?? "",
      selectedId: null,
      selectionCount: 0,
      past: [],
      future: [],
      revision: 0,
      deletions: 0,
      outlets: outletsOf(initialEdges),
      picker: null,
      clipboard: null,

      onNodesChange: (changes) => {
        const removing = changes.some((change) => change.type === "remove")
        const selecting = changes.some((change) => change.type === "select")
        if (removing) track("delete")

        const nodes = applyNodeChanges(changes, get().nodes)
        if (!removing && !selecting) {
          set({ nodes })
          return
        }

        const selected = nodes.filter((node) => node.selected)
        set({
          nodes,
          selectedId: selected.length === 1 ? selected[0].id : null,
          selectionCount: selected.length,
          ...(removing
            ? {
                revision: bump(),
                deletions: get().deletions + changes.filter((change) => change.type === "remove").length,
              }
            : null),
        })
      },

      onEdgesChange: (changes) => {
        const removing = changes.some((change) => change.type === "remove")
        if (removing) track("delete")
        const edges = applyEdgeChanges(changes, get().edges)
        set(removing ? { edges, outlets: outletsOf(edges), revision: bump() } : { edges })
      },

      connect: (connection) => {
        if (connection.source === connection.target) return
        track()
        const handle = normalizeHandle(connection.sourceHandle)
        const kept = get().edges.filter(
          (edge) => !(edge.source === connection.source && normalizeHandle(edge.sourceHandle) === handle)
        )
        const edges = addEdge(
          { ...connection, ...linkEdge({ id: newId("link"), source: connection.source, target: connection.target, sourceHandle: handle }, labels) },
          kept
        )
        set({ edges, outlets: outletsOf(edges), revision: bump() })
      },

      startDrag: () => {
        dragSnapshot = snapshot()
      },

      endDrag: () => {
        if (!dragSnapshot) return
        const before = dragSnapshot
        dragSnapshot = null
        const moved = get().nodes.some((node, index) => {
          const previous = before.nodes[index]
          return previous && (previous.position.x !== node.position.x || previous.position.y !== node.position.y)
        })
        if (!moved) return
        lastCoalesce = null
        pushPast(before)
        set({ revision: bump() })
      },

      addBlock: (type, options = {}) => {
        const entry = blockEntry(type)
        const { nodes, edges } = get()
        const id = newId(type.replace(/_/g, "-"))
        const sourceNode = options.source ? nodes.find((node) => node.id === options.source?.nodeId) : undefined

        let position = options.position
        if (!position && sourceNode && options.source) {
          const outputs = blockOutputs(sourceNode.type ?? "", sourceNode.data)
          const index = outputs.findIndex((output) => output.id === options.source?.handle)
          position = placeAfter(sourceNode, nodes, Math.max(index, 0), outputs.length)
        }

        const node: BlockNode = {
          id,
          type,
          position: nudgeFree(position ?? { x: 0, y: 0 }, nodes),
          data: entry?.defaults() ?? {},
          selected: true,
          deletable: !isTrigger(type),
          domAttributes: { "aria-roledescription": labels.block },
        }

        track()
        const nextEdges = options.source
          ? [
              ...edges.filter(
                (edge) =>
                  !(edge.source === options.source?.nodeId && normalizeHandle(edge.sourceHandle) === options.source.handle)
              ),
              linkEdge(
                { id: newId("link"), source: options.source.nodeId, sourceHandle: options.source.handle, target: id },
                labels
              ),
            ]
          : edges

        set({
          nodes: [...nodes.map((other) => (other.selected ? { ...other, selected: false } : other)), node],
          edges: nextEdges,
          outlets: outletsOf(nextEdges),
          selectedId: id,
          selectionCount: 1,
          revision: bump(),
          picker: null,
        })
        return id
      },

      updateData: (id, patch, options = {}) => {
        const { nodes, edges } = get()
        const index = nodes.findIndex((node) => node.id === id)
        if (index === -1) return
        const node = nodes[index]
        const data = { ...node.data, ...patch }

        track(options.coalesce ?? `data:${id}:${Object.keys(patch).join(",")}`)

        const nextNodes = [...nodes]
        nextNodes[index] = { ...node, data }

        // Saída que sumiu leva a conexão junto; saída renomeada leva a conexão para o nome novo.
        const before = new Set(blockOutputs(node.type ?? "", node.data).map((output) => output.id))
        const after = new Set(blockOutputs(node.type ?? "", data).map((output) => output.id))
        const removed = [...before].filter((output) => !after.has(output) && !options.renames?.[output])

        if (removed.length > 0 || options.renames) {
          const nextEdges = edges
            .filter((edge) => !(edge.source === id && removed.includes(normalizeHandle(edge.sourceHandle))))
            .map((edge) => {
              const renamed = edge.source === id ? options.renames?.[normalizeHandle(edge.sourceHandle)] : undefined
              return renamed ? { ...edge, sourceHandle: renamed } : edge
            })
          set({ nodes: nextNodes, edges: nextEdges, outlets: outletsOf(nextEdges), revision: bump() })
          return
        }

        set({ nodes: nextNodes, revision: bump() })
      },

      changeTrigger: (id, type) => {
        const entry = blockEntry(type)
        track()
        set({
          nodes: get().nodes.map((node) =>
            node.id === id ? { ...node, type, data: { ...entry?.defaults(), label: undefined } } : node
          ),
          revision: bump(),
        })
      },

      linkOutput: (sourceId, handle, targetId) => {
        track()
        const kept = get().edges.filter(
          (edge) => !(edge.source === sourceId && normalizeHandle(edge.sourceHandle) === handle)
        )
        const edges = targetId
          ? [...kept, linkEdge({ id: newId("link"), source: sourceId, sourceHandle: handle, target: targetId }, labels)]
          : kept
        set({ edges, outlets: outletsOf(edges), revision: bump() })
      },

      deleteBlocks: (ids) => {
        const { nodes, edges, selectedId } = get()
        const removable = new Set(ids.filter((id) => nodes.find((node) => node.id === id)?.deletable !== false))
        if (removable.size === 0) return
        track()
        const nextEdges = edges.filter((edge) => !removable.has(edge.source) && !removable.has(edge.target))
        const nextNodes = nodes.filter((node) => !removable.has(node.id))
        const stillSelected = nextNodes.filter((node) => node.selected).length
        set({
          nodes: nextNodes,
          edges: nextEdges,
          outlets: outletsOf(nextEdges),
          selectedId: selectedId && removable.has(selectedId) ? null : selectedId,
          selectionCount: stillSelected,
          revision: bump(),
          deletions: get().deletions + removable.size,
        })
      },

      duplicateBlocks: (ids) => {
        const { nodes, edges } = get()
        const picked = nodes.filter((node) => ids.includes(node.id) && !isTrigger(node.type))
        if (picked.length === 0) return []
        track()
        const mapping = new Map(picked.map((node) => [node.id, newId((node.type ?? "bloco").replace(/_/g, "-"))]))
        const copies: BlockNode[] = picked.map((node) => ({
          ...node,
          id: mapping.get(node.id) as string,
          position: { x: node.position.x + 40, y: node.position.y + 48 },
          selected: true,
          data: structuredClone(node.data),
        }))
        // As conexões entre os copiados vão junto; as que saem do grupo, não.
        const copiedEdges = edges
          .filter((edge) => mapping.has(edge.source) && mapping.has(edge.target))
          .map((edge) => ({
            ...edge,
            id: newId("link"),
            source: mapping.get(edge.source) as string,
            target: mapping.get(edge.target) as string,
            selected: false,
          }))
        const nextEdges = [...edges, ...copiedEdges]
        set({
          nodes: [...nodes.map((node) => (node.selected ? { ...node, selected: false } : node)), ...copies],
          edges: nextEdges,
          outlets: outletsOf(nextEdges),
          selectedId: copies.length === 1 ? copies[0].id : null,
          selectionCount: copies.length,
          revision: bump(),
        })
        return copies.map((node) => node.id)
      },

      copySelection: () => {
        const { nodes, edges } = get()
        const picked = nodes.filter((node) => node.selected && !isTrigger(node.type))
        if (picked.length === 0) return 0
        const ids = new Set(picked.map((node) => node.id))
        set({
          clipboard: {
            nodes: picked,
            edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
          },
        })
        return picked.length
      },

      paste: (at) => {
        const { clipboard, nodes, edges } = get()
        if (!clipboard) return
        track()
        const left = Math.min(...clipboard.nodes.map((node) => node.position.x))
        const top = Math.min(...clipboard.nodes.map((node) => node.position.y))
        const origin = at ?? { x: left + 48, y: top + 48 }
        const mapping = new Map(clipboard.nodes.map((node) => [node.id, newId((node.type ?? "bloco").replace(/_/g, "-"))]))
        const copies: BlockNode[] = clipboard.nodes.map((node) => ({
          ...node,
          id: mapping.get(node.id) as string,
          position: { x: origin.x + node.position.x - left, y: origin.y + node.position.y - top },
          selected: true,
          data: structuredClone(node.data),
        }))
        const copiedEdges = clipboard.edges.map((edge) => ({
          ...edge,
          id: newId("link"),
          source: mapping.get(edge.source) as string,
          target: mapping.get(edge.target) as string,
          selected: false,
        }))
        const nextEdges = [...edges, ...copiedEdges]
        set({
          nodes: [...nodes.map((node) => (node.selected ? { ...node, selected: false } : node)), ...copies],
          edges: nextEdges,
          outlets: outletsOf(nextEdges),
          selectedId: copies.length === 1 ? copies[0].id : null,
          selectionCount: copies.length,
          revision: bump(),
        })
      },

      selectBlock: (id) => {
        set({
          nodes: get().nodes.map((node) => {
            const selected = node.id === id
            return Boolean(node.selected) === selected ? node : { ...node, selected }
          }),
          edges: get().edges.some((edge) => edge.selected)
            ? get().edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge))
            : get().edges,
          selectedId: id,
          selectionCount: id ? 1 : 0,
        })
      },

      setFields: (fields) => {
        track("fields")
        set({ fields, revision: bump() })
      },

      setBasePrompt: (basePrompt) => {
        track()
        set({ basePrompt, revision: bump() })
      },

      arrange: () => {
        track()
        set({ nodes: arrangeBlocks(get().nodes, get().edges), revision: bump() })
      },

      replaceDefinition: (next, options = {}) => {
        if (options.track) track()
        const edges = toEdges(next, labels)
        set({
          nodes: toNodes(next, labels),
          edges,
          fields: next.fields ?? [],
          basePrompt: next.base_prompt ?? "",
          outlets: outletsOf(edges),
          selectedId: null,
          selectionCount: 0,
          ...(options.track ? { revision: bump() } : { past: [], future: [] }),
        })
      },

      undo: () => {
        const { past, future } = get()
        const photo = past[past.length - 1]
        if (!photo) return
        const current = snapshot()
        set({ past: past.slice(0, -1), future: [...future, current] })
        restore(photo)
      },

      redo: () => {
        const { past, future } = get()
        const photo = future[future.length - 1]
        if (!photo) return
        const current = snapshot()
        set({ future: future.slice(0, -1), past: [...past, current] })
        restore(photo)
      },

      openPicker: (picker) => set({ picker }),
      closePicker: () => set({ picker: null }),

      serialize: (viewport) => {
        const { nodes, edges, fields, basePrompt } = get()
        const savedFields = fields.filter((field) => field.key)
        const plainNodes = nodes.map((node) => ({
          id: node.id,
          type: node.type ?? "send_text",
          position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
          data: node.data,
        }))
        return {
          nodes: syncFieldRefs(plainNodes, savedFields),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle ?? DEFAULT_OUTPUT,
            ...(typeof edge.label === "string" && edge.label ? { label: edge.label } : null),
          })),
          viewport: viewport ?? { x: 0, y: 0, zoom: 1 },
          fields: savedFields,
          base_prompt: basePrompt,
        }
      },
    }
  })
}

export const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null)

export function useEditorApi(): StoreApi<EditorState> {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error("useEditor fora de FlowEditor")
  return store
}

/** Assina só o pedaço pedido: quem lê `selectedId` não redesenha quando um bloco é arrastado. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorApi(), selector)
}
