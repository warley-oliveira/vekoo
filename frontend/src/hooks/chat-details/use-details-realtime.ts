import { mutate as globalMutate } from "swr"

import { useChannel } from "@/hooks/use-channel"
import { useCan } from "@/hooks/use-can"
import type { ScheduledWork } from "@/lib/chat-details/types"
import { chatBookingsKey, scheduledActionsKey } from "./use-chat-details-data"

type DetailsEvent = {
  event?: string
  scheduledWork?: ScheduledWork
}

/**
 * Agendamentos e ações agendadas da conversa aberta. `applyChannelMessage` ignora esses eventos, e o
 * canal é o mesmo do histórico (`useChannel` divide a assinatura). Toda mensagem também passa por
 * aqui, então nada acontece além de olhar o nome do evento.
 */
export function useDetailsRealtime(chatId: string): void {
  const canCalendar = useCan("calendar")

  useChannel<DetailsEvent>("ChatChannel", { chatId }, (payload) => {
    if (!payload || typeof payload !== "object") return

    if (payload.event === "bookings_changed") {
      if (canCalendar) void globalMutate(chatBookingsKey(chatId))
    } else if (payload.event === "scheduled_actions_changed" && payload.scheduledWork) {
      void globalMutate(scheduledActionsKey(chatId), payload.scheduledWork, { revalidate: false })
    }
  })
}
