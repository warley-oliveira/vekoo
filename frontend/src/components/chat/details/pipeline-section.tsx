import { lazy, memo, Suspense, useState } from "react"
import { Link } from "@/lib/router"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"

import { Money, StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { useChatPipelineCards } from "@/hooks/chat-details/use-chat-details-data"
import type { CardPriority, ChatPipelineCard } from "@/lib/chat-details/types"
import { DetailsSection, SectionEmpty, SectionError, SectionRowsSkeleton } from "./section"

const CreateCardDialog = lazy(() => import("./create-card-dialog"))

const URGENT: Partial<Record<CardPriority, "warning" | "danger">> = {
  high: "warning",
  urgent: "danger",
}

function CardRow({ card }: { card: ChatPipelineCard }) {
  const { t } = useTranslation()
  const tone = card.priority ? URGENT[card.priority] : undefined

  return (
    <li>
      <Link
        to={`/pipelines/${card.board.id}/board?card=${card.id}`}
        className="-mx-1 flex min-h-11 flex-col justify-center rounded-md px-1 py-1 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{card.title}</span>
          {card.dealValue !== null ? (
            <Money value={card.dealValue} className="shrink-0 text-xs text-muted-foreground" />
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">
            {card.board.name} · {card.stage.name}
          </span>
          {card.wonAt ? (
            <StatusBadge tone="success" className="shrink-0">
              {t("chatDetails.cards.won")}
            </StatusBadge>
          ) : card.lostAt ? (
            <StatusBadge tone="neutral" className="shrink-0">
              {t("chatDetails.cards.lost")}
            </StatusBadge>
          ) : tone ? (
            <StatusBadge tone={tone} className="shrink-0">
              {t(`chatDetails.cards.priority.${card.priority}`)}
            </StatusBadge>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

/** Os cards desta conversa, em qualquer quadro. Sem a permissão `pipelines`, a seção nem existe. */
export const PipelineSection = memo(function PipelineSection({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const { allowed, cards, error, isLoading, retry } = useChatPipelineCards(chatId)
  const [creating, setCreating] = useState(false)

  if (!allowed) return null

  const addButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("chatDetails.cards.create")}
      title={t("chatDetails.cards.create")}
      className="text-muted-foreground pointer-coarse:size-10"
      onClick={() => setCreating(true)}
    >
      <Plus />
    </Button>
  )

  return (
    <DetailsSection
      id="cards"
      title={t("chatDetails.cards.title")}
      count={cards.length}
      action={addButton}
    >
      {error ? (
        <SectionError message={t("chatDetails.cards.loadFailed")} onRetry={retry} />
      ) : isLoading ? (
        <SectionRowsSkeleton />
      ) : cards.length === 0 ? (
        <SectionEmpty>{t("chatDetails.cards.empty")}</SectionEmpty>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {cards.map((card) => (
            <CardRow key={card.id} card={card} />
          ))}
        </ul>
      )}

      {creating ? (
        <Suspense fallback={null}>
          <CreateCardDialog chatId={chatId} onClose={() => setCreating(false)} />
        </Suspense>
      ) : null}
    </DetailsSection>
  )
})
