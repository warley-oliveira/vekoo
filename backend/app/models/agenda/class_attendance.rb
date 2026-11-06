module Agenda
  # A presença de um contato em uma aula. Inscrito sem registro conta como pendente, e a API o
  # devolve com id `ve_<inscrição>` até alguém marcar. `guest` é quem veio só nesta aula.
  class ClassAttendance
    include Mongoid::Document
    include Mongoid::Timestamps

    STATUSES = %w[show no_show].freeze

    field :organization_id, type: String
    field :attendance_status, type: String
    field :checked_at, type: Time
    field :checked_by, type: String
    field :guest, type: Boolean, default: false

    belongs_to :class_session, class_name: "Agenda::ClassSession", inverse_of: :class_attendances
    belongs_to :class_enrollment, class_name: "Agenda::ClassEnrollment", inverse_of: :class_attendances, optional: true
    belongs_to :chat, class_name: "Chat", inverse_of: :class_attendances

    index({ class_session_id: 1, chat_id: 1 }, { unique: true })
    index({ class_enrollment_id: 1 }, { sparse: true })
    index({ chat_id: 1 })

    before_validation { self.organization_id ||= class_session&.organization_id }

    validates :organization_id, presence: true
    validates :attendance_status, inclusion: { in: STATUSES }, allow_nil: true
    validates :class_enrollment_id, uniqueness: {
      scope: :class_session_id, message: ->(*) { I18n.t("agenda.validations.attendance_taken") }
    }, allow_nil: true
    validates :chat_id, uniqueness: {
      scope: :class_session_id, message: ->(*) { I18n.t("agenda.validations.attendance_taken") }
    }

    def guest?
      guest == true || class_enrollment_id.blank?
    end
  end
end
