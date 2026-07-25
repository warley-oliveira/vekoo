import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

// A first, deliberately-reusable domain component. Every list/table view should render
// this (not a blank void) when it has no data. See the Front-end / UX Charter in CLAUDE.md.
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
