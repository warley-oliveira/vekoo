import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Trash2,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import {
  ActionsMenu,
  EmptyState,
  ErrorState,
  FileTypeIcon,
  ListSkeleton,
  RelativeTime,
  UserAvatar,
  useConfirm,
  type RowAction,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCardComments } from "@/hooks/pipelines/use-card-comments"
import { usePeopleOptions } from "@/hooks/pipelines/use-people-options"
import { apiAssetUrl } from "@/lib/api"
import { formatFileSize } from "@/lib/file-utils"
import { useLanguage } from "@/lib/i18n"
import { pipelineErrorText } from "@/lib/pipelines/errors"
import type { CardComment, CommentAttachment, PersonOption } from "@/lib/pipelines/types"
import { cn } from "@/lib/utils"
import { CommentComposer } from "./comment-composer"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🚀", "👀", "💯", "🙏"]

function Attachment({ attachment }: { attachment: CommentAttachment }) {
  const language = useLanguage()
  const url = apiAssetUrl(attachment.url)
  const isImage = attachment.contentType?.startsWith("image/")

  if (isImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block max-w-52 overflow-hidden rounded-lg ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <img
          src={url}
          alt={attachment.fileName ?? ""}
          loading="lazy"
          className="max-h-36 w-full object-cover"
        />
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-56 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <FileTypeIcon
        mediaType={attachment.contentType}
        fileName={attachment.fileName}
        className="size-4 shrink-0"
      />
      <span className="truncate">{attachment.fileName}</span>
      {attachment.fileSize ? (
        <span className="shrink-0 text-muted-foreground">
          {formatFileSize(attachment.fileSize, language)}
        </span>
      ) : null}
    </a>
  )
}

/** O texto com as menções em destaque. Só vira menção o nome de quem existe na organização. */
function CommentBody({ body, people }: { body: string; people: PersonOption[] }) {
  const parts = useMemo(() => {
    const names = people
      .map((person) => person.name)
      .sort((a, b) => b.length - a.length)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    if (names.length === 0) return [body]
    return body.split(new RegExp(`(@(?:${names.join("|")}))`, "gu"))
  }, [body, people])

  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="rounded-sm bg-accent px-0.5 font-medium text-accent-foreground">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </p>
  )
}

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground pointer-coarse:size-9"
            aria-label={t("pipelines.comments.react")}
          />
        }
      >
        <SmilePlus />
      </PopoverTrigger>
      <PopoverContent side="top" className="flex w-auto flex-row flex-wrap gap-0.5 p-1">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="flex size-8 items-center justify-center rounded-md text-base outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-10"
            onClick={() => {
              onPick(emoji)
              setOpen(false)
            }}
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

type CommentItemProps = {
  comment: CardComment
  accountId: string | undefined
  people: PersonOption[]
  isReply?: boolean
  onEdit: (id: string, body: string) => Promise<void>
  onRemove: (comment: CardComment) => void
  onPin: (id: string, pinned: boolean) => void
  onReact: (id: string, emoji: string, on: boolean) => void
  onReply: (id: string) => void
  replying?: boolean
  replyComposer?: React.ReactNode
}

