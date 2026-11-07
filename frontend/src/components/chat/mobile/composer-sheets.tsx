import { memo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import {
  Camera,
  ChevronDown,
  FileText,
  Images,
  Loader2,
  MessageSquareText,
  Paperclip,
  Sparkles,
} from "lucide-react"

import { QuickReplyPreview } from "@/components/content/quick-reply-preview"
import { BottomSheet } from "@/components/shell/bottom-sheet"
import { InlineError, SearchInput } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuickReplyItems } from "@/hooks/chat/use-quick-reply-items"
import { useAttachmentLibrary } from "@/hooks/content/use-attachments"
import { meaningfulContent } from "@/lib/chat/message-rules"
import {
  citedAttachmentIds,
  fillQuickReply,
  type QuickReplyContext,
} from "@/lib/content/quick-reply-content"
import type { QuickReply } from "@/lib/content/types"
import { cn } from "@/lib/utils"
import { SUGGESTION_COST } from "../details/composer-extras"

function Tile({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-slot="sheet-tile"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-24 min-w-0 flex-col items-center justify-start gap-1.5 rounded-xl px-1 py-2.5 text-center transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:opacity-50"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground/80 [&_svg]:size-5">
        {icon}
      </span>
      <span className="text-xs leading-tight font-medium">{label}</span>
      {hint ? <span className="text-[0.6875rem] leading-none text-muted-foreground">{hint}</span> : null}
    </button>
  )
}

export type FileSource = "camera" | "gallery" | "document"

/**
 * O "+" do composer: de onde vem o anexo, e o que mais ajuda a responder. Sem seletor do sistema logo
 * de saída: "Câmera" abre a câmera em um toque, e cada aparelho não inventa o próprio menu de origem.
 */
export const ComposerActionsSheet = memo(function ComposerActionsSheet({
  open,
  onClose,
  suggesting,
  canSendTemplate,
  onPickFiles,
  onOpenQuickReplies,
  onSuggest,
  onSendTemplate,
}: {
  open: boolean
  onClose: () => void
  suggesting: boolean
  canSendTemplate: boolean
  /** No próprio toque: fora dele, o iOS não abre o seletor de arquivos. */
  onPickFiles: (source: FileSource) => void
  onOpenQuickReplies: () => void
  onSuggest: () => void
  onSendTemplate: () => void
}) {
  const { t } = useTranslation()

  return (
    <BottomSheet open={open} onClose={onClose} title={t("chatMobile.composer.actions")}>
      <div className="chat-touch grid grid-cols-3 gap-1 pb-3 landscape:grid-cols-6">
        <Tile
          icon={<Camera />}
          label={t("chatMobile.composer.camera")}
          onClick={() => onPickFiles("camera")}
        />
        <Tile
          icon={<Images />}
          label={t("chatMobile.composer.gallery")}
          onClick={() => onPickFiles("gallery")}
        />
        <Tile
          icon={<Paperclip />}
          label={t("chatMobile.composer.document")}
          onClick={() => onPickFiles("document")}
        />
        <Tile
          icon={<MessageSquareText />}
          label={t("chat.quickReplies.title")}
          onClick={onOpenQuickReplies}
        />
        <Tile
          icon={suggesting ? <Loader2 className="animate-spin" /> : <Sparkles />}
          label={t("chatMobile.composer.suggest")}
          hint={t("chatMobile.composer.suggestCost", { count: SUGGESTION_COST })}
          disabled={suggesting}
          onClick={onSuggest}
        />
        {canSendTemplate ? (
          <Tile
            icon={<FileText />}
            label={t("chatDetails.template.open")}
            onClick={onSendTemplate}
          />
        ) : null}
      </div>
    </BottomSheet>
  )
})

function QuickReplyRow({
  reply,
  context,
  expanded,
  onToggle,
  onPick,
}: {
  reply: QuickReply
  context: QuickReplyContext
  expanded: boolean
  onToggle: () => void
  onPick: (reply: QuickReply) => void
}) {
  const { t } = useTranslation()
  const { attachments } = useAttachmentLibrary()
  const cited = citedAttachmentIds(reply.content).length

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-slot="quick-reply"
          onClick={() => onPick(reply)}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
        >
          <span className="max-w-24 shrink-0 truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            /{reply.trigger}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{reply.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {meaningfulContent(fillQuickReply(reply.content, context))}
            </span>
          </span>
          {cited > 0 ? (
            <span
              className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
              aria-label={t("chat.quickReplies.attachments", { count: cited })}
            >
              <Paperclip aria-hidden className="size-3" />
              {cited}
            </span>
          ) : null}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-expanded={expanded}
          aria-label={t("chat.quickReplies.preview")}
          className="size-11 shrink-0 text-muted-foreground"
          onClick={onToggle}
        >
          <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>
      {expanded ? (
        <div className="px-2 pt-1 pb-3">
          <QuickReplyPreview
            content={reply.content}
            attachments={attachments}
            customFields={undefined}
            context={context}
          />
        </div>
      ) : null}
    </li>
  )
}

function QuickRepliesBody({
  context,
  onPick,
}: {
  context: QuickReplyContext
  onPick: (reply: QuickReply) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { items, total, isLoading, error, reload } = useQuickReplyItems(query)

  return (
    <div className="chat-touch flex flex-col gap-2 pb-3">
      <SearchInput
        value={query}
        onChange={setQuery}
        debounce={0}
        shortcut={false}
        placeholder={t("chatMobile.composer.searchReplies")}
        className="h-11 rounded-full border-transparent bg-muted/70 shadow-none"
      />

      {isLoading ? (
        <div className="flex flex-col gap-2 py-1" aria-hidden>
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      ) : error ? (
        <InlineError onRetry={() => void reload()} />
      ) : items.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          {total === 0 ? t("chat.quickReplies.empty") : t("chat.quickReplies.noMatch")}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((reply) => (
            <QuickReplyRow
              key={reply.id}
              reply={reply}
              context={context}
              expanded={expandedId === reply.id}
              onToggle={() => setExpandedId((current) => (current === reply.id ? null : reply.id))}
              onPick={onPick}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Mensagens rápidas para quem prefere ver a lista a lembrar do atalho. O `/` continua existindo,
 * junto do teclado, para quem digita. O conteúdo só existe aberto: a lista é conferida a cada abertura,
 * e não enquanto a folha está fechada.
 */
export const QuickRepliesSheet = memo(function QuickRepliesSheet({
  open,
  onClose,
  context,
  onPick,
}: {
  open: boolean
  onClose: () => void
  context: QuickReplyContext
  onPick: (reply: QuickReply) => void
}) {
  const { t } = useTranslation()

  return (
    <BottomSheet open={open} onClose={onClose} title={t("chat.quickReplies.title")} showTitle>
      {open ? <QuickRepliesBody context={context} onPick={onPick} /> : null}
    </BottomSheet>
  )
})
