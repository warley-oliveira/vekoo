import { useTranslation } from "react-i18next"
import { SearchX } from "lucide-react"

import { EmptyState, ErrorState } from "@/components/shared"
import { useOpenChat } from "@/hooks/chat/use-open-chat"
import { useDetailsRealtime } from "@/hooks/chat-details/use-details-realtime"
import { ApiError } from "@/lib/api"
import { AssignmentRows } from "./assignment-rows"
import { BookingsSection } from "./bookings-section"
import { ChannelSection } from "./channel-section"
import { ContactHero } from "./contact-hero"
import { DetailsSkeleton } from "./details-skeleton"
import { FieldsSection } from "./fields-section"
import { FunnelsSection } from "./funnels-section"
import { NotesSection } from "./notes-section"
import { PipelineSection } from "./pipeline-section"
import { ScheduledSection } from "./scheduled-section"
import { TagsSection } from "./tags-section"

/**
 * Tudo sobre quem está do outro lado. A ordem é a de quem atende: quem é, quem cuida, as etiquetas e as
 * notas (o que se lê toda vez), o que está marcado para acontecer, onde a conversa está nos funis e
 * quadros, e só então os campos e o canal.
 *
 * Nasce de novo a cada conversa (`key` em quem chama): o que estava sendo editado não atravessa para
 * o próximo contato. Quem desenha cada seção lê do store o que mostra, sem receber a conversa inteira:
 * uma mensagem chegando não desenha o painel.
 */
export function ContactDetails({ chatId }: { chatId: string }) {
  const { t } = useTranslation()
  const { chat, error, retry } = useOpenChat(chatId)
  useDetailsRealtime(chatId)

  if (!chat) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={t("chatDetails.notFound")}
          description={t("chatDetails.notFoundHint")}
          className="m-4 border-0 p-6"
        />
      )
    }
    if (error) return <ErrorState error={error} onRetry={retry} className="m-4 border-0 p-6" />
    return <DetailsSkeleton />
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
      <ContactHero chatId={chatId} />
      <AssignmentRows chatId={chatId} />
      <TagsSection chatId={chatId} />
      <NotesSection chatId={chatId} />
      <BookingsSection chatId={chatId} />
      <ScheduledSection chatId={chatId} />
      <FunnelsSection chatId={chatId} />
      <PipelineSection chatId={chatId} />
      <FieldsSection chatId={chatId} />
      <ChannelSection chatId={chatId} />
    </div>
  )
}
