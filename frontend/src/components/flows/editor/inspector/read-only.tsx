import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRight } from "lucide-react"

import { ResponsiveDialog } from "@/components/shared"
import { blockOutputs, DEFAULT_OUTPUT, normalizeHandle, outputLabel } from "@/lib/flows/outputs"
import { blockSummary } from "@/lib/flows/summary"
import type { BlockData } from "@/lib/flows/types"

import { useEditor, useEditorApi } from "../store"

// O bloco na conferência do celular: o texto inteiro e para onde cada saída vai, sem nada para mexer.

const LONG_FIELDS = ["text", "caption", "system_prompt", "body", "url", "reason", "title", "description", "value", "query", "invalid_text"]

function fieldsOf(data: BlockData) {
  return LONG_FIELDS.flatMap((key) => {
    const value = data[key]
    return typeof value === "string" && value.trim() ? [{ key, value }] : []
  })
}

export function BlockReadOnly() {
  const { t } = useTranslation()
  const api = useEditorApi()
  const selectedId = useEditor((state) => state.selectedId)
  const node = useEditor((state) => state.nodes.find((item) => item.id === state.selectedId))
  const edges = useEditor((state) => state.edges)

  const outputs = useMemo(() => (node ? blockOutputs(node.type ?? "", node.data) : []), [node])
  const summary = useMemo(() => (node ? blockSummary(node.type ?? "", node.data, t) : null), [node, t])

  const nameOf = (id: string) => {
    const target = api.getState().nodes.find((item) => item.id === id)
    if (!target) return ""
    const custom = typeof target.data.label === "string" ? target.data.label.trim() : ""
    return custom || t(`flows.blocks.${target.type}.label`, { defaultValue: target.type ?? "" })
  }

  return (
    <ResponsiveDialog
      open={Boolean(selectedId && node)}
      onOpenChange={(open) => {
        if (!open) api.getState().selectBlock(null)
      }}
      title={node ? t(`flows.blocks.${node.type}.label`, { defaultValue: node.type ?? "" }) : ""}
      description={node ? t(`flows.blocks.${node.type}.description`, { defaultValue: "" }) : undefined}
      size="md"
    >
      {node ? (
        <div className="flex flex-col gap-4 pb-2">
          {summary?.missing ? <p className="text-sm text-status-warning">{summary.missing}</p> : null}

          {fieldsOf(node.data).map(({ key, value }) => (
            <div key={key}>
              <p className="text-xs font-medium text-muted-foreground">
                {t(`flows.fields.${node.type}.${key}.label`, {
                  defaultValue: t(`flows.fields.${key}.label`, { defaultValue: key }),
                })}
              </p>
              <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{value}</p>
            </div>
          ))}

          {outputs.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("flows.inspector.readOnlyNext")}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {outputs.map((output) => {
                  const edge = edges.find(
                    (item) => item.source === node.id && normalizeHandle(item.sourceHandle) === output.id
                  )
                  return (
                    <li key={output.id} className="flex items-center gap-2 text-sm">
                      {output.id !== DEFAULT_OUTPUT || outputs.length > 1 ? (
                        <span className="text-muted-foreground">{outputLabel(output, t)}</span>
                      ) : null}
                      {output.id !== DEFAULT_OUTPUT || outputs.length > 1 ? (
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      ) : null}
                      <span className="min-w-0 truncate">{edge ? nameOf(edge.target) : t("flows.inspector.readOnlyEnds")}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </ResponsiveDialog>
  )
}
