import { memo, useEffect, useMemo } from "react"
import { Handle, NodeToolbar, Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { AlertCircle, Copy, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { blockFamily, blockIcon, isTrigger } from "@/lib/flows/catalog"
import { blockOutputs, DEFAULT_OUTPUT, hasSingleOutput, type BlockOutput } from "@/lib/flows/outputs"
import { blockSummary } from "@/lib/flows/summary"
import { cn } from "@/lib/utils"

import { useRun } from "./run-store"
import { useEditor, useEditorApi, type BlockNode } from "./store"

// Um bloco do quadro: título forte e o resumo em uma linha do que ele faz. Só redesenha quando o que é
// dele mudou (`memo`, e cada leitura do store é um valor simples), e é isso que mantém o editor fluido
// com 100 blocos. `import.meta.env.DEV` conta os renders para a medição em `routes/dev/flow-perf`.

/** Tela de conferência em desenvolvimento: `window.__flowRenders`. Some do build de produção. */
function countRender(id: string) {
  if (!import.meta.env.DEV) return
  const counters = window as unknown as { __flowRenders?: Record<string, number> }
  counters.__flowRenders ??= {}
  counters.__flowRenders[id] = (counters.__flowRenders[id] ?? 0) + 1
}

export function outputLabel(output: BlockOutput, t: (key: string) => string): string {
  return output.label || (output.labelKey ? t(output.labelKey) : output.id)
}

export const FlowBlock = memo(function FlowBlock({ id, type, data, selected }: NodeProps<BlockNode>) {
  countRender(id)
  const { t } = useTranslation()
  const api = useEditorApi()
  const readOnly = useEditor((state) => state.readOnly)
  const outlets = useEditor((state) => state.outlets[id] ?? "")
  const run = useRun((state) => state.blocks[id])
  const selectionCount = useEditor((state) => (selected ? state.selectionCount : 0))

  const known = Boolean(type)
  const family = blockFamily(type)
  const Icon = blockIcon(type)
  const outputs = useMemo(() => blockOutputs(type, data), [type, data])
  const single = hasSingleOutput(outputs)
  const summary = useMemo(() => blockSummary(type, data, t), [type, data, t])
  const connected = useMemo(() => new Set(outlets.split("|").filter(Boolean)), [outlets])

  const customLabel = typeof data.label === "string" ? data.label.trim() : ""
  const blockLabel = t(`flows.blocks.${type}.label`, { defaultValue: type })
  const title = customLabel && customLabel !== blockLabel ? customLabel : blockLabel

  // Saída renomeada ou reordenada não muda o tamanho do bloco. Sem avisar, o xyflow mantém a
  // posição antiga e a linha sai do lugar errado.
  const updateInternals = useUpdateNodeInternals()
  const outputsKey = outputs.map((output) => output.id).join("|")
  useEffect(() => {
    updateInternals(id)
  }, [id, outputsKey, updateInternals])

  // A saída padrão escondida: conexão sem nome num bloco com saídas nomeadas continua aparecendo.
  const hiddenDefault = !single && connected.has(DEFAULT_OUTPUT) && !outputs.some((output) => output.id === DEFAULT_OUTPUT)

  const add = (handle: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    api.getState().openPicker({ source: { nodeId: id, handle }, screen: { x: rect.right + 8, y: rect.top - 16 } })
  }

  return (
    <>
      {selected && selectionCount === 1 && !readOnly ? (
        <NodeToolbar isVisible position={Position.Top} offset={8}>
          <div className="flex items-center gap-0.5 rounded-full border bg-popover p-0.5 shadow-sm">
            {!isTrigger(type) ? (
              <ToolbarButton
                label={t("flows.block.duplicate")}
                onClick={() => api.getState().duplicateBlocks([id])}
              >
                <Copy />
              </ToolbarButton>
            ) : null}
            {!isTrigger(type) ? (
              <ToolbarButton
                label={t("flows.block.delete")}
                destructive
                onClick={() => api.getState().deleteBlocks([id])}
              >
                <Trash2 />
              </ToolbarButton>
            ) : null}
          </div>
        </NodeToolbar>
      ) : null}

      <div
        className={cn(
          "flow-block relative w-66 rounded-xl border bg-card transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
          "shadow-[0_1px_2px_oklch(0.2_0.01_285/0.05)]",
          selected ? "border-primary ring-3 ring-primary/15" : "hover:border-foreground/20"
        )}
        data-family={family}
        data-run={run}
      >
        <div className="relative flex items-start gap-2.5 p-3">
          {!isTrigger(type) ? <Handle type="target" position={Position.Left} /> : null}

          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--block-tint-soft) text-(--block-tint)">
            <Icon className="size-4" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-5 font-semibold tracking-tight">{title}</p>
            {summary.missing ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs leading-4 text-status-warning">
                <AlertCircle className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{summary.missing}</span>
              </p>
            ) : (
              <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
                {known ? summary.text : t("flows.block.unknown")}
              </p>
            )}
          </div>

          {run === "active" ? (
            <span
              className="flow-block__pulse absolute top-2 right-2 size-1.5 rounded-full bg-status-info"
              aria-hidden
            />
          ) : null}

          {single ? (
            <OutputHandle
              id={DEFAULT_OUTPUT}
              loose={!connected.has(DEFAULT_OUTPUT)}
              readOnly={readOnly}
              label={t("flows.block.addAfter")}
              onAdd={add}
            />
          ) : null}
        </div>

        {!single && outputs.length > 0 ? (
          <ul className="border-t border-dashed py-1">
            {outputs.map((output) => {
              const text = outputLabel(output, t)
              const loose = !connected.has(output.id)
              return (
                <li
                  key={output.id}
                  className="flow-block__output relative flex h-7 items-center justify-end px-3"
                  data-tone={output.tone}
                >
                  <span
                    className={cn(
                      "truncate text-xs font-medium",
                      output.tone === "danger" ? "text-status-danger" : "text-foreground/70",
                      loose && "opacity-60"
                    )}
                  >
                    {text || t("flows.block.noName")}
                  </span>
                  <OutputHandle
                    id={output.id}
                    loose={loose}
                    readOnly={readOnly}
                    subtle={output.id === "onError"}
                    label={t("flows.block.addAfterOutput", { name: text })}
                    onAdd={add}
                  />
                </li>
              )
            })}
          </ul>
        ) : null}

        {hiddenDefault ? (
          <Handle
            type="source"
            position={Position.Right}
            id={DEFAULT_OUTPUT}
            isConnectable={false}
            className="invisible"
          />
        ) : null}
      </div>
    </>
  )
})

function OutputHandle({
  id,
  loose,
  readOnly,
  subtle,
  label,
  onAdd,
}: {
  id: string
  loose: boolean
  readOnly: boolean
  subtle?: boolean
  label: string
  onAdd: (handle: string, anchor: HTMLElement) => void
}) {
  return (
    <>
      <Handle type="source" position={Position.Right} id={id} />
      {loose && !readOnly ? (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(event) => {
            event.stopPropagation()
            onAdd(id, event.currentTarget)
          }}
          className={cn(
            "nodrag nopan absolute top-1/2 left-[calc(100%+12px)] flex size-5 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-muted-foreground",
            "transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            subtle && "opacity-0 group-hover:opacity-100 [.flow-block:hover_&]:opacity-100 focus-visible:opacity-100"
          )}
        >
          <Plus className="size-3" aria-hidden />
        </button>
      ) : null}
    </>
  )
}

function ToolbarButton({
  label,
  destructive,
  onClick,
  children,
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn("rounded-full", destructive && "text-status-danger hover:text-status-danger")}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
