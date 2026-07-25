import { Toaster, toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/empty-state"

// Scaffolding smoke test. Replace with your first real screen — and when you do,
// follow the Front-end / UX Charter in CLAUDE.md (full state matrix, inferred
// affordances, the right representation for the data, purposeful motion).
export default function App() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">It works 🎉</h1>

      <Button onClick={() => toast.success("Sonner is wired up")}>Test toast</Button>

      <EmptyState
        title="Nothing here yet"
        description="This is the reusable EmptyState pattern. Build the real screen next."
        action={{ label: "Primary action", onClick: () => toast("Action fired") }}
      />

      <Toaster richColors />
    </div>
  )
}
