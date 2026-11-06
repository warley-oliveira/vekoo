import { useCallback } from "react"
import { Link } from "react-router"
import { useTranslation } from "react-i18next"
import { ExternalLink, MessageCircle, Unlink } from "lucide-react"

import {
  RelativeTime,
  SearchableSelect,
  StatusBadge,
  UserAvatar,
  type LoadOptions,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useCan } from "@/hooks/use-can"
import { apiAssetUrl, apiGet } from "@/lib/api"
import { formatPhone } from "@/lib/format-phone"
import type { CardDetail } from "@/lib/pipelines/types"

type LookupChat = {
  id: string
  userName: string | null
  displayName: string | null
  externalId: string | null
  profilePictureUrl: string | null
}

type ChatLinkProps = {
  card: CardDetail
  onLink: (chatId: string | null) => void
}

/**
 * A conversa ligada ao card. O atendimento acontece na tela de chat: daqui, um link para lá, com o
 * suficiente para saber de quem é e como está.
 */
export function ChatLink({ card, onLink }: ChatLinkProps) {
  const { t } = useTranslation()
  const canOpenChat = useCan("chat")

  const search = useCallback<LoadOptions>(async (query, signal) => {
    const { chats } = await apiGet<{ chats: LookupChat[] }>(
      `/chats/lookup?q=${encodeURIComponent(query)}`,
      { signal }
    )
    return chats.map((chat) => ({
      value: chat.id,
      label: chat.displayName || chat.userName || chat.externalId || chat.id,
      description: chat.externalId ? formatPhone(chat.externalId) : undefined,
    }))
  }, [])

  if (!card.chatId) {
    return (
      <SearchableSelect
        aria-label={t("pipelines.chat.link")}
        placeholder={t("pipelines.chat.linkPlaceholder")}
        emptyLabel={t("pipelines.chat.noResults")}
        value={null}
        loadOptions={search}
        onChange={(chatId) => {
          if (chatId) onLink(chatId)
        }}
      />
    )
  }

  const summary = card.chatSummary

  // Ligada a uma conversa que esta pessoa não enxerga: a API não entrega o resumo.
  if (!summary) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageCircle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{t("pipelines.chat.hidden")}</span>
      </div>
    )
  }

  const name = summary.contactName || summary.contactPhone || t("pipelines.chat.noName")

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
      <div className="flex min-w-48 flex-1 items-center gap-2.5">
        <UserAvatar
          name={name}
          src={summary.profilePictureUrl ? apiAssetUrl(summary.profilePictureUrl) : null}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{name}</span>
            {summary.status ? (
              <StatusBadge tone={summary.status === "open" ? "info" : "neutral"}>
                {t(`pipelines.chat.status.${summary.status === "open" ? "open" : "closed"}`)}
              </StatusBadge>
            ) : null}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {summary.contactPhone ? (
              <span>{formatPhone(summary.contactPhone.split("@")[0] ?? "")}</span>
            ) : null}
            {summary.lastMessageAt ? <RelativeTime value={summary.lastMessageAt} /> : null}
          </p>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {canOpenChat ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="shrink-0 pointer-coarse:h-10"
            render={<Link to={`/chat/${summary.id}`} />}
          >
            <ExternalLink />
            {t("pipelines.chat.open")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground pointer-coarse:size-10"
          aria-label={t("pipelines.chat.unlink")}
          title={t("pipelines.chat.unlink")}
          onClick={() => onLink(null)}
        >
          <Unlink />
        </Button>
      </div>
    </div>
  )
}
