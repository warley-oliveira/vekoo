require "rails_helper"

RSpec.describe Agenda::EnrollAttendanceSequenceService do
  include ActiveSupport::Testing::TimeHelpers

  let(:calendar) { create(:agenda_calendar, attendance_sequences: [ sequence ], time_zone: "America/Sao_Paulo") }
  let(:chat) { create(:chat, organization_id: calendar.organization_id) }
  let(:booking) { create(:agenda_booking, calendar: calendar, chat: chat, attendance_status: "no_show", skip_professional_notifications: true) }
  let(:sequence) do
    {
      "id" => "seq-1", "name" => "Recuperar", "trigger" => "no_show", "enabled" => true,
      "steps" => [
        { "id" => "s1", "message" => "Sentimos sua falta", "run_after" => 1, "run_after_unit" => "hours", "all_day" => true },
        { "id" => "s2", "message" => "Vamos remarcar?", "run_after" => 2, "run_after_unit" => "days", "all_day" => true }
      ]
    }
  end

  def enroll(**options)
    described_class.new(booking, "seq-1", **options).call
  end

  around { |example| travel_to(Time.utc(2030, 1, 14, 15, 0)) { example.run } }

  it "agenda um job por passo, com os tempos acumulados" do
    result = nil

    expect { result = enroll }.to have_enqueued_job(Agenda::AttendanceSequenceJob).exactly(2).times

    expect(result).to be_success
    times = result.data[:steps].map { |step| step[:run_at].utc }
    expect(times).to eq([ Time.utc(2030, 1, 14, 16, 0), Time.utc(2030, 1, 16, 16, 0) ])
  end

  it "grava a inscrição e o histórico" do
    enroll(auto: true)

    expect(booking.reload).to have_attributes(enrolled_sequence_id: "seq-1", sequence_token: be_present, sequence_enrolled_at: be_present)
    expect(booking.event_history.last).to include("event_name" => "sequence_enrolled", "sequence_name" => "Recuperar", "steps_count" => 2, "auto" => true)
  end

  it "reinscrever troca o token, e os passos antigos deixam de valer" do
    enroll
    first = booking.reload.sequence_token

    enroll

    expect(booking.reload.sequence_token).not_to eq(first)
  end

  it "grava antes de enfileirar, para o passo sem espera não chegar sem token" do
    sequence["steps"] = [ { "id" => "s1", "message" => "Agora", "run_after" => 0, "run_after_unit" => "minutes", "all_day" => true } ]
    seen = nil
    allow(Agenda::AttendanceSequenceJob).to receive(:set).and_wrap_original do |original, *args|
      seen = Agenda::Booking.find(booking.id).sequence_token
      original.call(*args)
    end

    enroll

    expect(seen).to be_present
  end

  describe "horário comercial do passo" do
    # 12:00 em São Paulo, com o servidor em UTC.
    it "joga para a abertura do dia seguinte, no fuso do calendário" do
      sequence["steps"] = [ { "id" => "s1", "message" => "Oi", "run_after" => 8, "run_after_unit" => "hours", "time_from" => 9, "time_at" => 18 } ]

      run_at = enroll.data[:steps].first[:run_at]

      # 12:00 + 8h = 20:00: já fechou. Abre às 9:00 do dia seguinte, em São Paulo.
      expect(run_at.utc).to eq(Time.utc(2030, 1, 15, 12, 0))
    end
  end

  describe "falhas" do
    it "agendamento sem conversa" do
      booking.update!(chat_id: nil)

      expect(enroll).to have_attributes(success?: false, code: "bookingWithoutChat")
    end

    it "agendamento cancelado" do
      booking.update!(status: "canceled")

      expect(enroll).to have_attributes(success?: false, code: "bookingNotActive")
    end

    it "sequência que não existe" do
      expect(described_class.new(booking, "outra").call.code).to eq("sequenceNotFound")
    end

    it "sequência desligada" do
      sequence["enabled"] = false

      expect(enroll.code).to eq("sequenceDisabled")
    end

    it "sequência de outro resultado" do
      booking.update!(attendance_status: "show")

      expect(enroll.code).to eq("sequenceMismatch")
    end

    it "sequência sem passos" do
      sequence["steps"] = []

      expect(enroll.code).to eq("sequenceWithoutSteps")
    end

    it "sem comparecimento marcado, aceita qualquer sequência" do
      booking.update!(attendance_status: nil)

      expect(enroll).to be_success
    end
  end
end
