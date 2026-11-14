import { cn } from "@/lib/utils"

/**
 * Ilustração leve dos estados vazios do chat: duas bolhas, uma de cada lado, e o rostinho de um
 * contato, desenhados com os tokens do tema (o branco do cartão, a bolha nossa, dois tons de avatar).
 * Diz "conversa" sem texto, com um pouco de cor, sem virar enfeite.
 */
export function ConversationArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative h-24 w-36", className)}>
      <span className="absolute top-2 left-0 flex size-8 items-center justify-center rounded-full bg-avatar-2 text-[0.625rem] font-semibold text-avatar-2-foreground ring-2 ring-card">
        <span className="size-2 rounded-full bg-avatar-2-foreground/70" />
      </span>
      <span className="absolute top-1 left-10 flex h-10 w-[5.5rem] items-center gap-1.5 rounded-2xl rounded-bl-md bg-card px-3 shadow-sm ring-1 ring-border/60">
        <span className="h-1.5 w-9 rounded-full bg-avatar-2-foreground/30" />
        <span className="h-1.5 w-5 rounded-full bg-avatar-4-foreground/25" />
      </span>
      <span className="absolute right-0 bottom-1 flex h-10 w-[4.5rem] items-center justify-end gap-1 rounded-2xl rounded-br-md bg-chat-bubble-own px-3 shadow-sm ring-1 ring-chat-bubble-own-ring">
        <span className="h-1.5 w-7 rounded-full bg-primary/35" />
      </span>
      <span className="absolute right-2 bottom-12 size-1.5 rounded-full bg-avatar-7-foreground/40" />
      <span className="absolute bottom-3 left-14 size-1 rounded-full bg-avatar-5-foreground/40" />
    </div>
  )
}
