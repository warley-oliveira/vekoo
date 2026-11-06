module Agenda
  # O resumo do calendário no dashboard. Conta no banco: a origem carregava cada agendamento do
  # período para somar por dia e por hora, e fazia uma contagem por profissional. Dia, hora e dia da
  # semana no fuso da organização: em UTC, o movimento das 21h cairia no dia seguinte.
  class CalendarStats
    UPCOMING_LIMIT = 5
    UPCOMING_WINDOW = 7.days
    DEFAULT_RANGE = 1.year

    def initialize(organization, date_start: nil, date_end: nil)
      @organization = organization
      @zone = organization.agenda_zone
      @date_start = (TimeInput.parse(date_start, @zone) || @zone.now - DEFAULT_RANGE).beginning_of_day
      @date_end = (TimeInput.parse(date_end, @zone) || @zone.now).end_of_day
    end

    def call
      {
        **totals,
        attendanceRate: percentage(totals[:show], totals[:show] + totals[:noShow]),
        cancellationRate: percentage(totals[:canceled], totals[:total]),
        daily: daily,
        upcoming: upcoming,
        byProfessional: by_professional,
        byDayOfWeek: distribution(1..7, "$dayOfWeek"),
        byHour: distribution(0..23, "$hour"),
        avgPerDay: average_per_day
      }
    end

    private

    attr_reader :organization, :zone, :date_start, :date_end

    def scope
      organization.agenda_bookings.listed.where(:start.gte => date_start, :start.lte => date_end)
    end

    def aggregate(*stages)
      Booking.collection.aggregate([ { "$match" => scope.selector }, *stages ]).to_a
    end

    def totals
      @totals ||= begin
        rows = aggregate(
          { "$group" => {
            "_id" => { "attendance" => "$attendance_status", "status" => "$status" },
            "count" => { "$sum" => 1 }
          } }
        )
        count = ->(&condition) { rows.select { |row| condition.call(row["_id"]) }.sum { |row| row["count"] } }

        {
          total: rows.sum { |row| row["count"] },
          show: count.call { |id| id["attendance"] == "show" },
          noShow: count.call { |id| id["attendance"] == "no_show" },
          pending: count.call { |id| id["attendance"].nil? },
          canceled: count.call { |id| id["status"] == "canceled" },
          active: count.call { |id| id["status"] == "active" }
        }
      end
    end

    def percentage(part, whole)
      whole.positive? ? (part.to_f / whole * 100).round(1) : nil
    end

    def daily
      aggregate(
        { "$match" => { "attendance_status" => { "$in" => Booking::ATTENDANCE_STATUSES } } },
        { "$group" => {
          "_id" => { "day" => local("$dateToString", "format" => "%Y-%m-%d"), "attendance" => "$attendance_status" },
          "count" => { "$sum" => 1 }
        } }
      ).group_by { |row| row["_id"]["day"] }.sort.map do |day, rows|
        counts = rows.to_h { |row| [ row["_id"]["attendance"], row["count"] ] }

        { date: day, show: counts["show"].to_i, noShow: counts["no_show"].to_i }
      end
    end

    def upcoming
      records = organization.agenda_bookings.active
                            .where(:start.gte => Time.current, :start.lte => UPCOMING_WINDOW.from_now)
                            .order_by(start: :asc).limit(UPCOMING_LIMIT).to_a
      BookingSerializer::Context.new(records)

      records.map do |booking|
        {
          id: booking.id.to_s,
          title: booking.title,
          start: ApplicationSerializer.epoch_ms(booking.start),
          end: ApplicationSerializer.epoch_ms(booking.end),
          status: booking.status,
          attendanceStatus: booking.attendance_status,
          color: booking.color
        }
      end
    end

    def by_professional
      rows = aggregate(
        { "$match" => { "professional_id" => { "$ne" => nil } } },
        { "$group" => {
          "_id" => "$professional_id",
          "total" => { "$sum" => 1 },
          "show" => { "$sum" => { "$cond" => [ { "$eq" => [ "$attendance_status", "show" ] }, 1, 0 ] } },
          "noShow" => { "$sum" => { "$cond" => [ { "$eq" => [ "$attendance_status", "no_show" ] }, 1, 0 ] } }
        } }
      )
      professionals = organization.agenda_professionals.where(:_id.in => rows.map { |row| row["_id"] }).index_by(&:id)

      rows.filter_map { |row|
        professional = professionals[row["_id"]]
        next unless professional

        {
          id: professional.id.to_s,
          name: professional.name,
          color: professional.color,
          show: row["show"],
          noShow: row["noShow"],
          total: row["total"]
        }
      }.sort_by { |item| -item[:total] }
    end

    # `$dayOfWeek` do Mongo vai de 1 (domingo) a 7. A tela usa 0 a 6, como `Date#wday`.
    def distribution(range, operator)
      counts = aggregate(
        { "$group" => { "_id" => local(operator), "count" => { "$sum" => 1 } } }
      ).to_h { |row| [ row["_id"], row["count"] ] }

      range.map { |key| counts[key].to_i }
    end

    def local(operator, extra = {})
      { operator => { "date" => "$start", "timezone" => zone.tzinfo.name }.merge(extra) }
    end

    def average_per_day
      days = (date_end.to_date - date_start.to_date).to_i + 1
      days.positive? ? (totals[:total].to_f / days).round(1) : 0
    end
  end
end
