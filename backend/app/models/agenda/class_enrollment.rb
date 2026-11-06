module Agenda
  # A inscrição de um contato em uma turma. Com dia e hora, vale só para aquele horário; sem,
  # vale para todos os horários da turma (a inscrição antiga, feita pela tela da turma).
  class ClassEnrollment
    include Mongoid::Document
    include Mongoid::Timestamps

    STATUSES = %w[active canceled completed].freeze

    field :organization_id, type: String
    field :status, type: String, default: "active"
    field :enrolled_at, type: Time
    field :external_id, type: String
    field :notes, type: String
    # 0 = domingo ... 6 = sábado, no fuso do calendário.
    field :schedule_day_of_week, type: Integer
    field :schedule_window_start, type: String # "HH:MM"

    belongs_to :class_group, class_name: "Agenda::ClassGroup", inverse_of: :class_enrollments
    belongs_to :chat, class_name: "Chat", inverse_of: :class_enrollments
    has_many :class_attendances, class_name: "Agenda::ClassAttendance", inverse_of: :class_enrollment, dependent: :destroy

    index({ class_group_id: 1, status: 1 })
    index({ chat_id: 1 })
    # Dois cliques passam juntos pela validação de unicidade; este índice segura o segundo.
    index(
      { class_group_id: 1, chat_id: 1, schedule_day_of_week: 1, schedule_window_start: 1 },
      { unique: true, partial_filter_expression: { status: "active" } }
    )

    before_validation :inherit_from_class_group

    validates :organization_id, presence: true
    validates :status, inclusion: { in: STATUSES }
    # Só entre as ativas: quem cancelou pode se inscrever de novo. A origem comparava com todas,
    # e a segunda inscrição falhava dizendo que a pessoa já estava inscrita.
    validates :chat_id, uniqueness: {
      scope: %i[class_group_id schedule_day_of_week schedule_window_start],
      conditions: -> { where(status: "active") },
      message: ->(*) { I18n.t("agenda.validations.already_enrolled") }
    }, if: :active?
    validate :chat_is_of_this_organization

    before_create { self.enrolled_at ||= Time.current }

    scope :active, -> { where(status: "active") }
    # A inscrição daquele horário, ou a antiga, que vale para todos.
    scope :for_slot, lambda { |slot|
      any_of(
        { schedule_day_of_week: slot[:day_of_week], schedule_window_start: slot[:window_start] },
        { schedule_day_of_week: nil, schedule_window_start: nil }
      )
    }
    # Quem se inscreve hoje não aparece em aula passada.
    scope :enrolled_by, lambda { |at|
      any_of({ :enrolled_at.lte => at.end_of_day }, { enrolled_at: nil })
    }

    def active? = status == "active"

    private

    def inherit_from_class_group
      self.organization_id ||= class_group&.organization_id
    end

    def chat_is_of_this_organization
      return if chat_id.blank? || !chat_id_changed?
      return if chat&.organization_id == organization_id

      errors.add(:chat_id, I18n.t("agenda.validations.unknown_chat"))
    end
  end
end
