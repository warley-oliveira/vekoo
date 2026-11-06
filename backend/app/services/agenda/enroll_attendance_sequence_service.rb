module Agenda
  # Inscreve um agendamento em uma sequência de comparecimento do calendário. Agenda um job por
  # passo, com tempos acumulados (cada passo sai `run_after` depois do anterior), respeitando o
  # horário comercial do passo.
  #
  # Reinscrever troca `sequence_token`, e os passos da inscrição anterior chegam e não fazem nada.
  class EnrollAttendanceSequenceService
    def initialize(booking, sequence_id, auto: false)
      @booking = booking
      @sequence_id = sequence_id
      @auto = auto
    end

    def call
      return failure(:booking_without_chat) if booking.chat_id.blank?
      return failure(:booking_not_active) unless booking.active?

      sequence = booking.calendar.attendance_sequence(sequence_id)
      return failure(:sequence_not_found) if sequence.blank?
      return failure(:sequence_disabled) unless sequence["enabled"]

      # Com o comparecimento ainda sem marcar (a inscrição automática por tempo), aceita a
      # sequência sem exigir o mesmo resultado.
      return failure(:sequence_mismatch) if booking.attendance_status.present? && sequence["trigger"] != booking.attendance_status

      steps = Array(sequence["steps"])
      return failure(:sequence_without_steps) if steps.blank?

      enroll(sequence, steps)
    end

    private

    attr_reader :booking, :sequence_id, :auto

    # Grava antes de enfileirar: um passo sem espera pode rodar antes de o token estar no banco, e
    # chegaria dizendo que foi cancelado.
    def enroll(sequence, steps)
      token = SecureRandom.uuid
      schedule = step_times(steps)

      booking.sequence_token = token
      booking.enrolled_sequence_id = sequence["id"].to_s
      booking.sequence_enrolled_at = Time.current
      booking.push_history(
        "event_name" => "sequence_enrolled",
        "sequence_id" => sequence["id"].to_s,
        "sequence_name" => sequence["name"],
        "trigger" => sequence["trigger"],
        "steps_count" => steps.size,
        "auto" => auto
      )
      booking.save!

      schedule.each do |step, run_at|
        AttendanceSequenceJob.set(wait_until: run_at).perform_later(
          booking.id.to_s, booking.organization_id, sequence["id"].to_s, step["id"].to_s, token
        )
      end

      Result.ok(sequence_id: sequence["id"].to_s, steps: schedule.map { |step, run_at| { step_id: step["id"].to_s, run_at: run_at } })
    end

    def step_times(steps)
      run_at = Time.current.in_time_zone(booking.zone)

      steps.map do |step|
        run_at = CommercialTime.next_after(
          run_at + step_interval(step),
          step["time_from"],
          step["time_at"],
          all_day: ActiveModel::Type::Boolean.new.cast(step["all_day"]) || false
        )
        [ step, run_at ]
      end
    end

    def step_interval(step)
      amount = step["run_after"].to_i
      case step["run_after_unit"].to_s.strip.downcase
      when "hours" then amount.hours
      when "days" then amount.days
      else amount.minutes
      end
    end

    def failure(code)
      Result.failure(code, scope: "agenda.sequences")
    end
  end
end
