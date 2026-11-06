# O que a conversa ainda vai enviar sozinha. O `token` fica de fora: é o que libera o job.
class ScheduledActionSerializer < ApplicationSerializer
  def self.one(action)
    {
      id: action.id.to_s,
      chatId: action.chat_id&.to_s,
      kind: action.kind,
      name: action.name,
      status: action.status.to_s,
      scheduledAt: epoch_ms(action.scheduled_at),
      bookingId: action.booking_id,
      metadata: action.metadata.to_h.transform_keys { |key| key.to_s.camelize(:lower) }
    }
  end
end
