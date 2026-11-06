require "rails_helper"

RSpec.describe Agenda::Booking do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization, name: "Clínica Vida") }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:chat) { create(:chat, organization_id: organization.id, user_name: "Maria Souza") }
  let(:account) { create(:account, organization: organization, name: "Dra. Ana") }
  let(:professional) { create(:agenda_professional, calendar: calendar, account_id: account.id, phone: "5531983794137") }
  let(:starts) { 3.days.from_now.change(usec: 0) }

  def booking(**attributes)
    create(:agenda_booking, { calendar: calendar, start: starts, end: starts + 1.hour }.merge(attributes))
  end

  describe "validações" do
    it "herda a organização do calendário" do
      expect(booking.organization_id).to eq(organization.id.to_s)
    end

    it "exige início e fim" do
      record = build(:agenda_booking, calendar: calendar, start: nil, end: nil)

      expect(record).not_to be_valid
      expect(record.errors.attribute_names).to include(:start, :end)
    end

    it "recusa fim antes do início" do
      record = build(:agenda_booking, calendar: calendar, start: starts, end: starts - 1.minute)

      expect(record).not_to be_valid
      expect(record.errors[:end]).to be_present
    end

    it "aceita fim igual ao início, que é o que o Google manda num evento sem duração" do
      expect(build(:agenda_booking, calendar: calendar, start: starts, end: starts)).to be_valid
    end

    it "aceita só os comparecimentos conhecidos" do
      expect(build(:agenda_booking, calendar: calendar, attendance_status: "talvez")).not_to be_valid
    end

    it "recusa profissional de outro calendário" do
      other = create(:agenda_professional, calendar: create(:agenda_calendar, organization: organization))
      record = build(:agenda_booking, calendar: calendar, professional_id: other.id)

      expect(record).not_to be_valid
      expect(record.errors[:professional_id]).to be_present
    end

    it "recusa conversa de outra organização" do
      other = create(:chat, organization_id: create(:organization).id)
      record = build(:agenda_booking, calendar: calendar, chat_id: other.id)

      expect(record).not_to be_valid
      expect(record.errors[:chat_id]).to be_present
    end
  end

  describe "título e cor" do
    it "monta o título do serviço e das pessoas quando não há título" do
      service = create(:agenda_offering, calendar: calendar, name: "Limpeza", professionals: [ professional ])
      record = booking(title: nil, service: service, chat: chat, professional: professional)

      expect(record.title).to eq("Limpeza - Maria Souza & Dra. Ana")
    end

    it "não deixa separador sobrando quando falta alguém" do
      expect(booking(title: nil, chat: chat).title).to eq("Maria Souza")
    end

    it "usa a cor do profissional, e a padrão sem ele" do
      professional.update!(color: "#123456")

      expect(booking(professional: professional).color).to eq("#123456")
      expect(booking.color).to eq(described_class::DEFAULT_COLOR)
    end
  end

  describe "histórico" do
    it "registra a criação" do
      expect(booking(event_user_name: "Marina").event_history.first).to include("event_name" => "create", "user_name" => "Marina", "by_user" => true)
    end

    it "registra remarcação com o antes e o depois" do
      record = booking
      new_start = starts + 2.hours

      record.update!(start: new_start, end: new_start + 1.hour)

      entry = record.reload.event_history.last
      expect(entry["event_name"]).to eq("time_update")
      expect(entry["start"].last.to_i).to eq(new_start.to_i)
    end

    it "registra mudança de título" do
      record = booking
      record.update!(title: "Retorno")

      expect(record.reload.event_history.last).to include("event_name" => "title_update", "title" => [ "Consulta", "Retorno" ])
    end

    it "registra comparecimento, e limpar não vira falta como na origem" do
      record = booking
      record.update!(attendance_status: "show")
      record.update!(attendance_status: nil)

      expect(record.reload.event_history.map { |entry| entry["event_name"] }).to eq(%w[create show attendance_cleared])
    end

    it "não passa do teto" do
      record = booking
      record.update!(event_history: Array.new(described_class::MAX_EVENT_HISTORY) { { "event_name" => "x" } })
      record.update!(title: "Retorno")

      expect(record.reload.event_history.size).to eq(described_class::MAX_EVENT_HISTORY)
      expect(record.event_history.last["event_name"]).to eq("title_update")
    end
  end

  describe "cancelamento" do
    it "pinta de vermelho e registra" do
      record = booking
      record.update!(status: "canceled")

      expect(record.reload.color).to eq(described_class::CANCELED_COLOR)
      expect(record.event_history.last["event_name"]).to eq("canceled")
    end
  end

  describe "tempo real" do
    it "transmite ao calendário ao criar" do
      expect { booking }.to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda"))
        .with(hash_including(action: "create", type: "booking"))
    end

    it "transmite remoção ao arquivar" do
      record = booking

      expect { record.update!(status: "archived") }
        .to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda"))
        .with(hash_including(action: "destroy"))
    end

    it "avisa a conversa, sem mandar os dados" do
      expect { booking(chat: chat) }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
        .with(event: "bookings_changed", chatId: chat.id.to_s)
    end
  end

  describe "lembretes ao contato" do
    let(:rules) do
      [
        { "interval" => 1, "period" => "hours", "message" => "Falta uma hora" },
        { "interval" => 10, "period" => "days", "message" => "Já passou da hora de avisar" }
      ]
    end

    before { calendar.update!(scheduling_notification_enabled: true, scheduling_notification_config: rules) }

    it "agenda só as regras que ainda dão tempo, com linha na conversa" do
      record = nil

      expect { record = booking(chat: chat) }
        .to have_enqueued_job(Agenda::ContactNotificationJob).once.at(a_value_within(1.second).of(starts - 1.hour))

      action = ScheduledAction.where(booking_id: record.id.to_s).take
      expect(action).to have_attributes(status: :pending, kind: "booking_reminder", name: "Lembrete: 1 hora antes")
      expect(action.scheduled_at.to_i).to eq((starts - 1.hour).to_i)
      expect(action.chat_id).to eq(chat.id)
    end

    it "sem conversa, não agenda" do
      expect { booking }.not_to have_enqueued_job(Agenda::ContactNotificationJob)
    end

    it "com o calendário em pausa, não agenda" do
      calendar.update!(scheduling_notification_enabled: false)

      expect { booking(chat: chat) }.not_to have_enqueued_job(Agenda::ContactNotificationJob)
    end

    it "remarcar substitui o lembrete, e a linha antiga fica como reagendada" do
      record = booking(chat: chat)
      old = ScheduledAction.where(booking_id: record.id.to_s).take
      new_start = starts + 1.day

      expect { record.update!(start: new_start, end: new_start + 1.hour) }
        .to have_enqueued_job(Agenda::ContactNotificationJob).once.at(a_value_within(1.second).of(new_start - 1.hour))

      expect(old.reload).to be_superseded
      expect(ScheduledAction.pending.where(booking_id: record.id.to_s).count).to eq(1)
    end

    it "cancelar acaba com o lembrete" do
      record = booking(chat: chat)
      record.update!(status: "canceled")

      expect(ScheduledAction.pending.where(booking_id: record.id.to_s)).to be_empty
    end

    it "arquivar também: a origem enviava lembrete de evento apagado" do
      record = booking(chat: chat)
      record.update!(status: "archived")

      expect(ScheduledAction.pending.where(booking_id: record.id.to_s)).to be_empty
    end

    it "remarcar agendamento cancelado não agenda de novo" do
      record = booking(chat: chat)
      record.update!(status: "canceled")

      expect { record.update!(start: starts + 1.day, end: starts + 1.day + 1.hour) }
        .not_to have_enqueued_job(Agenda::ContactNotificationJob)
    end

    it "apagar acaba com o lembrete" do
      record = booking(chat: chat)
      id = record.id.to_s
      record.destroy

      expect(ScheduledAction.pending.where(booking_id: id)).to be_empty
    end

    it "ligar a conversa depois de criar agenda o lembrete" do
      record = booking

      expect { record.update!(chat_id: chat.id) }.to have_enqueued_job(Agenda::ContactNotificationJob).once
      expect(record.reload.contact_external_id).to eq(chat.external_id)
    end
  end

  describe "avisos ao profissional" do
    it "avisa na criação, no idioma da pessoa" do
      account.update!(locale: "en")

      booking(chat: chat, professional: professional)

      notice = AccountNotice.where(account_id: account.id).take
      expect(notice.title).to eq("New booking")
      expect(notice.description).to include("Maria Souza")
    end

    it "não avisa com o aviso de criação desligado no calendário" do
      calendar.update!(professional_event_notifications: [ { "event" => "created", "push" => false } ])

      booking(chat: chat, professional: professional)

      expect(AccountNotice.where(account_id: account.id)).to be_empty
    end

    it "o evento espelhado do Google não avisa ninguém" do
      expect { booking(professional: professional, skip_professional_notifications: true) }
        .not_to have_enqueued_job(Agenda::ProfessionalWhatsappJob)

      expect(AccountNotice.where(account_id: account.id)).to be_empty
    end

    it "agendamento sem profissional não quebra, como evento do Google sem convidado" do
      expect { booking }.not_to raise_error
    end

    it "enfileira o WhatsApp na criação, no cancelamento e na remarcação" do
      record = nil

      expect { record = booking(professional: professional) }
        .to have_enqueued_job(Agenda::ProfessionalWhatsappJob).with(anything, organization.id.to_s, "created")
      expect { record.update!(start: starts + 1.day, end: starts + 1.day + 1.hour) }
        .to have_enqueued_job(Agenda::ProfessionalWhatsappJob).with(anything, organization.id.to_s, "rescheduled")
      expect { record.update!(status: "canceled") }
        .to have_enqueued_job(Agenda::ProfessionalWhatsappJob).with(anything, organization.id.to_s, "canceled")
    end

    it "não enfileira com o WhatsApp desligado no evento" do
      calendar.update!(professional_event_notifications: [ { "event" => "created", "whatsapp" => false } ])

      expect { booking(professional: professional) }.not_to have_enqueued_job(Agenda::ProfessionalWhatsappJob)
    end

    it "agenda os lembretes do calendário com um token, e remarcar troca o token" do
      calendar.update!(professional_notifications_settings: [ { "time_before" => 2, "period" => "hours", "message" => "Em breve" } ])
      record = nil

      expect { record = booking(professional: professional, chat: chat) }
        .to have_enqueued_job(Agenda::NotificationProfessionalJob).at(a_value_within(1.second).of(starts - 2.hours))

      first_token = record.reload.professional_reminder_token
      expect(first_token).to be_present

      record.update!(start: starts + 1.day, end: starts + 1.day + 1.hour)
      expect(record.reload.professional_reminder_token).to be_present.and(satisfy { |token| token != first_token })
    end
  end

  describe "comparecimento" do
    def sequences(*anchors, trigger: "show")
      [ {
        "id" => "seq-1", "name" => "Pós", "trigger" => trigger, "enabled" => true, "auto_enroll" => true,
        "auto_enroll_anchors" => anchors, "auto_enroll_minutes_after_end" => 30,
        "steps" => [ { "id" => "s1", "name" => "Oi", "message" => "Obrigado", "run_after" => 1, "run_after_unit" => "hours", "all_day" => true } ]
      } ]
    end

    it "espelha em etiqueta na conversa, e corrigir troca a etiqueta" do
      record = booking(chat: chat)

      record.update!(attendance_status: "show")
      expect(chat.reload.chat_tags.map(&:name)).to eq([ "compareceu" ])

      record.update!(attendance_status: "no_show")
      expect(chat.reload.chat_tags.map(&:name)).to eq([ "nao-compareceu" ])

      record.update!(attendance_status: nil)
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "etiqueta mesmo quando há inscrição automática, que grava o documento de novo" do
      calendar.update!(attendance_sequences: sequences("attendance_mark"))
      record = booking(chat: chat)

      record.update!(attendance_status: "show")

      expect(chat.reload.chat_tags.map(&:name)).to eq([ "compareceu" ])
      expect(record.reload.enrolled_sequence_id).to eq("seq-1")
    end

    it "não mexe nas etiquetas em atualização que não muda o comparecimento" do
      record = booking(chat: chat)

      expect { record.update!(title: "Outro") }.not_to(change { chat.reload.chat_tag_ids })
    end

    it "inscreve na sequência automática ao marcar" do
      calendar.update!(attendance_sequences: sequences("attendance_mark"))
      record = booking(chat: chat)

      expect { record.update!(attendance_status: "show") }.to have_enqueued_job(Agenda::AttendanceSequenceJob).once
    end

    it "não inscreve se a âncora é só por tempo" do
      calendar.update!(attendance_sequences: sequences("after_event_end", trigger: "no_show"))
      record = booking(chat: chat)

      expect { record.update!(attendance_status: "no_show") }.not_to have_enqueued_job(Agenda::AttendanceSequenceJob)
    end

    it "sem âncora, vale ao marcar" do
      calendar.update!(attendance_sequences: sequences)
      record = booking(chat: chat)

      expect { record.update!(attendance_status: "show") }.to have_enqueued_job(Agenda::AttendanceSequenceJob).once
    end

    it "agenda a inscrição por tempo para depois do fim" do
      calendar.update!(attendance_sequences: sequences("attendance_mark", "after_event_end", trigger: "no_show"))
      record = nil

      expect { record = booking(chat: chat) }
        .to have_enqueued_job(Agenda::AttendanceFallbackEnrollJob).at(a_value_within(1.second).of(starts + 1.hour + 30.minutes))

      expect(record.reload.fallback_enroll_token).to be_present
    end

    it "não agenda a inscrição por tempo sem a âncora" do
      calendar.update!(attendance_sequences: sequences("attendance_mark", trigger: "no_show"))

      expect { booking(chat: chat) }.not_to have_enqueued_job(Agenda::AttendanceFallbackEnrollJob)
    end

    it "marcar comparecimento mata a inscrição por tempo" do
      calendar.update!(attendance_sequences: sequences("after_event_end", trigger: "no_show"))
      record = booking(chat: chat)

      record.update!(attendance_status: "show")

      expect(record.reload.fallback_enroll_token).to be_nil
    end
  end

  describe "Google Agenda" do
    let(:connector) { create(:connector_google_calendar, organization: organization) }

    before { calendar.update!(google_calendar_connector_id: connector.id.to_s) }

    it "espelha em job ao criar, sem depender do Google na requisição" do
      expect { booking }.to have_enqueued_job(Agenda::GooglePushJob)
    end

    it "espelha só quando muda o que o Google mostra" do
      record = booking

      expect { record.update!(color: "#000000") }.not_to have_enqueued_job(Agenda::GooglePushJob)
      expect { record.update!(title: "Retorno") }.to have_enqueued_job(Agenda::GooglePushJob)
    end

    it "o que veio do Google não volta para o Google" do
      record = booking
      record.skip_google_push = true

      expect { record.update!(title: "Do Google") }.not_to have_enqueued_job(Agenda::GooglePushJob)
    end

    it "cancelar tira o evento do Google, e esquece o id" do
      record = booking(google_event_id: "ev-1")

      expect { record.update!(status: "canceled") }
        .to have_enqueued_job(Agenda::GoogleDeleteJob).with(connector.id.to_s, organization.id.to_s, "ev-1")

      expect(record.reload.google_event_id).to be_nil
    end

    it "apagar tira o evento do Google" do
      record = booking(google_event_id: "ev-1")

      expect { record.destroy }.to have_enqueued_job(Agenda::GoogleDeleteJob).with(connector.id.to_s, organization.id.to_s, "ev-1")
    end

    it "sem conector, nada vai para o Google" do
      calendar.update!(google_calendar_connector_id: nil)

      expect { booking }.not_to have_enqueued_job(Agenda::GooglePushJob)
    end
  end

  describe "fuso" do
    it "lê o início no fuso do calendário, com o servidor em UTC" do
      calendar.update!(time_zone: "America/Sao_Paulo")
      record = booking(start: Time.utc(2030, 1, 15, 1, 0), end: Time.utc(2030, 1, 15, 2, 0))

      expect(record.local_start.strftime("%Y-%m-%d %H:%M")).to eq("2030-01-14 22:00")
      expect(record.local_start.wday).to eq(1)
    end
  end
end
