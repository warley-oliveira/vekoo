import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle, CornerDownRight, Repeat, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { blockFamily, blockIcon } from "@/lib/flows/catalog"
import { buildOutline, type OutlineEntry } from "@/lib/flows/outline"
import { outputLabel } from "@/lib/flows/outputs"
import { blockSummary } from "@/lib/flows/summary"
import { useMotionPreset } from "@/lib/motion"
import { cn } from "@/lib/utils"

import { useRun, type RunStep } from "./run-store"
import { useEditor, useEditorApi, type BlockNode } from "./store"
import { useEditorUi } from "./ui-store"
import { useFocusBlock } from "./use-editor-shortcuts"

// O fluxo em forma de lista, na ordem em que ele anda. É a alternativa ao quadro para quem usa teclado ou leitor
// de tela, a conferência no celular e uma leitura rápida num fluxo grande. Clicar leva ao bloco.

export function OutlinePanel() {
  const { t } = useTranslation()
  const preset = useMotionPreset()
  const isMobile = useIsMobile()
  const open = useEditorUi((state) => state.outlineOpen)
  const setOpen = useEditorUi((state) => state.setOutlineOpen)

  // No celular a lista é o corpo da tela (ver `MobileBody`).
  if (isMobile) return null

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          key="outline"
          {...preset.fade}
          aria-label={t("flows.outline.title")}
          className="absolute top-3 bottom-20 left-3 z-20 flex w-80 flex-col overflow-hidden rounded-2xl border bg-popover shadow-lg"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
            <h2 className="font-heading text-sm font-semibold tracking-tight">{t("flows.outline.title")}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("flows.outline.close")}
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <OutlineList />
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

export function OutlineList() {
  const { t } = useTranslation()
  const edges = useEditor((state) => state.edges)
  const nodes = useEditor((state) => state.nodes)
  const entries = useMemo(() => buildOutline(nodes, edges), [edges, nodes])
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  return (
    <ol className="flex flex-col gap-0.5 p-2" aria-label={t("flows.outline.title")}>
      {entries.map((entry) => {
        const node = byId.get(entry.nodeId)
        return node ? <OutlineRow key={entry.key} entry={entry} node={node} /> : null
      })}
    </ol>
  )
}

const RUN_DOT: Record<RunStep, string> = {
  active: "bg-status-info",
  done: "bg-status-success",
  waiting: "bg-status-warning",
  failed: "bg-status-danger",
  skipped: "bg-muted-foreground",
}

function OutlineRow({ entry, node }: { entry: OutlineEntry; node: BlockNode }) {
  const { t } = useTranslation()
  const api = useEditorApi()
  const focusBlock = useFocusBlock()
  const isMobile = useIsMobile()
  const run = useRun((state) => state.blocks[node.id])
  const summary = useMemo(() => blockSummary(node.type ?? "", node.data, t), [node.data, node.type, t])

  const Icon = blockIcon(node.type)
  const label =
    (typeof node.data.label === "string" && node.data.label.trim()) ||
    t(`flows.blocks.${node.type}.label`, { defaultValue: node.type ?? "" })
  const via = "via" in entry ? entry.via : undefined

  const pick = () => {
    if (isMobile) api.getState().selectBlock(node.id)
    else focusBlock(node.id)
  }

  if (entry.kind === "reference") {
    return (
      <li style={{ paddingLeft: entry.depth * 14 }}>
        {via ? <ViaLabel text={outputLabel(via, t)} /> : null}
        <button
          type="button"
          onClick={pick}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
        >
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t("flows.outline.backTo", { name: label })}</span>
        </button>
      </li>
    )
  }

  return (
    <li style={{ paddingLeft: entry.depth * 14 }}>
      {via ? <ViaLabel text={outputLabel(via, t)} /> : null}
      {entry.kind === "loose" ? (
        <p className="px-2 pb-0.5 text-[11px] text-status-warning">{t("flows.outline.loose")}</p>
      ) : null}
      <button
        type="button"
        onClick={pick}
        className="flow-block flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
        data-family={blockFamily(node.type)}
      >
        <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-(--block-tint-soft) text-(--block-tint)">
          <Icon className="size-3.5" aria-hidden />
          {run ? (
            <span className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-popover", RUN_DOT[run])} aria-hidden />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          {summary.missing ? (
            <span className="flex items-center gap-1 text-xs text-status-warning">
              <AlertCircle className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{summary.missing}</span>
            </span>
          ) : (
            <span className="block truncate text-xs text-muted-foreground">{summary.text}</span>
          )}
        </span>
      </button>
    </li>
  )
}

function ViaLabel({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1 px-2 pt-1.5 text-[11px] font-medium text-muted-foreground">
      <CornerDownRight className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </p>
  )
}
