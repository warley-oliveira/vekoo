import { useCallback, useEffect, useMemo, useRef, type DragEvent } from "react"
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  getViewportForBounds,
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

import { useIsMobile } from "@/hooks/use-is-mobile"
import { BLOCK_CATALOG, isTrigger } from "@/lib/flows/catalog"
import { BLOCK_BASE_HEIGHT, BLOCK_WIDTH, FIT_OPTIONS, READABLE_ZOOM } from "@/lib/flows/layout"
import { useResolvedTheme } from "@/lib/theme"

import { BLOCK_DRAG_TYPE } from "./block-picker"
import { CanvasToolbar } from "./canvas-toolbar"
import { FlowBlock } from "./flow-block"
import { motionMs } from "./keys"
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
const MIN_ZOOM = 0.2
/** A folga à esquerda do primeiro bloco, quando o fluxo abre no começo. */
const OPEN_MARGIN = 56

export function FlowCanvas() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const reactFlow = useReactFlow<BlockNode, LinkEdge>()
  const isMobile = useIsMobile()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()

  const nodes = useEditor((state) => state.nodes)
  const edges = useEditor((state) => state.edges)
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
    if (!selectedId) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    const node = reactFlow.getNode(selectedId)
    if (!rect || !node || rect.width < 900) return
    const { x, y, zoom } = reactFlow.getViewport()
    const right = rect.left + x + (node.position.x + (node.measured?.width ?? BLOCK_WIDTH)) * zoom
    const limit = rect.right - INSPECTOR_SPACE
    if (right > limit) void reactFlow.setViewport({ x: x - (right - limit), y, zoom }, { duration: motionMs(200) })
  }, [reactFlow, selectedId])

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

  // Abre no fluxo inteiro, se ele couber legível. Comprido demais, abre no começo: é de lá que se lê, a linha saindo
  // pela direita convida a seguir, e "Ajustar à tela" mostra o todo. No celular quem lê é a lista, e o mapa é a visão
  // de conjunto: sempre o todo.
  const onInit = useCallback(() => {
    const blocks = api.getState().nodes
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (rect && blocks.length > 0 && !isMobile) {
      const bounds = reactFlow.getNodesBounds(blocks)
      const { zoom } = getViewportForBounds(bounds, rect.width, rect.height, MIN_ZOOM, FIT_OPTIONS.maxZoom, FIT_OPTIONS.padding)
      if (zoom < READABLE_ZOOM) {
        const start =
          blocks.find((node) => isTrigger(node.type)) ??
          blocks.reduce((first, node) => (node.position.x < first.position.x ? node : first))
        void reactFlow.setViewport({
          x: OPEN_MARGIN - start.position.x * READABLE_ZOOM,
          y: rect.height / 2 - (start.position.y + BLOCK_BASE_HEIGHT / 2) * READABLE_ZOOM,
          zoom: READABLE_ZOOM,
        })
        return
      }
    }
    void reactFlow.fitView(FIT_OPTIONS)
  }, [api, isMobile, reactFlow])

  return (
    <div ref={wrapperRef} className="flow-canvas relative size-full" onDragOver={onDragOver} onDrop={onDrop}>
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
        minZoom={MIN_ZOOM}
        maxZoom={1.5}
        snapToGrid
        snapGrid={SNAP_GRID}
        // Arrastar não abre o inspetor: abrir é um clique, e mover é outra intenção.
        selectNodesOnDrag={false}
        edgesReconnectable={false}
        deleteKeyCode={DELETE_KEYS}
        multiSelectionKeyCode={MULTI_SELECT_KEYS}
        selectionKeyCode="Shift"
        onlyRenderVisibleElements={nodes.length >= VIRTUALIZE_FROM}
        ariaLabelConfig={ariaLabels}
        proOptions={{ hideAttribution: true }}
        // Só o que o xyflow pinta sozinho (minimapa, controles); as cores do quadro são de `flows.css`.
        colorMode={theme}
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
