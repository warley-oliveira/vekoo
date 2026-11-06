module Agenda
  # A configuração das sequências de comparecimento de um calendário. Salvar substitui a lista
  # inteira, como a tela faz.
  class AttendanceSequencesController < BaseController
    include MessagePreview

    before_action :set_calendar

    def show
      render json: { attendanceSequences: CalendarSerializer.sequences(@calendar) }
    end

    def update
      if @calendar.update(attendance_sequences: normalized_sequences)
        render json: { attendanceSequences: CalendarSerializer.sequences(@calendar) }
      else
        render_invalid(@calendar)
      end
    end

    def bookings
      render json: { bookings: booking_candidates }
    end

    # Com as ferramentas em modo de simulação: o modelo pode consultar, mas nada é gravado.
    def preview
      render_preview(tools: true)
    end

    private

    def normalized_sequences
      params.permit(
        attendance_sequences: [
          :id, :name, :trigger, :enabled, :auto_enroll, :stop_on_reply, :ignore_automation_paused,
          :reactivate_automation, :auto_enroll_minutes_after_end,
          { auto_enroll_anchors: [], steps: %i[id name message ai_prompt run_after run_after_unit time_from time_at all_day] }
        ]
      ).to_h.fetch("attendance_sequences", []).map { |sequence| normalize(sequence) }
    end

    # A tela costuma mandar o id. Quem não manda ganha um aqui, porque os jobs acham a sequência e
    # o passo por ele.
    def normalize(sequence)
      sequence = sequence.to_h
      sequence["id"] = sequence["id"].presence || SecureRandom.uuid
      sequence["steps"] = Array(sequence["steps"]).map { |step| step.to_h.merge("id" => step["id"].presence || SecureRandom.uuid) }

      %w[enabled auto_enroll stop_on_reply ignore_automation_paused reactivate_automation].each do |key|
        sequence[key] = ActiveModel::Type::Boolean.new.cast(sequence[key]) || false
      end
      sequence
    end
  end
end
