import { StartExecutionDialog } from "@/components/flows/start-execution"

import { useFlowContext } from "./flow-context"
import { useEditorUi } from "./ui-store"

export function StartFlowDialog() {
  const open = useEditorUi((state) => state.dialog === "start")
  const setDialog = useEditorUi((state) => state.setDialog)
  const { flow } = useFlowContext()
  return (
    <StartExecutionDialog
      flowId={flow.id}
      flowName={flow.name}
      open={open}
      onOpenChange={(next) => setDialog(next ? "start" : null)}
    />
  )
}
