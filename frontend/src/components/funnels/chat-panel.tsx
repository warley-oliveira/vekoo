import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router"
import { ExternalLink, MessageSquare } from "lucide-react"
import { toast } from "sonner"

import {
  CopyButton,
  DetailSkeleton,
  ErrorState,
  Field,
  SearchableSelect,
  SelectInput,
  ResponsiveDialog,
  StatusBadge,
  TagChip,
  UserAvatar,
} from "@/components/shared"
import { Button } from "@/components/ui/button"
import {
  useChatDetail,
  useChatMutations,
  useChatPeople,
  useChatTags,
  useChatTeams,
} from "@/hooks/insights/use-funnel-chat"
import { useCan } from "@/hooks/use-can"
import { useOpenCount, useRetained } from "@/hooks/use-panel-session"
import { apiAssetUrl } from "@/lib/api"
import { onlyDigits } from "@/lib/format-phone"
import { chatName, contactPhone, MIN_PHONE_DIGITS } from "./chat-format"
import { ChatAttributes, ChatBookings, ChatHistory, ChatNotes, PanelSection } from "./chat-sections"
import { ChatTagsEditor } from "./chat-tags-editor"
import { columnKey } from "./board-state"
import { funnelErrorMessage } from "./error-message"
import type { BoardChat, ChatDetail, FunnelBoard } from "./types"

type ChatPanelProps = {
  chatId: string | null
  funnelId: string
  board: FunnelBoard | undefined
  onClose: () => void
  onMove: (chat: BoardChat, toStageId: string | null) => void
  onPatch: (chatId: string, patch: Partial<BoardChat>) => void
  onCatalogChange: () => void
}

/**
 * O cartão aberto: contato, etapa, atribuição, etiquetas, nota, campos, agendamentos e histórico, e a
 * porta para a conversa. Era o modal grande da origem; aqui fica ao lado do quadro, e a URL leva o
 * `?chat=<id>`, para o voltar fechar e o link abrir direto.
 */
export function ChatPanel({ chatId, funnelId, board, onClose, onMove, onPatch, onCatalogChange }: ChatPanelProps) {
  const { t } = useTranslation()
  const open = Boolean(chatId)
  const shownId = useRetained(chatId)
  const openCount = useOpenCount(open)

  const card = useMemo(() => {
    if (!shownId) return null
    for (const column of board?.columns ?? []) {
      const found = column.chats.find((chat) => chat.id === shownId)
      if (found) return found
    }
    return null
  }, [board?.columns, shownId])

  const canChat = useCan("chat")
  const { detail, error, isLoading, reload } = useChatDetail(open && canChat ? shownId : null)
  const contact = card ?? detail?.chat ?? null
  const fallbackName = t("funnels.card.noName")
  const name = contact ? chatName(contact, fallbackName) : fallbackName
  const phone = contactPhone(contact?.phoneNumber)

  return (
    <ResponsiveDialog
      key={openCount}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      size="lg"
      title={name}
      description={phone || undefined}
    >
      {!contact && (error || !canChat) ? (
        <ErrorState
          error={error}
          title={t("funnels.panel.notFoundTitle")}
          description={t("funnels.panel.notFoundHint")}
          onRetry={reload}
        />
      ) : !contact ? (
        <DetailSkeleton rows={6} />
      ) : (
        <PanelBody
          chatId={shownId as string}
          card={card}
          detail={detail?.chat ?? null}
          attributeList={detail?.attributeList ?? []}
          isLoadingDetail={isLoading}
          funnelId={funnelId}
          board={board}
          canChat={canChat}
          onMove={onMove}
          onPatch={onPatch}
          onCatalogChange={onCatalogChange}
        />
      )}
    </ResponsiveDialog>
  )
}

type PanelBodyProps = {
  chatId: string
  card: BoardChat | null
  detail: ChatDetail | null
  attributeList: NonNullable<ReturnType<typeof useChatDetail>["detail"]>["attributeList"]
  isLoadingDetail: boolean
  funnelId: string
  board: FunnelBoard | undefined
  canChat: boolean
  onMove: (chat: BoardChat, toStageId: string | null) => void
  onPatch: (chatId: string, patch: Partial<BoardChat>) => void
  onCatalogChange: () => void
}

