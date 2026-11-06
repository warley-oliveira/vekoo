module Agenda
  # Um agendamento (origem: `Scheduling::Appointment`).
  #
  # Quase tudo o que acontece ao redor dele sai daqui: histórico, tempo real, lembretes ao
  # contato e ao profissional, sequências de comparecimento e o espelho no Google Agenda.
  #
  # **Cancelar trabalho agendado é por token, sem Sidekiq::Status.** Cada leva de jobs leva um
  # token, e o job só faz algo se o token ainda for o vigente quando ele acordar. Mudou o
  # horário ou cancelou: o token troca, e o job antigo chega e não faz nada. Os lembretes ao
  # contato usam a linha de `ScheduledAction` como token, porque a tela do chat lista e cancela
  # um a um.
  #
  # `before_update` só anota o que mudou; os efeitos saem no `after_update`, com o documento já
  # gravado. Enfileirar antes faria o job ler o estado antigo.
  class Booking
    include Mongoid::Document
    include Mongoid::Timestamps

    STATUSES = %w[active canceled archived].freeze
    ATTENDANCE_STATUSES = %w[show no_show].freeze
    DEFAULT_COLOR = "#066fd1".freeze
    CANCELED_COLOR = "#e63333".freeze
    # O histórico mora no documento, então precisa de teto. Mudança de horário em excesso (o
    # Google arrastando um evento, por exemplo) não pode inchar um agendamento para sempre.
    MAX_EVENT_HISTORY = 100

    attr_accessor :event_user_name, :skip_professional_notifications, :skip_attendance_auto_enroll, :skip_google_push

    belongs_to :calendar, class_name: "Agenda::Calendar", inverse_of: :bookings
    belongs_to :professional, class_name: "Agenda::Professional", inverse_of: :bookings, optional: true
    belongs_to :service, class_name: "Agenda::Offering", inverse_of: :bookings, optional: true
    belongs_to :chat, class_name: "Chat", inverse_of: :bookings, optional: true
    belongs_to :connector, class_name: "Connector::GoogleCalendar", inverse_of: :bookings, optional: true

    field :organization_id, type: String
    field :status, type: String, default: "active"
    field :attendance_status, type: String
    field :start, type: Time
    field :end, type: Time
    field :contact_external_id, type: String
    field :external_id, type: String
    field :description, type: String
    field :color, type: String
    field :title, type: String
    field :google_event_id, type: String
    field :google_meet_url, type: String
    field :event_history, type: Array, default: []

    # Tokens de cancelamento: ver o comentário da classe.
    field :professional_reminder_token, type: String
    field :sequence_token, type: String
    field :fallback_enroll_token, type: String

    # Em qual sequência de comparecimento está, e desde quando.
    field :enrolled_sequence_id, type: String
    field :sequence_enrolled_at, type: Time

    # A listagem da tela e os painéis partem da organização e de um intervalo de datas.
    index({ organization_id: 1, start: 1 })
    index({ organization_id: 1, attendance_status: 1 })
    index({ organization_id: 1, created_at: -1 })
    index({ calendar_id: 1, start: -1 })
    # Conflito de horário e balanceamento.
    index({ professional_id: 1, start: 1 })
    index({ service_id: 1, start: 1 })
    index({ chat_id: 1, start: -1 })
    index({ connector_id: 1, google_event_id: 1 }, { sparse: true })

    scope :active, -> { where(status: "active") }
    scope :listed, -> { where(:status.ne => "archived") }

    before_validation :inherit_from_calendar

    validates :organization_id, presence: true
    validates :status, inclusion: { in: STATUSES }
    validates :attendance_status, inclusion: { in: ATTENDANCE_STATUSES }, allow_nil: true
    validates :start, :end, presence: true
    validate :ends_after_start
    validate :references_are_of_this_calendar

    before_create :prepare_creation
    before_update :record_changes
    after_create :after_created
    after_update :after_updated
    after_destroy :after_destroyed

    def self.scoped(organization_id, id)
      where(organization_id: organization_id.to_s, id: id).take
    end

    def active? = status == "active"
    def canceled? = status == "canceled"
    def archived? = status == "archived"

    def title
      super.presence || default_title
    end

    def color
      super.presence || professional&.color || DEFAULT_COLOR
    end

    def user_name
      chat&.user_name
    end

    def profile_picture_url
      chat&.profile_picture_url
    end

    def employee_name
      professional&.name
    end

    def service_name
      service&.name
    end

    def zone
      calendar&.zone || ActiveSupport::TimeZone[Calendar::DEFAULT_TIME_ZONE]
    end

    # O início no fuso do calendário: dia da semana, data e hora que a pessoa enxerga.
    def local_start
      start&.in_time_zone(zone)
    end

    # O texto do lembrete sai pelo canal da conversa, na hora marcada.
    def schedule_contact_reminders
      return unless chat && active? && calendar.scheduling_notification_enabled
      return if ScheduledAction.pending.where(booking_id: id.to_s).exists?

      Array(calendar.scheduling_notification_config).each_with_index do |rule, index|
        run_at = start - interval(rule["period"], rule["interval"])
        ScheduledAction.schedule_booking_reminder!(self, rule, index, run_at) if run_at > Time.current
      end
    end

    def cancel_contact_reminders
      return unless ScheduledAction.supersede_for_booking!(id).positive?

      ScheduledAction.broadcast_for(chat) if chat
    end

    def schedule_professional_reminders
      return unless active?

      rules = Array(calendar.professional_notifications_settings)
      due = rules.filter_map do |rule|
        run_at = start - interval(rule["period"], rule["time_before"])
        [ rule, run_at ] if run_at > Time.current
      end
      return if due.empty?

      token = SecureRandom.uuid
      set(professional_reminder_token: token)
      due.each do |rule, run_at|
        NotificationProfessionalJob.set(wait_until: run_at).perform_later(id.to_s, organization_id, rule.to_h.as_json, token)
      end
    end

    def cancel_professional_reminders
      set(professional_reminder_token: nil) if professional_reminder_token.present?
    end

    # Inscrição "X minutos depois do fim", para quando ninguém marca o comparecimento.
    def schedule_fallback_enroll
      return if fallback_enroll_token.present? || !active?

      sequence = Array(calendar.attendance_sequences).find do |item|
        item["trigger"] == "no_show" && item["enabled"] && item["auto_enroll"] &&
          Array(item["auto_enroll_anchors"]).include?("after_event_end")
      end
      return unless sequence

      run_at = self.end + sequence.fetch("auto_enroll_minutes_after_end", 60).to_i.minutes
      return unless run_at > Time.current

      token = SecureRandom.uuid
      set(fallback_enroll_token: token)
      AttendanceFallbackEnrollJob.set(wait_until: run_at).perform_later(id.to_s, organization_id, sequence["id"].to_s, token)
    end

    def cancel_fallback_enroll
      set(fallback_enroll_token: nil) if fallback_enroll_token.present?
    end

    def broadcast_to_chat
      return if chat_id.blank?

      ActionCable.server.broadcast(
        ChatMessage::Base.stream_for(chat),
        { event: "bookings_changed", chatId: chat_id.to_s }
      )
    rescue StandardError => e
      Rails.logger.error("[Agenda::Booking] tempo real da conversa: #{e.class}: #{e.message}")
    end

    def interval(period, amount)
      case period.to_s
      when "days" then amount.to_i.days
      when "minutes" then amount.to_i.minutes
      else amount.to_i.hours
      end
    end

    def push_history(entry)
      item = { "user_name" => event_user_name, "by_user" => event_user_name.present?, "updated_at" => Time.current }.merge(entry)
      self.event_history = Array(event_history).last(MAX_EVENT_HISTORY - 1) + [ item ]
    end

    private

    def default_title
      people = [ chat&.user_name, professional&.name ].compact_blank.join(" & ")
      [ service&.name, people.presence ].compact.join(" - ")
    end

    def inherit_from_calendar
      self.organization_id ||= calendar&.organization_id
      self.contact_external_id = chat&.external_id if chat_id_changed?
    end

    def ends_after_start
      return if start.blank? || self.end.blank? || self.end >= start

      errors.add(:end, I18n.t("agenda.validations.end_before_start"))
    end

    # A API passa ids que vêm de fora. Esta é a barreira que impede um agendamento de apontar
    # para a conversa ou o profissional de outra organização.
    def references_are_of_this_calendar
      errors.add(:calendar_id, I18n.t("agenda.validations.unknown_calendar")) if calendar && calendar.organization_id != organization_id
      errors.add(:professional_id, I18n.t("agenda.validations.unknown_professional")) if foreign?(:professional)
      errors.add(:service_id, I18n.t("agenda.validations.unknown_service")) if foreign?(:service)
      errors.add(:chat_id, I18n.t("agenda.validations.unknown_chat")) if chat_id_changed? && chat_id.present? && chat&.organization_id != organization_id
    end

    def foreign?(association)
      return false unless public_send(:"#{association}_id_changed?") && public_send(:"#{association}_id").present?

      public_send(association)&.calendar_id != calendar_id
    end

    def prepare_creation
      push_history("event_name" => "create")
    end

    def record_changes
      @changes_to_apply = []
      record_status_change if status_changed?
      record_time_change if start_changed? || end_changed?
      record_title_change if title_changed?
      record_attendance_change if attendance_status_changed?
    end

    def record_status_change
      return unless %w[canceled archived].include?(status)

      push_history("event_name" => status)
      self.color = CANCELED_COLOR
      @changes_to_apply << :stopped
      @changes_to_apply << :canceled if canceled?

      return if google_event_id.blank?

      @google_event_to_delete = google_event_id
      self.google_event_id = nil
    end

    def record_time_change
      return if start_was.blank? && end_was.blank?

      push_history("event_name" => "time_update", "start" => start_change, "end" => end_change)
      @changes_to_apply << :rescheduled
    end

    def record_title_change
      push_history("event_name" => "title_update", "title" => title_change)
    end

    def record_attendance_change
      push_history("event_name" => attendance_status.presence || "attendance_cleared")
      # Alguém agiu: o sistema não precisa mais concluir que a pessoa faltou.
      @changes_to_apply << :attendance_marked if attendance_status.present?
    end

    def after_created
      AgendaChannel.broadcast_booking(self, :create)
      broadcast_to_chat
      push_to_google

      return if skip_professional_notifications

      ProfessionalNotices.created(self) if professional_push_enabled?("created")
      notify_professional_whatsapp("created")
      schedule_professional_reminders
      schedule_fallback_enroll
      schedule_contact_reminders
    end

    def after_updated
      # Inscrever na sequência salva o documento de novo, e aí `previous_changes` já é outro. A
      # origem perdia a etiqueta de comparecimento justamente quando havia inscrição automática.
      saved = previous_changes.dup

      apply_recorded_changes

      AgendaChannel.broadcast_booking(self, archived? ? :destroy : :update)
      broadcast_to_chat

      sync_contact_reminders_with_chat(saved)
      push_to_google(saved)
      sync_attendance_chat_tags(saved)
      auto_enroll_attendance_sequences(saved)
    end

    def after_destroyed
      cancel_contact_reminders
      delete_from_google(google_event_id)

      AgendaChannel.broadcast_booking(self, :destroy)
      broadcast_to_chat
    end

    def apply_recorded_changes
      changes = @changes_to_apply || []
      @changes_to_apply = []

      if changes.include?(:stopped)
        cancel_contact_reminders
        cancel_professional_reminders
        cancel_fallback_enroll
      end

      if changes.include?(:canceled)
        ProfessionalNotices.canceled(self) if professional_push_enabled?("canceled")
        notify_professional_whatsapp("canceled")
      end

      if changes.include?(:rescheduled) && active?
        cancel_contact_reminders
        cancel_professional_reminders
        schedule_professional_reminders
        notify_professional_whatsapp("rescheduled")
        cancel_fallback_enroll
        schedule_fallback_enroll
        schedule_contact_reminders
      end

      cancel_fallback_enroll if changes.include?(:attendance_marked)

      delete_from_google(@google_event_to_delete)
      @google_event_to_delete = nil
    end

    # Só por uma conversa o lembrete tem por onde sair. Vinculou depois de criar: agenda agora.
    def sync_contact_reminders_with_chat(saved)
      return unless saved.key?("chat_id")

      ScheduledAction.supersede_for_booking!(id) if saved["chat_id"].first
      schedule_contact_reminders
    end

    # Aviso no WhatsApp do profissional. Complementa o push, cada um com o seu liga-desliga no
    # calendário. Aqui só enfileira: o envio é HTTP externo e não segura o agendamento.
    def notify_professional_whatsapp(event)
      return if professional_id.blank? || skip_professional_notifications
      return unless calendar.professional_event_rule(event)["whatsapp"]

      ProfessionalWhatsappJob.perform_later(id.to_s, organization_id, event)
    rescue StandardError => e
      Rails.logger.error("[Agenda::Booking] aviso ao profissional: #{e.class}: #{e.message}")
    end

    def professional_push_enabled?(event)
      calendar.professional_event_rule(event)["push"]
    end

    # O Google é um espelho, feito em job. Fora do ar, ou sem credencial, a agenda segue igual.
    def push_to_google(saved = nil)
      return if skip_google_push || !active?
      return unless calendar.google_calendar_connector_id.present?
      return if saved && (saved.keys & %w[start end title description]).empty?

      GooglePushJob.perform_later(id.to_s, organization_id)
    rescue StandardError => e
      Rails.logger.error("[Agenda::Booking] Google: #{e.class}: #{e.message}")
    end

    def delete_from_google(event_id)
      return if event_id.blank? || skip_google_push || calendar.google_calendar_connector_id.blank?

      GoogleDeleteJob.perform_later(calendar.google_calendar_connector_id, organization_id, event_id)
    rescue StandardError => e
      Rails.logger.error("[Agenda::Booking] Google: #{e.class}: #{e.message}")
    end

    # Marcou comparecimento: inscreve na sequência automática daquele resultado, se houver.
    def auto_enroll_attendance_sequences(saved)
      return if skip_attendance_auto_enroll
      return unless saved.key?("attendance_status")
      return unless ATTENDANCE_STATUSES.include?(attendance_status)
      return if chat_id.blank?

      sequence = Array(calendar.attendance_sequences).find do |item|
        item["trigger"] == attendance_status && item["enabled"] && item["auto_enroll"] &&
          (Array(item["auto_enroll_anchors"]).presence || [ "attendance_mark" ]).include?("attendance_mark")
      end
      return unless sequence

      EnrollAttendanceSequenceService.new(self, sequence["id"], auto: true).call
    rescue StandardError => e
      Rails.logger.error("[Agenda::Booking] inscrição automática: #{e.class}: #{e.message}")
    end

    # Espelha o comparecimento como etiqueta da conversa. Limpar tira as duas.
    def sync_attendance_chat_tags(saved)
      return unless saved.key?("attendance_status")
      return if chat_id.blank?

      keep = attendance_status.presence&.to_sym
      chat.sync_system_tags!(:attendance, keep)
    rescue StandardError => e
      Rails.logger.error("[Agenda::Booking] etiquetas: #{e.class}: #{e.message}")
    end
  end
end
