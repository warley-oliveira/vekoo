# Associações da organização com o domínio "agenda". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
#
# Tudo da agenda vive no Mongo, por isso são consultas e não `has_many`. Fora de uma classe do
# domínio, `::Agenda` com os dois-pontos: dentro deste módulo, `Agenda` é ele mesmo.
module OrganizationRelations
  module Agenda
    extend ActiveSupport::Concern

    def agenda_calendars
      ::Agenda::Calendar.where(organization_id: id)
    end

    def agenda_bookings
      ::Agenda::Booking.where(organization_id: id)
    end

    def agenda_professionals
      ::Agenda::Professional.where(organization_id: id)
    end

    def agenda_services
      ::Agenda::Offering.where(organization_id: id)
    end

    def agenda_class_groups
      ::Agenda::ClassGroup.where(organization_id: id)
    end

    def agenda_zone
      ActiveSupport::TimeZone[timezone.presence || ::Agenda::Calendar::DEFAULT_TIME_ZONE] ||
        ActiveSupport::TimeZone[::Agenda::Calendar::DEFAULT_TIME_ZONE]
    end
  end
end
