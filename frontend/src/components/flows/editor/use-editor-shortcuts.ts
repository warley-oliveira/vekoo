import { useEffect } from "react"
import { useReactFlow } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { blockOutputs } from "@/lib/flows/outputs"

import { isTypingTarget } from "./keys"
import { useEditorApi } from "./store"
import { useEditorUi } from "./ui-store"

// Os atalhos do editor (a lista está em `canvas-toolbar`). Dentro de um campo a tecla é do campo: Ctrl+Z
// desfaz o texto, e Backspace apaga a letra. Salvar e abrir o seletor valem em qualquer lugar.

export function useEditorShortcuts() {
  const api = useEditorApi()
  const flow = useReactFlow()
  const { t } = useTranslation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (api.getState().readOnly) return
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      const typing = isTypingTarget(event.target)
      const state = api.getState()
      const ui = useEditorUi.getState()

      if (mod && key === "s") {
        event.preventDefault()
        void ui.flush().then((saved) => {
          if (saved) toast.success(t("flows.save.savedNow"))
        })
        return
      }

      if (mod && key === "k") {
        event.preventDefault()
        const selected = state.nodes.find((node) => node.id === state.selectedId)
        const outlets = selected ? (state.outlets[selected.id] ?? "").split("|") : []
        const loose = selected
          ? blockOutputs(selected.type ?? "", selected.data).find(
              (output) => output.id !== "onError" && !outlets.includes(output.id)
            )
          : undefined
        state.openPicker(selected && loose ? { source: { nodeId: selected.id, handle: loose.id } } : {})
        return
      }

      if (typing || ui.dialog) return

      if (mod && key === "z") {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (mod && key === "y") {
        event.preventDefault()
        state.redo()
        return
      }
      if (mod && key === "d") {
        event.preventDefault()
        const ids = state.nodes.filter((node) => node.selected).map((node) => node.id)
        if (ids.length > 0) state.duplicateBlocks(ids)
        return
      }
      if (mod && key === "c") {
        const count = state.copySelection()
        if (count > 0) toast.success(t("flows.toast.copied", { count }))
        return
      }
      if (mod && key === "v") {
        if (state.clipboard) {
          event.preventDefault()
          state.paste()
        }
        return
      }
      if (mod || event.altKey) return

      if (key === "escape") {
        if (state.picker) state.closePicker()
        else if (state.selectedId || state.selectionCount > 0) state.selectBlock(null)
        return
      }
      if (key === "f") {
        void flow.fitView({ padding: 0.25, maxZoom: 1, duration: 250 })
      } else if (key === "l") {
        ui.toggleOutline()
      } else if (key === "t") {
        ui.setTestOpen(!ui.testOpen)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [api, flow, t])
}

/** Leva até um bloco e o abre no inspetor. É o que os erros clicáveis e o histórico usam. */
export function useFocusBlock() {
  const api = useEditorApi()
  const flow = useReactFlow()
  return (id: string) => {
    if (!api.getState().nodes.some((node) => node.id === id)) return false
    api.getState().selectBlock(id)
    void flow.fitView({ nodes: [{ id }], maxZoom: 1, padding: 1.2, duration: 280 })
    return true
  }
}
