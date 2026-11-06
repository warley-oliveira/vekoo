module Agenda
  # Quantos eventos há em cada dia, para os pontinhos do mini calendário. Os agendamentos, contados
  # no banco, no fuso da organização: às 22h de um dia em São Paulo, já é o dia seguinte em UTC. As
  # aulas, calculadas, no fuso do calendário da turma, que é o dia em que a aula acontece.
  class MonthCounts
    PAST_TTL = 24.hours
    CURRENT_TTL = 2.minutes

    def initialize(organization, range_start:, range_end:)
      @organization = organization
      @range_start = range_start
      @range_end = range_end
    end

    # @return [Hash] { "2026-02-01" => 3 }
    # @raise [EventQuery::RangeTooLong] as aulas são calculadas dia a dia, e aqui também
    def call
      raise EventQuery::RangeTooLong if range_end - range_start > EventQuery::MAX_RANGE

      Rails.cache.fetch(cache_key, expires_in: ttl) do
        bookings.merge(class_sessions) { |_day, booked, classes| booked + classes }
      end
    end

    private

    attr_reader :organization, :range_start, :range_end

    def zone_name
      organization.agenda_zone.tzinfo.name
    end

    def cache_key
      "agenda/month_counts/#{organization.id}/#{range_start.to_i}_#{range_end.to_i}"
    end

    def ttl
      range_end < Time.current.beginning_of_month ? PAST_TTL : CURRENT_TTL
    end

    # A origem repetia a chave `:status.ne`, e o Ruby ficava só com a última: agendamento arquivado
    # entrava na conta.
    def bookings
      scope = organization.agenda_bookings
                          .where(:start.gte => range_start, :start.lte => range_end, :status.nin => %w[archived canceled])

      Booking.collection.aggregate([
        { "$match" => scope.selector },
        { "$group" => {
          "_id" => { "$dateToString" => { "format" => "%Y-%m-%d", "date" => "$start", "timezone" => zone_name } },
          "count" => { "$sum" => 1 }
        } }
      ]).to_h { |row| [ row["_id"], row["count"] ] }
    end

    # As aulas calculadas também contam: a origem só via as exceções gravadas, e a turma não
    # aparecia no mini calendário.
    def class_sessions
      organization.agenda_class_groups.active.flat_map { |class_group|
        zone = class_group.zone

        SessionGeneratorService.new(class_group, range_start, range_end).call
                               .reject { |event| event[:status] == "canceled" }
                               .map { |event| TimeInput.from_epoch(event[:start], zone).strftime("%Y-%m-%d") }
      }.tally
    end
  end
end
