import { useCallback, useEffect, useMemo, useRef, type DragEvent } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type NodeTypes,
  type OnConnectEnd,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useTranslation } from "react-i18next"

import { BLOCK_CATALOG } from "@/lib/flows/catalog"
import { BLOCK_WIDTH, FIT_OPTIONS } from "@/lib/flows/layout"

import { BLOCK_DRAG_TYPE } from "./block-picker"
import { CanvasToolbar } from "./canvas-toolbar"
import { FlowBlock } from "./flow-block"
import { LinkEdgeView } from "./link-edge"
import { useEditor, useEditorApi, type BlockNode, type LinkEdge } from "./store"
import { useEditorUi } from "./ui-store"
import "../flow-tokens.css"
import "./flows.css"

// O quadro. As peças do xyflow vêm prontas para um quadro grande: cada bloco e cada linha são memorizados
// por identidade, então o que importa aqui é não criar objetos novos a cada render. Tudo o que vai para
// o `ReactFlow` é constante do módulo ou callback estável.

// Um mapa por tipo, feito uma vez: o xyflow reclama de `nodeTypes` novo a cada render.
const NODE_TYPES: NodeTypes = Object.fromEntries(BLOCK_CATALOG.map((entry) => [entry.type, FlowBlock]))
const EDGE_TYPES = { link: LinkEdgeView }
const DEFAULT_EDGE_OPTIONS = {
  type: "link",
  markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--flow-line)" },
}
const SNAP_GRID: [number, number] = [8, 8]
const DELETE_KEYS = ["Backspace", "Delete"]
const MULTI_SELECT_KEYS = ["Meta", "Control", "Shift"]

/** Quantos blocos antes de só desenhar o que está na tela. Abaixo disso, não compensa o custo de montar ao rolar. */
const VIRTUALIZE_FROM = 80
const MINIMAP_FROM = 12
/** O inspetor e a folga para o "+" do bloco: o que está selecionado não fica escondido atrás dele. */
const INSPECTOR_SPACE = 470

export function FlowCanvas() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const reactFlow = useReactFlow<BlockNode, LinkEdge>()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const nodes = useEditor((state) => state.nodes)
  const edges = useEditor((state) => state.edges)
  const readOnly = useEditor((state) => state.readOnly)
  const selectedId = useEditor((state) => state.selectedId)
  const onNodesChange = useEditor((state) => state.onNodesChange)
  const onEdgesChange = useEditor((state) => state.onEdgesChange)
  const startDrag = useEditor((state) => state.startDrag)
  const endDrag = useEditor((state) => state.endDrag)
  const connect = useEditor((state) => state.connect)

  const ariaLabels = useMemo(
    () => ({
      "node.a11yDescription.default": t("flows.canvas.a11y.block"),
      "node.a11yDescription.keyboardDisabled": t("flows.canvas.a11y.blockMove"),
      "node.a11yDescription.ariaLiveMessage": ({ direction }: { direction: string; x: number; y: number }) =>
        t(`flows.canvas.a11y.moved_${direction}`, { defaultValue: t("flows.canvas.a11y.moved") }),
      "edge.a11yDescription.default": t("flows.canvas.a11y.link"),
      "controls.ariaLabel": t("flows.canvas.a11y.controls"),
      "minimap.ariaLabel": t("flows.canvas.a11y.minimap"),
      "handle.ariaLabel": t("flows.canvas.a11y.handle"),
    }),
    [t]
  )

  // O centro do que está na tela: é onde nasce um bloco escolhido pela barra.
  useEffect(() => {
    useEditorUi.setState({
      canvasCenter: () => {
        const rect = wrapperRef.current?.getBoundingClientRect()
        if (!rect) return { x: 0, y: 0 }
        const position = reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        return { x: position.x - BLOCK_WIDTH / 2, y: position.y - 40 }
      },
    })
    return () => useEditorUi.setState({ canvasCenter: null })
  }, [reactFlow])

  // Selecionou um bloco que ficaria atrás do inspetor: desliza o quadro, sem mudar o zoom.
  useEffect(() => {
    if (!selectedId || readOnly) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    const node = reactFlow.getNode(selectedId)
    if (!rect || !node || rect.width < 900) return
    const { x, y, zoom } = reactFlow.getViewport()
    const right = rect.left + x + (node.position.x + (node.measured?.width ?? BLOCK_WIDTH)) * zoom
    const limit = rect.right - INSPECTOR_SPACE
    if (right > limit) void reactFlow.setViewport({ x: x - (right - limit), y, zoom }, { duration: 200 })
  }, [reactFlow, readOnly, selectedId])

  const isValidConnection = useCallback(
    (connection: Connection | LinkEdge) => connection.source !== connection.target,
    []
  )

  // Soltou a linha no vazio: oferece o próximo bloco, ali mesmo.
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return
      const point = "changedTouches" in event ? event.changedTouches[0] : event
      if (!point) return
      api.getState().openPicker({
        source: { nodeId: state.fromNode.id, handle: state.fromHandle.id ?? "next" },
        screen: { x: point.clientX + 8, y: point.clientY - 24 },
        flow: reactFlow.screenToFlowPosition({ x: point.clientX, y: point.clientY - 30 }),
      })
    },
    [api, reactFlow]
  )

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      const type = event.dataTransfer.getData(BLOCK_DRAG_TYPE)
      if (!type) return
      event.preventDefault()
      api.getState().addBlock(type, {
        position: reactFlow.screenToFlowPosition({ x: event.clientX - BLOCK_WIDTH / 2, y: event.clientY - 30 }),
      })
    },
    [api, reactFlow]
  )

  const onPaneClick = useCallback(() => {
    api.getState().closePicker()
  }, [api])

  const onInit = useCallback(() => {
    void reactFlow.fitView(FIT_OPTIONS)
  }, [reactFlow])

  return (
    <div
      ref={wrapperRef}
      className="flow-canvas relative size-full"
      data-readonly={readOnly}
      onDragOver={readOnly ? undefined : onDragOver}
      onDrop={readOnly ? undefined : onDrop}
    >
      <ReactFlow<BlockNode, LinkEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.Bezier}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeDragStart={startDrag}
        onNodeDragStop={endDrag}
        onSelectionDragStart={startDrag}
        onSelectionDragStop={endDrag}
        onPaneClick={onPaneClick}
        onInit={onInit}
        minZoom={0.2}
        maxZoom={1.5}
        snapToGrid
        snapGrid={SNAP_GRID}
        // Arrastar não abre o inspetor: abrir é um clique, e mover é outra intenção.
        selectNodesOnDrag={false}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={false}
        deleteKeyCode={readOnly ? null : DELETE_KEYS}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        selectionKeyCode="Shift"
        onlyRenderVisibleElements={nodes.length >= VIRTUALIZE_FROM}
        ariaLabelConfig={ariaLabels}
        proOptions={{ hideAttribution: true }}
        panOnScroll={false}
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
        {nodes.length >= MINIMAP_FROM ? (
          <MiniMap
            position="bottom-left"
            style={{ marginBottom: 72 }}
            pannable
            zoomable
            nodeBorderRadius={6}
            nodeStrokeWidth={0}
            nodeColor="var(--muted-foreground)"
            maskColor="color-mix(in oklch, var(--muted) 60%, transparent)"
            className="hidden overflow-hidden rounded-xl border lg:block"
          />
        ) : null}
        <Panel position="bottom-left">
          <CanvasToolbar />
        </Panel>
      </ReactFlow>
    </div>
  )
}
