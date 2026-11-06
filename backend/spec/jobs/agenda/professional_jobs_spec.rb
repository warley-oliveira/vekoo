require "rails_helper"

RSpec.describe "Jobs de aviso ao profissional" do
  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:account) { create(:account, organization: organization, name: "Dra. Ana") }
  let(:professional) { create(:agenda_professional, calendar: calendar, account_id: account.id, phone: "5531983794137") }
  let(:chat) { create(:chat, organization_id: organization.id, user_name: "Maria") }
  let(:booking) { create(:agenda_booking, calendar: calendar, professional: professional, chat: chat, skip_professional_notifications: true) }
  let(:notifier) { instance_double(Agenda::ProfessionalWhatsappNotifier, call: nil) }

  before { allow(Agenda::ProfessionalWhatsappNotifier).to receive(:new).and_return(notifier) }

  describe Agenda::ProfessionalWhatsappJob do
    def perform(event)
      described_class.perform_now(booking.id.to_s, organization.id.to_s, event)
    end

    it "entrega com a mensagem padrão do evento" do
      perform("created")

      expect(Agenda::ProfessionalWhatsappNotifier).to have_received(:new)
        .with(booking, template: include("novo agendamento"), label: "Agenda: novo agendamento")
      expect(notifier).to have_received(:call)
    end

    it "usa a mensagem do calendário quando existe" do
      calendar.update!(professional_event_notifications: [ { "event" => "created", "message" => "Chegou {{nome}}" } ])

      perform("created")

      expect(Agenda::ProfessionalWhatsappNotifier).to have_received(:new).with(anything, hash_including(template: "Chegou {{nome}}"))
    end

    it "não envia com o WhatsApp desligado no evento" do
      calendar.update!(professional_event_notifications: [ { "event" => "created", "whatsapp" => false } ])

      perform("created")

      expect(notifier).not_to have_received(:call)
    end

    it "descarta outro evento em agendamento cancelado, mas entrega o cancelamento" do
      booking.update!(status: "canceled")

      perform("rescheduled")
      expect(notifier).not_to have_received(:call)

      perform("canceled")
      expect(notifier).to have_received(:call).once
    end

    it "não acha agendamento de outra organização" do
      described_class.perform_now(booking.id.to_s, create(:organization).id.to_s, "created")

      expect(notifier).not_to have_received(:call)
    end
  end

  describe Agenda::NotificationProfessionalJob do
    let(:rule) { { "message" => "Lembrete: {{nome}} às {{hora}}", "time_before" => 1, "period" => "hours" } }

    before { booking.set(professional_reminder_token: "token-1") }

    def perform(rule_override = rule, token: "token-1")
      described_class.perform_now(booking.id.to_s, organization.id.to_s, rule_override, token)
    end

    it "avisa no sino e no WhatsApp por padrão" do
      perform

      notice = AccountNotice.where(account_id: account.id).take
      expect(notice.title).to eq("Lembrete de agendamento")
      expect(notice.description).to include("Lembrete: Maria às")
      expect(notifier).to have_received(:call)
    end

    it "passa o modelo cru ao WhatsApp, que preenche sozinho" do
      perform

      expect(Agenda::ProfessionalWhatsappNotifier).to have_received(:new).with(booking, hash_including(template: rule["message"]))
    end

    it "respeita o sino desligado" do
      perform(rule.merge("push" => false))

      expect(AccountNotice.where(account_id: account.id)).to be_empty
      expect(notifier).to have_received(:call)
    end

    it "respeita o WhatsApp desligado" do
      perform(rule.merge("whatsapp" => false))

      expect(AccountNotice.where(account_id: account.id).count).to eq(1)
      expect(notifier).not_to have_received(:call)
    end

    it "token vencido, porque remarcou ou cancelou: não faz nada" do
      perform(token: "token-velho")

      expect(AccountNotice.where(account_id: account.id)).to be_empty
      expect(notifier).not_to have_received(:call)
    end

    it "agendamento cancelado: não faz nada" do
      booking.update!(status: "canceled")

      perform

      expect(notifier).not_to have_received(:call)
    end

    it "sem texto na regra, usa o padrão" do
      perform(rule.except("message"))

      expect(AccountNotice.where(account_id: account.id).take.description).to include("Maria")
    end
  end
end

RSpec.describe Agenda::AttendanceFallbackEnrollJob do
  let(:calendar) do
    create(:agenda_calendar, attendance_sequences: [ {
      "id" => "seq-1", "name" => "Faltou", "trigger" => "no_show", "enabled" => true, "auto_enroll" => true,
      "auto_enroll_anchors" => [ "attendance_mark" ],
      "steps" => [ { "id" => "s1", "message" => "Oi", "run_after" => 1, "run_after_unit" => "hours", "all_day" => true } ]
    } ])
  end
  let(:chat) { create(:chat, organization_id: calendar.organization_id) }
  let(:booking) { create(:agenda_booking, calendar: calendar, chat: chat, skip_professional_notifications: true, fallback_enroll_token: "token-1") }

  def perform(token: "token-1")
    described_class.perform_now(booking.id.to_s, booking.organization_id, "seq-1", token)
  end

  it "marca a falta e inscreve na sequência, uma vez só" do
    expect { perform }.to have_enqueued_job(Agenda::AttendanceSequenceJob).once

    expect(booking.reload).to have_attributes(attendance_status: "no_show", enrolled_sequence_id: "seq-1", fallback_enroll_token: nil)
  end

  it "a etiqueta acompanha a falta marcada pelo sistema" do
    perform

    expect(chat.reload.chat_tags.map(&:name)).to eq([ "nao-compareceu" ])
  end

  it "não faz nada se alguém já marcou" do
    booking.set(attendance_status: "show")

    perform

    expect(booking.reload).to have_attributes(attendance_status: "show", enrolled_sequence_id: nil)
  end

  it "não faz nada se já está inscrito" do
    booking.set(enrolled_sequence_id: "outra")

    perform

    expect(booking.reload.attendance_status).to be_nil
  end

  it "não marca falta em agendamento cancelado, que a origem marcava" do
    booking.update!(status: "canceled")

    perform

    expect(booking.reload.attendance_status).to be_nil
  end

  it "token vencido: não faz nada" do
    perform(token: "token-velho")

    expect(booking.reload.attendance_status).to be_nil
  end
end
