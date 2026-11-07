import type { FlowExecutionStatus } from "@/lib/flows/types"
import { cn } from "@/lib/utils"

const DOT: Record<FlowExecutionStatus, string> = {
  pending: "bg-muted-foreground/40",
  running: "bg-status-info",
  waiting: "bg-status-warning",
  waiting_for_message: "bg-status-warning",
  completed: "bg-status-success",
  failed: "bg-status-danger",
  cancelled: "bg-muted-foreground/40",
}

/** As últimas execuções, de relance: da mais antiga para a mais nova. O texto ao lado diz o resto. */
export function RunDots({ statuses, className }: { statuses: FlowExecutionStatus[]; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-0.5", className)}>
      {[...statuses].reverse().map((status, index) => (
        <span key={index} className={cn("h-3 w-1 rounded-sm", DOT[status])} />
      ))}
    </span>
  )
}
