module Agenda
  # O agendamento como evento do calendário. `many` resolve conversa, profissional, serviço, foto e
  # nome dos campos de uma vez, em vez de uma consulta por agendamento.
  class BookingSerializer < ApplicationSerializer
    # As conversas vêm escopadas pela organização: nunca só por id (ver Chat).
    CHAT_FIELDS = %i[organization_id user_name profile_picture_url external_id custom_attributes].freeze

    class Context
      def initialize(bookings, preload: true)
        @bookings = bookings
        @bookings.each { |booking| attach(booking) } if preload
      end

      def avatar_for(booking)
        avatars[booking.professional&.account_id]
      end

      def custom_attributes_for(booking)
        attributes = booking.chat&.custom_attributes
        return {} if attributes.blank?

        attributes.to_h { |key, value| [ labels[key] || key, value ] }
      end

      private

      # A conversa pré-carregada traz só os campos da tela. Por isso só vale em listagem: quem vai
      # continuar usando o agendamento (os callbacks, por exemplo) não pode ficar com ela pela metade.
      def attach(booking)
        booking.set_relation(:chat, chats[booking.chat_id]) if booking.chat_id
        booking.set_relation(:professional, professionals[booking.professional_id]) if booking.professional_id
        booking.set_relation(:service, services[booking.service_id]) if booking.service_id
      end

      def organization_id
        @bookings.first&.organization_id
      end

      def ids_of(field)
        @bookings.filter_map(&field).uniq
      end

      def chats
        @chats ||= Chat.where(organization_id: organization_id, :id.in => ids_of(:chat_id)).only(*CHAT_FIELDS).index_by(&:id)
      end

      def professionals
        @professionals ||= Professional.where(organization_id: organization_id, :id.in => ids_of(:professional_id)).index_by(&:id)
      end

      def services
        @services ||= Offering.where(organization_id: organization_id, :id.in => ids_of(:service_id)).index_by(&:id)
      end

      def avatars
        @avatars ||= ProfessionalDirectory.avatars(@bookings.filter_map(&:professional))
      end

      def labels
        @labels ||= CustomFieldLabels.for(organization_id, @bookings.filter_map(&:chat).flat_map { |chat| chat.custom_attributes.to_h.keys }.uniq)
      end
    end

    def self.many(bookings)
      records = bookings.to_a
      context = Context.new(records)

      records.map { |booking| one(booking, context) }
    end

    def self.one(booking, context = Context.new([ booking ], preload: false))
      {
        id: booking.id.to_s,
        type: "booking",
        calendarId: booking.calendar_id&.to_s,
        professionalId: booking.professional_id&.to_s,
        professionalName: booking.employee_name,
        professionalAvatarUrl: context.avatar_for(booking),
        serviceId: booking.service_id&.to_s,
        serviceName: booking.service_name,
        chatId: booking.chat_id&.to_s,
        contactExternalId: booking.contact_external_id,
        userName: booking.user_name,
        profilePictureUrl: booking.profile_picture_url,
        customAttributes: context.custom_attributes_for(booking),
        title: booking.title,
        description: booking.description,
        color: booking.color,
        start: epoch_ms(booking.start),
        end: epoch_ms(booking.end),
        status: booking.status,
        attendanceStatus: booking.attendance_status,
        externalId: booking.external_id,
        googleMeetUrl: booking.google_meet_url,
        enrolledSequenceId: booking.enrolled_sequence_id,
        sequenceEnrolledAt: epoch_ms(booking.sequence_enrolled_at),
        eventHistory: history(booking),
        createdAt: epoch_ms(booking.created_at),
        updatedAt: epoch_ms(booking.updated_at)
      }
    end

    # O agendamento na lista de candidatos para simular uma mensagem.
    def self.candidate(booking)
      {
        id: booking.id.to_s,
        chatId: booking.chat_id&.to_s,
        userName: booking.user_name,
        title: booking.title,
        start: epoch_ms(booking.start),
        end: epoch_ms(booking.end),
        serviceName: booking.service_name,
        professionalName: booking.employee_name,
        attendanceStatus: booking.attendance_status
      }
    end

    def self.history(booking)
      Array(booking.event_history).map do |entry|
        entry.to_h.each_with_object({}) do |(key, value), item|
          item[key.to_s.camelize(:lower)] = history_value(value)
        end
      end
    end

    def self.history_value(value)
      case value
      when Array then value.map { |inner| history_value(inner) }
      when Time, DateTime, ActiveSupport::TimeWithZone then epoch_ms(value.to_time)
      else value
      end
    end
    private_class_method :history_value
  end
end
