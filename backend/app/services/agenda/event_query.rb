module Agenda
  # A listagem do calendário: agendamentos e aulas em um intervalo, com os filtros da tela. Com
  # `chat_id`, são os agendamentos daquela conversa, sem intervalo e sem aulas (o painel do chat).
  #
  # Tudo parte da organização: id de filtro que for de outra só não acha nada.
  class EventQuery
    # A aula é calculada dia a dia. Sem teto, um intervalo de dez anos travaria uma thread do Puma.
    MAX_RANGE = 400.days

    class RangeTooLong < StandardError; end

    # @param filters [Hash] start, end, calendar_ids, service_ids, professional_ids, tag_ids, chat_id
    def initialize(organization, filters)
      @organization = organization
      @filters = filters
    end

    def call
      bookings = BookingSerializer.many(bookings_scope.order_by(start: :asc))
      return bookings if chat_id

      (bookings + class_sessions).sort_by { |event| event[:start] }
    end

    def range_start
      @range_start ||= parse_time(@filters[:start]) || zone.now.beginning_of_week
    end

    def range_end
      @range_end ||= parse_time(@filters[:end]) || zone.now.end_of_week
    end

    private

    def zone
      @organization.agenda_zone
    end

    def parse_time(value)
      TimeInput.parse(value, zone)
    end

    def chat_id
      @filters[:chat_id].presence
    end

    def ids(name)
      Array(@filters[name]).flat_map { |value| value.to_s.split(",") }.compact_blank
    end

    def object_ids(name)
      ChatHistory.object_ids(ids(name))
    end

    def bookings_scope
      scope = @organization.agenda_bookings.listed

      if chat_id
        scope = scope.where(chat_id: chat_id)
      else
        check_range!
        scope = scope.where(:start.gte => range_start, :start.lte => range_end)
      end

      scope = scope.where(:calendar_id.in => object_ids(:calendar_ids)) if ids(:calendar_ids).any?
      scope = scope.where(:service_id.in => object_ids(:service_ids)) if ids(:service_ids).any?
      scope = scope.where(:professional_id.in => object_ids(:professional_ids)) if ids(:professional_ids).any?
      scope = filter_by_tags(scope) if ids(:tag_ids).any?
      scope
    end

    def check_range!
      raise RangeTooLong if range_end - range_start > MAX_RANGE
    end

    # Primeiro as conversas do intervalo, depois as etiquetas. O caminho inverso pode juntar milhões
    # de ids num `$in`: uma etiqueta popular marca a base inteira.
    def filter_by_tags(scope)
      chat_ids = scope.distinct(:chat_id).compact
      tagged = Chat.where(organization_id: @organization.id.to_s, :id.in => chat_ids, :chat_tag_ids.in => object_ids(:tag_ids)).pluck(:_id)

      scope.where(:chat_id.in => tagged)
    end

    # As aulas só aparecem sem filtro que seja de agendamento: elas não têm profissional, serviço
    # nem conversa.
    def class_sessions
      return [] if (ids(:service_ids) + ids(:professional_ids) + ids(:tag_ids)).any?

      calendars = @organization.agenda_calendars.where(calendar_type: "class_group")
      calendars = calendars.where(:_id.in => object_ids(:calendar_ids)) if ids(:calendar_ids).any?
      calendar_ids = calendars.pluck(:_id)
      return [] if calendar_ids.empty?

      ClassGroup.active.where(organization_id: @organization.id.to_s, :calendar_id.in => calendar_ids).flat_map do |class_group|
        SessionGeneratorService.new(class_group, range_start, range_end).call
      end
    end
  end
end