function PanelBody({
  chatId,
  card,
  detail,
  attributeList,
  isLoadingDetail,
  funnelId,
  board,
  canChat,
  onMove,
  onPatch,
  onCatalogChange,
}: PanelBodyProps) {
  const { t } = useTranslation()
  const { people } = useChatPeople()
  const { teams } = useChatTeams()
  const { tags } = useChatTags()
  const { updateChat } = useChatMutations(chatId)

  const contact = (card ?? detail) as BoardChat | ChatDetail
  const name = chatName(contact, t("funnels.card.noName"))
  const phoneDigits = contact.phoneNumber ? onlyDigits(contact.phoneNumber) : ""
  const isOpen = contact.status === "open"

  const columns = board?.columns ?? []
  // Etapa apagada fica gravada até o job passar: para a tela, ela já é "Sem etapa".
  const rawStage = card ? card.stageId : (detail?.funnelStages[funnelId] ?? null)
  const stageId = columns.some((column) => column.stageId === rawStage) ? rawStage : null

  /** O formato do cartão, para quem abriu por link uma conversa que não está nas páginas carregadas. */
  const asCard = (): BoardChat =>
    card ?? {
      id: chatId,
      connectorId: null,
      externalId: null,
      phoneNumber: contact.phoneNumber,
      userName: contact.userName,
      displayName: contact.displayName,
      profilePictureUrl: contact.profilePictureUrl,
      status: contact.status,
      automationEnabled: contact.automationEnabled,
      assignedAccountId: contact.assignedAccountId,
      assignedAccountName: null,
      teamId: contact.teamId,
      unreadMessages: 0,
      activeSession: contact.activeSession,
      summary: null,
      notes: contact.notes,
      lastMessageAt: null,
      lastMessageType: null,
      lastMessageBy: null,
      lastMessageContent: null,
      stageId,
      chatTags: [],
      createdAt: null,
    }

  async function assign(accountId: string | null) {
    try {
      await updateChat({ assignedAccountId: accountId })
      onPatch(chatId, {
        assignedAccountId: accountId,
        assignedAccountName: people?.find((person) => person.id === accountId)?.name ?? null,
      })
      toast.success(
        accountId ? t("funnels.panel.assigned", { name }) : t("funnels.panel.unassigned", { name })
      )
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
    }
  }

  async function assignTeam(teamId: string | null) {
    try {
      await updateChat({ teamId })
      onPatch(chatId, { teamId })
      toast.success(t("funnels.panel.teamSaved"))
    } catch (cause) {
      toast.error(funnelErrorMessage(t, cause))
    }
  }

  const tagIds = detail?.tagIds ?? card?.chatTags.map((tag) => tag.id) ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <UserAvatar
          name={name}
          size="lg"
          src={contact.profilePictureUrl ? apiAssetUrl(contact.profilePictureUrl) : null}
          status={contact.activeSession ? "online" : undefined}
        />
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <StatusBadge tone={isOpen ? "success" : "neutral"}>
            {t(isOpen ? "funnels.card.open_status" : "funnels.card.closed_status")}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {t(contact.automationEnabled ? "funnels.panel.automationOn" : "funnels.panel.automationOff")}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {t(contact.activeSession ? "funnels.panel.sessionActive" : "funnels.panel.sessionEnded")}
          </StatusBadge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canChat ? (
          <Button nativeButton={false} className="pointer-coarse:h-10" render={<Link to={`/chat/${chatId}`} />}>
            <MessageSquare />
            {t("funnels.card.openChat")}
          </Button>
        ) : null}
        {phoneDigits.length >= MIN_PHONE_DIGITS ? (
          <CopyButton
            value={phoneDigits}
            label={t("funnels.panel.copyPhone")}
            variant="outline"
            className="pointer-coarse:h-10"
          />
        ) : null}
        {phoneDigits.length >= MIN_PHONE_DIGITS ? (
          <Button
            nativeButton={false}
            variant="outline"
            className="pointer-coarse:h-10"
            render={<a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink />
            {t("funnels.panel.openWhatsApp")}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("funnels.panel.stage")}>
          {(control) => (
            <SelectInput
              {...control}
              value={columnKey(stageId)}
              options={columns.map((column) => ({ value: columnKey(column.stageId), label: column.stageName }))}
              onChange={(value) => {
                const target = columns.find((column) => columnKey(column.stageId) === value)
                if (target && target.stageId !== stageId) onMove(asCard(), target.stageId)
              }}
            />
          )}
        </Field>
        {canChat ? (
          <Field label={t("funnels.panel.responsible")}>
            {(control) => (
              <SearchableSelect
                {...control}
                clearable
                placeholder={t("funnels.panel.noResponsible")}
                options={(people ?? []).map((person) => ({ value: person.id, label: person.name }))}
                value={detail?.assignedAccountId ?? card?.assignedAccountId ?? null}
                onChange={(value) => void assign(value)}
              />
            )}
          </Field>
        ) : null}
        {canChat ? (
          <Field label={t("funnels.panel.team")}>
            {(control) => (
              <SelectInput
                {...control}
                placeholder={t("funnels.panel.noTeam")}
                clearLabel={t("funnels.panel.noTeam")}
                options={(teams ?? []).map((team) => ({ value: team.id, label: team.name }))}
                value={detail?.teamId ?? card?.teamId ?? null}
                onChange={(value) => void assignTeam(value)}
              />
            )}
          </Field>
        ) : null}
      </div>

      <PanelSection title={t("funnels.panel.tags")}>
        {canChat ? (
          <ChatTagsEditor
            chatId={chatId}
            tagIds={tagIds}
            onCatalogChange={onCatalogChange}
            onChange={(next, created) => {
              onPatch(chatId, {
                chatTags: [...(tags ?? []), ...(created ? [created] : [])]
                  .filter((tag) => next.includes(tag.id))
                  .map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
              })
            }}
          />
        ) : card?.chatTags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {card.chatTags.map((tag) => (
              <TagChip key={tag.id} color={tag.color}>
                {tag.name}
              </TagChip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("funnels.tags.none")}</p>
        )}
      </PanelSection>

      <ChatNotes
        key={contact.notes ?? ""}
        chatId={chatId}
        notes={contact.notes}
        readOnly={!canChat}
        onSaved={(notes) => onPatch(chatId, { notes })}
      />

      {canChat && !isLoadingDetail && detail ? (
        <ChatAttributes chatId={chatId} definitions={attributeList} values={detail.customAttributes} />
      ) : null}

      <ChatBookings chatId={chatId} />

      {canChat ? <ChatHistory chatId={chatId} /> : null}
    </div>
  )
}
