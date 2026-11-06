module Agenda
  # O calendário pertence à organização. Na origem podia estar ligado a um assistente; aqui
  # quem automatiza é o fluxo, e ele escolhe o calendário (`Agenda::BookingService.new(calendar)`).
  #
  # `time_zone` é um nome IANA, como `Organization#timezone`. A origem guardava um deslocamento
  # inteiro (-3), que erra em todo lugar com horário de verão.
  class Calendar
    include Mongoid::Document
    include Mongoid::Timestamps

    CALENDAR_TYPES = %w[professional class_group].freeze
    REBALANCING_PERIODS = %w[day week month].freeze
    PROFESSIONAL_EVENTS = %w[created canceled rescheduled].freeze
    NOTIFICATION_PERIODS = %w[minutes hours days].freeze
    SEQUENCE_TRIGGERS = %w[show no_show].freeze
    SEQUENCE_ANCHORS = %w[attendance_mark after_event_end].freeze
    STEP_UNITS = %w[minutes hours days].freeze
    DEFAULT_TIME_ZONE = BusinessWorkWindow::DEFAULT_TIMEZONE

    # `push: true` em created/canceled é o que a origem já fazia. `rescheduled` não tinha push:
    # nasce desligado. O texto é o modelo do aviso, obra de quem usa, e fica em pt-BR como as
    # variáveis dele. É editável por calendário.
    PROFESSIONAL_EVENT_DEFAULTS = {
      "created" => {
        "push" => true,
        "whatsapp" => true,
        "message" => "Olá, {{profissional}}! Você tem um novo agendamento com {{nome}} em {{data}} às {{hora}}."
      },
      "canceled" => {
        "push" => true,
        "whatsapp" => true,
        "message" => "Olá, {{profissional}}. O agendamento com {{nome}} em {{data}} às {{hora}} foi cancelado."
      },
      "rescheduled" => {
        "push" => false,
        "whatsapp" => true,
        "message" => "Olá, {{profissional}}. O agendamento com {{nome}} mudou de horário: agora é {{data}} às {{hora}}."
      }
    }.freeze

    field :organization_id, type: String
    field :name, type: String
    field :description, type: String
    field :time_zone, type: String
    field :rebalancing_period, type: String, default: "week"
    field :calendar_type, type: String, default: "professional"
    field :color, type: String, default: "#3f51b5"

    # Lembretes ao profissional antes do início: { time_before, period, message, push, whatsapp }.
    # `push` e `whatsapp` ausentes valem ligado.
    field :professional_notifications_settings, type: Array, default: []

    # Canal dos avisos ao profissional. Vazio: o canal da conversa do agendamento, se servir.
    #
    # Só canal não oficial envia: a WABA recusa texto livre fora da janela de 24 horas, e o
    # profissional nunca escreve primeiro, então a janela está sempre fechada.
    field :professional_whatsapp_connector_id, type: String

    # Avisos por evento: { event, push, whatsapp, message }. Vazio cai em PROFESSIONAL_EVENT_DEFAULTS.
    field :professional_event_notifications, type: Array, default: []

    # Lembretes ao contato: { interval, period, message, ai_prompt }. `message` é o texto, com as
    # variáveis de `BookingPlaceholders`. Com `ai_prompt`, o texto é gerado (e cobrado em
    # créditos), e `message` fica como o que sai se a geração não for possível.
    field :scheduling_notification_enabled, type: Boolean, default: false
    field :scheduling_notification_config, type: Array, default: []

    # Dois escapes para o lembrete sair com a automação desligada na conversa. Nascem falsos:
    # uma conversa que uma pessoa assumiu não recebe mensagem sozinha, a não ser que peçam.
    #   reactivate_automation     religa a automação na conversa antes de enviar
    #   ignore_automation_paused  envia sem religar nada
    field :scheduling_notification_reactivate_automation, type: Boolean, default: false
    field :scheduling_notification_ignore_automation_paused, type: Boolean, default: false

    # Sequências de comparecimento, depois de marcar quem veio ou não:
    #   { id, name, trigger, enabled, auto_enroll, stop_on_reply, ignore_automation_paused,
    #     reactivate_automation, auto_enroll_anchors, auto_enroll_minutes_after_end,
    #     steps: [{ id, name, message, ai_prompt, run_after, run_after_unit, time_from, time_at, all_day }] }
    field :attendance_sequences, type: Array, default: []

    field :google_calendar_connector_id, type: String

    has_many :bookings, class_name: "Agenda::Booking", inverse_of: :calendar, dependent: :destroy
    has_many :professionals, class_name: "Agenda::Professional", inverse_of: :calendar, dependent: :destroy
    has_many :services, class_name: "Agenda::Offering", inverse_of: :calendar, dependent: :destroy
    has_many :class_groups, class_name: "Agenda::ClassGroup", inverse_of: :calendar, dependent: :destroy
    has_many :class_sessions, class_name: "Agenda::ClassSession", inverse_of: :calendar, dependent: :destroy

    index({ organization_id: 1, created_at: 1 })
    index({ organization_id: 1, calendar_type: 1 })
    index({ google_calendar_connector_id: 1 }, { sparse: true })

    before_validation :default_time_zone

    validates :organization_id, presence: true
    validates :name, presence: true, length: { maximum: 120 }
    validates :calendar_type, inclusion: { in: CALENDAR_TYPES }
    validates :rebalancing_period, inclusion: { in: REBALANCING_PERIODS }
    validate :time_zone_is_known
    validate :notification_rules_are_valid
    validate :attendance_sequences_are_valid

    def self.scoped(organization_id, id)
      where(organization_id: organization_id.to_s, id: id).take
    end

    # Para quem não escolhe calendário (bloco de fluxo sem configuração): o mais antigo de
    # profissionais da organização.
    def self.default_for(organization_id)
      where(organization_id: organization_id.to_s, calendar_type: "professional").order_by(created_at: :asc).first
    end

    def organization
      @organization ||= Organization.find_by(id: organization_id)
    end

    def zone
      ActiveSupport::TimeZone[time_zone.presence || DEFAULT_TIME_ZONE] || ActiveSupport::TimeZone[DEFAULT_TIME_ZONE]
    end

    def google_calendar_connector
      return nil if google_calendar_connector_id.blank?

      Connector::GoogleCalendar.where(organization_id: organization_id, id: google_calendar_connector_id).take
    end

    def google_calendar_connected?
      google_calendar_connector&.active? || false
    end

    # Regra efetiva de um evento: o que está salvo por cima do padrão. `compact` porque a tela
    # pode mandar a chave com nil ao limpar um campo, e nil aqui cai no padrão em vez de virar
    # mensagem vazia.
    def professional_event_rule(event)
      default = PROFESSIONAL_EVENT_DEFAULTS.fetch(event.to_s)
      stored = Array(professional_event_notifications).find { |rule| rule["event"].to_s == event.to_s } || {}

      default.merge(stored.slice("push", "whatsapp", "message").compact)
    end

    # As regras já resolvidas: sem isto a tela teria de repetir os textos padrão, e as duas
    # cópias divergiriam na primeira mudança de redação.
    def professional_event_rules
      PROFESSIONAL_EVENTS.map { |event| professional_event_rule(event).merge("event" => event) }
    end

    # O canal escolhido, se ainda existir, for não oficial e estiver ativo. Qualquer outra coisa
    # devolve nil, e o aviso tenta o canal da conversa.
    def professional_whatsapp_connector
      return nil if professional_whatsapp_connector_id.blank?

      connector = Connector::Base.scoped(organization_id, professional_whatsapp_connector_id)
      connector if ProfessionalWhatsappNotifier.deliverable_connector?(connector)
    end

    def attendance_sequence(sequence_id)
      Array(attendance_sequences).find { |sequence| sequence["id"].to_s == sequence_id.to_s }
    end

    private

    def default_time_zone
      self.time_zone = organization&.timezone.presence || DEFAULT_TIME_ZONE if time_zone.blank?
    end

    def time_zone_is_known
      return if ActiveSupport::TimeZone[time_zone.to_s] && time_zone.to_s.include?("/")

      errors.add(:time_zone, I18n.t("agenda.validations.unknown_time_zone"))
    end

    def notification_rules_are_valid
      Array(scheduling_notification_config).each do |rule|
        next if NOTIFICATION_PERIODS.include?(rule["period"].to_s) && rule["interval"].to_i.positive? &&
                (rule["message"].present? || rule["ai_prompt"].present?)

        errors.add(:scheduling_notification_config, I18n.t("agenda.validations.invalid_reminder_rule"))
        break
      end

      Array(professional_notifications_settings).each do |rule|
        next if NOTIFICATION_PERIODS.include?(rule["period"].to_s) && rule["time_before"].to_i.positive?

        errors.add(:professional_notifications_settings, I18n.t("agenda.validations.invalid_reminder_rule"))
        break
      end

      Array(professional_event_notifications).each do |rule|
        next if PROFESSIONAL_EVENTS.include?(rule["event"].to_s)

        errors.add(:professional_event_notifications, I18n.t("agenda.validations.invalid_event_rule"))
        break
      end
    end

    def attendance_sequences_are_valid
      Array(attendance_sequences).each do |sequence|
        problem = sequence_problem(sequence)
        next unless problem

        errors.add(:attendance_sequences, I18n.t("agenda.validations.#{problem}", name: sequence["name"].to_s))
        break
      end
    end

    def sequence_problem(sequence)
      return :sequence_without_name if sequence["name"].blank?
      return :sequence_invalid_trigger unless SEQUENCE_TRIGGERS.include?(sequence["trigger"].to_s)
      return :sequence_invalid_anchor if (Array(sequence["auto_enroll_anchors"]).map(&:to_s) - SEQUENCE_ANCHORS).any?

      Array(sequence["steps"]).filter_map { |step| step_problem(step) }.first
    end

    def step_problem(step)
      return :step_without_text if step["message"].blank? && step["ai_prompt"].blank?
      return :step_invalid_unit unless STEP_UNITS.include?(step["run_after_unit"].to_s)
      return :step_invalid_delay if step["run_after"].to_i.negative?
      return if ActiveModel::Type::Boolean.new.cast(step["all_day"])
      return if step["time_from"].blank? && step["time_at"].blank?

      from = step["time_from"].to_i
      to = step["time_at"].to_i
      :step_invalid_hours unless (0..23).cover?(from) && (0..24).cover?(to) && from < to
    end
  end
end
