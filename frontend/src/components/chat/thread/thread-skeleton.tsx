import { LoadingRegion } from "@/components/shared"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const BUBBLES: { own: boolean; width: string; height: string }[] = [
  { own: false, width: "w-2/5", height: "h-10" },
  { own: false, width: "w-1/4", height: "h-8" },
  { own: true, width: "w-1/2", height: "h-14" },
  { own: false, width: "w-1/3", height: "h-8" },
  { own: true, width: "w-1/4", height: "h-8" },
  { own: true, width: "w-2/5", height: "h-10" },
  { own: false, width: "w-1/2", height: "h-16" },
]

/** O histórico carregando: bolhas dos dois lados, encostadas embaixo, como vão aparecer. */
export function MessagesSkeleton() {
  return (
    <LoadingRegion className="flex h-full flex-col justify-end gap-2 overflow-hidden px-4 pb-4 md:px-6">
      {BUBBLES.map((bubble, index) => (
        <div key={index} className={cn("flex", bubble.own ? "justify-end" : "justify-start")}>
          {/* No fundo pontilhado, o cinza do esqueleto sumiria: a bolha que espera é a do cartão. */}
          <Skeleton
            className={cn(
              "rounded-2xl",
              bubble.own ? "bg-chat-bubble-own" : "bg-card shadow-xs",
              bubble.width,
              bubble.height
            )}
          />
        </div>
      ))}
    </LoadingRegion>
  )
}

export function ThreadHeaderSkeleton() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

/** A conversa inteira, enquanto o código dela desce. */
export function ThreadSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {withHeader ? <ThreadHeaderSkeleton /> : null}
      <div className="chat-surface flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <MessagesSkeleton />
        </div>
        <div className="shrink-0 px-3 pb-3 md:px-5">
          <Skeleton className="h-[3.25rem] w-full rounded-[1.375rem] bg-card shadow-xs" />
        </div>
      </div>
    </div>
  )
}
