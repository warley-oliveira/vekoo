# O trabalho agendado de uma conversa: o que o sistema ainda vai enviar sozinho, e quando.
#
# Na origem servia a follow-ups de assistente e a lembretes de agendamento. Sem assistente,
# hoje são os lembretes; o `kind` fica para o que vier (um passo de fluxo que espera, por exemplo).
#
# A linha também é o token de cancelamento do job. O job recebe `token` e só faz algo se a linha
# ainda estiver `pending`. Assim cancelar um lembrete específico não precisa mexer no Redis, e o
# job que já estava na fila chega e não faz nada.
#
# `superseded` separa "a pessoa cancelou" de "o sistema reagendou por cima": sem essa distinção o
# histórico mente, e toda remarcação apareceria como cancelamento.
class ScheduledAction
  include Mongoid::Document
  include Mongoid::Timestamps
  include StringEnum

  BOOKING_REMINDER = "booking_reminder".freeze
  KINDS = [ BOOKING_REMINDER ].freeze

  # Passou deste atraso, a tela não mostra como "vai sair": o job se perdeu (Redis zerado, por
  # exemplo), e a linha fica só como registro.
  OVERDUE_AFTER = 1.hour

  belongs_to :chat, class_name: "Chat", inverse_of: :scheduled_actions

  field :organization_id, type: String
  field :token, type: String
  field :job_class, type: String
  field :kind, type: String
  field :name, type: String # o rótulo mostrado a quem atende
  field :scheduled_at, type: Time
  field :booking_id, type: String
  # O que a tela precisa mostrar sem reabrir a configuração: config_index, booking_title,
  # booking_start, professional_name.
  field :metadata, type: Hash, default: {}
  field :executed_at, type: Time
  field :canceled_at, type: Time
  field :canceled_by_account_id, type: String

  string_enum :status, %i[pending executed canceled superseded], default: :pending

  index({ chat_id: 1, status_cd: 1, scheduled_at: 1 })
  index({ organization_id: 1, token: 1 }, { unique: true })
  index({ organization_id: 1, status_cd: 1 })
  index({ booking_id: 1, status_cd: 1 }, { sparse: true })

  validates :organization_id, presence: true
  validates :token, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :scheduled_at, presence: true

  scope :upcoming, -> { pending.where(:scheduled_at.gte => OVERDUE_AFTER.ago).order_by(scheduled_at: :asc) }

  class << self
    # Registra e agenda um lembrete ao contato. O registro não pode derrubar o agendamento: sem
    # ele não há lembrete, e o motivo fica no log.
    def schedule_booking_reminder!(booking, rule, index, run_at)
      action = create!(
        chat: booking.chat,
        organization_id: booking.organization_id,
        token: SecureRandom.uuid,
        job_class: Agenda::ContactNotificationJob.name,
        kind: BOOKING_REMINDER,
        name: reminder_label(rule),
        scheduled_at: run_at,
        booking_id: booking.id.to_s,
        metadata: {
          "config_index" => index,
          "booking_title" => booking.title,
          "booking_start" => ApplicationSerializer.epoch_ms(booking.start),
          "professional_name" => booking.professional&.name
        }.compact
      )

      enqueue(action, booking, index)
      broadcast_for(booking.chat)
      action
    rescue StandardError => e
      Rails.logger.error("[ScheduledAction] lembrete não agendado (#{booking.id}): #{e.class}: #{e.message}")
      action&.update(status: :canceled)
      nil
    end

    # O sistema reagendou por cima destas linhas.
    def supersede_for_booking!(booking_id)
      pending.where(booking_id: booking_id.to_s).update_all(status_cd: "superseded", updated_at: Time.current).modified_count.to_i
    end

    # O estado inteiro da conversa: o mesmo corpo do GET. O tempo real manda retrato, nunca
    # diferença, porque várias telas aplicam o mesmo evento, e com diferença duplicaria.
    def payload_for(chat)
      {
        actions: upcoming.where(chat_id: chat.id).map { |action| ScheduledActionSerializer.one(action) },
        automation: {
          enabled: chat.automation_enabled,
          reactivatesAt: ApplicationSerializer.epoch_ms(chat.automation_resume_at)
        }
      }
    end

    def broadcast_for(chat)
      return if chat.blank?

      ActionCable.server.broadcast(
        ChatMessage::Base.stream_for(chat),
        { event: "scheduled_actions_changed", chatId: chat.id.to_s, scheduledWork: payload_for(chat) }
      )
    rescue StandardError => e
      Rails.logger.error("[ScheduledAction] tempo real: #{e.class}: #{e.message}")
    end

    def reminder_label(rule)
      unit = rule["period"].presence_in(Agenda::Calendar::NOTIFICATION_PERIODS) || "hours"

      I18n.t("agenda.reminders.label_#{unit}", count: rule["interval"].to_i)
    end

    private

    def enqueue(action, booking, index)
      Agenda::ContactNotificationJob.set(wait_until: action.scheduled_at).perform_later(
        booking.id.to_s, booking.organization_id, index, action.token
      )
    end
  end

  # Só uma execução ganha: job repetido pelo Sidekiq não envia duas vezes.
  def claim!
    claimed = self.class.pending.where(_id: id).find_one_and_update(
      { "$set" => { status_cd: "executed", executed_at: Time.current, updated_at: Time.current } },
      return_document: :after
    )
    return false unless claimed

    reload
    true
  end

  def reschedule!(run_at)
    update!(scheduled_at: run_at)
  end
end
