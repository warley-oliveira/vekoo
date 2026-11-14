import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { MessageSquareText, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useConversationMutations } from "@/hooks/use-conversations"
import { conversationHref, type ConversationSummary } from "@/lib/agent"
import { formatRelative } from "@/lib/format"
import { useLanguage } from "@/lib/i18n"

type ConversationListProps = {
  brandId: string
  conversations: ConversationSummary[] | undefined
  isLoading: boolean
  retentionDays: number
  activeId?: string
}

/**
 * Os pedidos recentes. Curta de propósito: a conversa é andaime — some
 * sozinha depois de 30 dias, e a peça fica na galeria. O aviso da retenção
 * está aqui para ninguém tratar isto como arquivo.
 */
export function ConversationList({
  brandId,
  conversations,
  isLoading,
  retentionDays,
  activeId,
}: ConversationListProps) {
  const { t } = useTranslation()
  const language = useLanguage()
  const { remove } = useConversationMutations(brandId)

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!conversations?.length) return null

  return (
    <nav aria-label={t("agent.recent.title")} className="space-y-2">
      <h2 className="text-xs font-medium text-muted-foreground">{t("agent.recent.title")}</h2>
      <ul className="space-y-1">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="group flex items-center gap-1">
            <Link
              to={conversationHref(brandId, conversation.id)}
              aria-current={conversation.id === activeId ? "page" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted"
            >
              <MessageSquareText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{conversation.title}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {formatRelative(conversation.lastTurnAt, language)}
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={t("agent.recent.delete", { title: conversation.title })}
              onClick={async () => {
                try {
                  await remove(conversation.id)
                  toast.success(t("agent.recent.deleted"))
                } catch {
                  toast.error(t("agent.recent.deleteFailed"))
                }
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <p className="px-2 text-xs text-muted-foreground">
        {t("agent.recent.retention", { count: retentionDays })}
      </p>
    </nav>
  )
}
