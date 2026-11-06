module CustomDashboards
  module Sources
    # Agendamentos. Arquivado não aparece: é o que o calendário apagou da tela.
    module AgendaBookings
      DEFINITION = {
        model_class: "Agenda::Booking",
        orm: :mongoid,
        permission: :calendar,
        default_time_field: "start",
        scope: ->(account) { Agenda::Booking.where(organization_id: account.organization_id.to_s).listed },
        fields: [
          { key: "status", type: "enum", enum_values: %w[active canceled], labels: %w[active canceled] },
          { key: "attendance_status", type: "enum", enum_values: [ "show", "no_show", nil ], labels: { "show" => "show", "no_show" => "no_show", "" => "pending" } },
          { key: "start", type: "date", index: Insights::ChatIndexes::BOOKINGS_BY_START },
          { key: "end", type: "date" },
          { key: "professional_id", type: "string", cast: :object_id, label_from: :agenda_professionals, options_from: :agenda_professionals },
          { key: "service_id", type: "string", cast: :object_id, label_from: :agenda_services, options_from: :agenda_services },
          { key: "calendar_id", type: "string", cast: :object_id, label_from: :agenda_calendars, options_from: :agenda_calendars },
          { key: "created_at", type: "date", index: Insights::ChatIndexes::BY_CREATION },
          { key: "title", type: "string" }
        ],
        allowed_metrics: %w[count],
        allowed_dimensions: %w[status attendance_status professional_id service_id calendar_id start],
        related_dimensions: {
          "professional_name" => { local_field: "professional_id", model: "Agenda::Professional", display_field: "name" },
          "service_name" => { local_field: "service_id", model: "Agenda::Offering", display_field: "name" },
          "calendar_name" => { local_field: "calendar_id", model: "Agenda::Calendar", display_field: "name" }
        }
      }.freeze
    end
  end
end