const CommentItem = memo(function CommentItem({
  comment,
  accountId,
  people,
  isReply = false,
  onEdit,
  onRemove,
  onPin,
  onReact,
  onReply,
  replyComposer,
}: CommentItemProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [showReplies, setShowReplies] = useState(true)

  const author = comment.author
  const isAutomation = author?.type === "automation"
  const isMine = author?.type === "user" && author.id === accountId
  const replies = comment.replies ?? []

  const menu: RowAction[] = [
    {
      label: t("pipelines.comments.edit"),
      icon: <Pencil />,
      hidden: !isMine,
      onSelect: () => setEditing(true),
    },
    {
      label: comment.pinned ? t("pipelines.comments.unpin") : t("pipelines.comments.pin"),
      icon: comment.pinned ? <PinOff /> : <Pin />,
      hidden: isReply,
      onSelect: () => onPin(comment.id, !comment.pinned),
    },
    {
      label: t("pipelines.comments.delete"),
      icon: <Trash2 />,
      destructive: true,
      separatorBefore: true,
      hidden: !isMine && !isAutomation,
      onSelect: () => onRemove(comment),
    },
  ]

  return (
    <article className="flex gap-2.5" aria-label={author?.name}>
      {isAutomation ? (
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
        >
          <Zap className="size-3.5" />
        </span>
      ) : (
        <UserAvatar
          className={cn("shrink-0", isReply ? "size-6" : "size-7")}
          size="sm"
          name={author?.name}
          src={author?.type === "user" && author.avatarUrl ? apiAssetUrl(author.avatarUrl) : null}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {comment.pinned ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning">
            <Pin className="size-3" aria-hidden />
            {t("pipelines.comments.pinned")}
          </span>
        ) : null}

        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-sm font-medium">
            {author?.name ?? t("pipelines.comments.unknownAuthor")}
          </span>
          <RelativeTime value={comment.createdAt} className="text-xs text-muted-foreground" />
          {comment.editedAt ? (
            <span className="text-xs text-muted-foreground">{t("pipelines.comments.edited")}</span>
          ) : null}
        </div>

        {editing ? (
          <CommentComposer
            autoFocus
            allowFiles={false}
            initialBody={comment.body}
            placeholder={t("pipelines.comments.editPlaceholder")}
            submitLabel={t("pipelines.comments.save")}
            onSubmit={async (body) => {
              await onEdit(comment.id, body)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <CommentBody body={comment.body} people={people} />
        )}

        {comment.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {comment.attachments.map((attachment) => (
              <Attachment key={attachment.id} attachment={attachment} />
            ))}
          </div>
        ) : null}

        <div className="-ml-1 flex flex-wrap items-center gap-0.5">
          {comment.reactions.map((reaction) => {
            const mine = Boolean(accountId && reaction.accountIds.includes(accountId))
            return (
              <button
                key={reaction.emoji}
                type="button"
                aria-pressed={mine}
                onClick={() => onReact(comment.id, reaction.emoji, !mine)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full px-1.5 text-xs tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:h-9",
                  mine ? "bg-accent text-accent-foreground" : "bg-muted/60"
                )}
              >
                <span>{reaction.emoji}</span>
                {reaction.count}
              </button>
            )
          })}
          <ReactionPicker
            onPick={(emoji) => {
              const existing = comment.reactions.find((reaction) => reaction.emoji === emoji)
              const mine = Boolean(accountId && existing?.accountIds.includes(accountId))
              onReact(comment.id, emoji, !mine)
            }}
          />
          {isReply ? null : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground pointer-coarse:h-9"
              onClick={() => onReply(comment.id)}
            >
              <CornerDownRight />
              {t("pipelines.comments.reply")}
            </Button>
          )}
          <ActionsMenu
            label={t("pipelines.comments.actions")}
            className="size-6 text-muted-foreground pointer-coarse:size-9 [&_svg]:size-3"
            actions={menu}
          />
        </div>

        {replies.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="-ml-1 text-muted-foreground pointer-coarse:h-9"
                aria-expanded={showReplies}
                onClick={() => setShowReplies((current) => !current)}
              >
                {showReplies ? <ChevronUp /> : <ChevronDown />}
                {t("pipelines.comments.replies", { count: replies.length })}
              </Button>
            </div>
            {showReplies ? (
              <div className="flex flex-col gap-3 border-l pl-3">
                {replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    accountId={accountId}
                    people={people}
                    isReply
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onPin={onPin}
                    onReact={onReact}
                    onReply={onReply}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {replyComposer}
      </div>
    </article>
  )
})

/** A conversa da equipe sobre o card: comentários, respostas de um nível, fixados e reações. */
export function CardComments({
  boardId,
  cardId,
  accountId,
}: {
  boardId: string
  cardId: string
  accountId: string | undefined
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { people } = usePeopleOptions()
  const {
    comments,
    pinned,
    hasMore,
    error,
    isLoading,
    isLoadingMore,
    loadMore,
    reload,
    add,
    edit,
    remove,
    pin,
    react,
  } = useCardComments(boardId, cardId)

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Chegou comentário e a pessoa está lendo o fim: acompanha. Carregar os antigos não mexe.
  const lastId = comments[comments.length - 1]?.id
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [lastId])

  const report = (error: unknown) =>
    toast.error(pipelineErrorText(t, error, "pipelines.errors.commentFailed"))

  const handlers = useMemo(
    () => ({
      onEdit: edit,
      onRemove: (comment: CardComment) => {
        void confirm({
          title: t("pipelines.comments.deleteTitle"),
          description: t("pipelines.comments.deleteHint"),
          confirmLabel: t("pipelines.comments.delete"),
          destructive: true,
          onConfirm: () => remove(comment.id),
        }).then((confirmed) => {
          if (confirmed) toast.success(t("pipelines.comments.deleted"))
        })
      },
      onPin: (id: string, pinnedNow: boolean) => void pin(id, pinnedNow).catch(report),
      onReact: (id: string, emoji: string, on: boolean) => void react(id, emoji, on).catch(report),
      onReply: (id: string) => setReplyingTo((current) => (current === id ? null : id)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, edit, pin, react, remove, t]
  )

  const renderComment = (comment: CardComment) => (
    <CommentItem
      key={comment.id}
      comment={comment}
      accountId={accountId}
      people={people}
      {...handlers}
      replyComposer={
        replyingTo === comment.id ? (
          <CommentComposer
            autoFocus
            allowFiles={false}
            placeholder={t("pipelines.comments.replyPlaceholder", {
              name: comment.author?.name ?? "",
            })}
            submitLabel={t("pipelines.comments.send")}
            onSubmit={async (body) => {
              await add({ body, parentId: comment.id })
              setReplyingTo(null)
            }}
            onCancel={() => setReplyingTo(null)}
          />
        ) : null
      }
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-3"
      >
        {isLoading ? (
          <ListSkeleton rows={4} avatar />
        ) : error ? (
          <ErrorState error={error} onRetry={() => void reload()} />
        ) : (
          <>
            {hasMore ? (
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLoadingMore}
                  className="text-muted-foreground pointer-coarse:h-10"
                  onClick={() => void loadMore()}
                >
                  {t("pipelines.comments.loadOlder")}
                </Button>
              </div>
            ) : null}

            {pinned.length > 0 ? (
              <div className="flex flex-col gap-4 border-b pb-4">{pinned.map(renderComment)}</div>
            ) : null}

            {comments.length === 0 && pinned.length === 0 ? (
              <EmptyState
                className="border-0 p-6"
                title={t("pipelines.comments.empty")}
                description={t("pipelines.comments.emptyHint")}
              />
            ) : (
              comments.map(renderComment)
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <CommentComposer
          placeholder={t("pipelines.comments.placeholder")}
          submitLabel={t("pipelines.comments.send")}
          onSubmit={async (body, files) => {
            await add({ body, files })
          }}
        />
      </div>
    </div>
  )
}
