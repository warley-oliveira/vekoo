require "rails_helper"

RSpec.describe Agenda::ContactNotificationJob do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization, name: "Clínica Vida") }
  let(:connector) { create(:connector_web_widget, organization: organization) }
  let(:calendar) do
    create(:agenda_calendar, organization: organization, scheduling_notification_enabled: true,
           scheduling_notification_config: [ { "interval" => 1, "period" => "hours", "message" => "Oi {{nome}}, é às {{hora}}" } ])
  end
  let(:chat) { create(:chat, organization_id: organization.id, connector: connector, user_name: "Maria") }
  let(:start_at) { calendar.zone.local(2030, 1, 14, 15, 0) }
  let(:booking) { create(:agenda_booking, calendar: calendar, chat: chat, start: start_at, end: start_at + 1.hour) }
  let(:action) { ScheduledAction.where(booking_id: booking.id.to_s).take }

  before do
    travel_to(start_at - 3.hours)
    allow_any_instance_of(Connector::WebWidget).to receive(:send_text_message).and_return("EXT-1")
    booking
    travel_to(start_at - 1.hour)
    Rails.cache.clear
  end

  after { travel_back }

  def perform(index = 0, token: action.token)
    described_class.perform_now(booking.id.to_s, organization.id.to_s, index, token)
  end

  def sent
    ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant").map(&:content)
  end

  it "envia o texto pelo canal da conversa, com o remetente da agenda, e marca a linha como executada" do
    perform

    message = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant").take
    expect(message.content).to eq("Oi Maria, é às 15:00")
    expect(message.sender_name).to eq("Clínica Vida [Lembrete da agenda]")
    expect(action.reload).to be_executed
    expect(action.executed_at).to be_present
  end

  it "avisa a conversa que a linha saiu da lista" do
    perform_expectation = expect { perform }

    perform_expectation.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(hash_including(event: "scheduled_actions_changed"))
  end

  it "job repetido pelo Sidekiq não envia duas vezes" do
    token = action.token

    perform(token: token)
    Rails.cache.clear
    perform(token: token)

    expect(sent.size).to eq(1)
  end

  describe "cancelamento por token" do
    it "linha cancelada pela pessoa: o job chega e não faz nada" do
      action.update!(status: :canceled)

      perform

      expect(sent).to be_empty
    end

    it "linha reagendada: o job antigo chega e não faz nada" do
      token = action.token
      new_start = start_at + 1.day
      booking.update!(start: new_start, end: new_start + 1.hour)

      perform(token: token)

      expect(sent).to be_empty
    end

    it "token que não existe" do
      perform(token: "outro")

      expect(sent).to be_empty
    end

    it "token de outra organização não vale" do
      token = action.token

      described_class.perform_now(booking.id.to_s, create(:organization).id.to_s, 0, token)

      expect(sent).to be_empty
      expect(action.reload).to be_pending
    end
  end

  describe "guardas" do
    shared_examples "não envia" do
      it "e marca a linha, que não vai mais sair" do
        expect { perform }.not_to raise_error
        expect(sent).to be_empty
        expect(action.reload).to be_executed
      end
    end

    context "com os lembretes desligados depois de agendar" do
      before { calendar.update!(scheduling_notification_enabled: false) }

      include_examples "não envia"
    end

    context "com a regra removida" do
      before { action; calendar.update!(scheduling_notification_config: []) }

      include_examples "não envia"
    end

    context "com a conversa sem canal" do
      before { chat.update!(connector: nil) }

      include_examples "não envia"
    end

    context "com a automação desligada na conversa" do
      before { chat.update!(automation_enabled: false) }

      include_examples "não envia"
    end

    context "com a automação desligada na organização" do
      before { organization.update_automation_settings!("automation_enabled" => false) }

      include_examples "não envia"
    end

    it "agendamento cancelado cancela a linha antes de o job chegar" do
      token = action.token
      booking.update!(status: "canceled")

      perform(token: token)

      expect(sent).to be_empty
    end

    it "agendamento apagado não quebra" do
      token = action.token
      id = booking.id.to_s
      booking.destroy

      expect { described_class.perform_now(id, organization.id.to_s, 0, token) }.not_to raise_error
      expect(sent).to be_empty
    end
  end

  describe "escapes da automação" do
    it "`ignore_automation_paused` envia sem religar nada" do
      chat.update!(automation_enabled: false)
      calendar.update!(scheduling_notification_ignore_automation_paused: true)

      perform

      expect(sent.size).to eq(1)
      expect(chat.reload.automation_enabled).to be(false)
    end

    it "`ignore_automation_paused` vale também com a organização desligada" do
      organization.update_automation_settings!("automation_enabled" => false)
      calendar.update!(scheduling_notification_ignore_automation_paused: true)

      perform

      expect(sent.size).to eq(1)
    end

    it "`reactivate_automation` religa a conversa antes de enviar" do
      chat.update!(automation_enabled: false)
      calendar.update!(scheduling_notification_reactivate_automation: true)

      perform

      expect(sent.size).to eq(1)
      expect(chat.reload.automation_enabled).to be(true)
    end

    it "`reactivate_automation` não passa por cima da organização desligada" do
      organization.update_automation_settings!("automation_enabled" => false)
      calendar.update!(scheduling_notification_reactivate_automation: true)

      perform

      expect(sent).to be_empty
    end
  end

  it "dois lembretes na mesma conversa, no mesmo minuto, viram um" do
    other = create(:agenda_booking, calendar: calendar, chat: chat, start: start_at, end: start_at + 1.hour)
    other_action = create(:scheduled_action, chat: chat, booking_id: other.id.to_s)

    perform
    described_class.perform_now(other.id.to_s, organization.id.to_s, 0, other_action.token)

    expect(sent.size).to eq(1)
  end

  describe "evento adiado depois de enfileirar" do
    it "agenda de novo, com o mesmo token, em vez de sair cedo" do
      later = start_at + 5.hours
      booking.set(start: later, end: later + 1.hour)

      expect { perform }.to have_enqueued_job(described_class).at(a_value_within(1.second).of(later - 1.hour))

      expect(sent).to be_empty
      expect(action.reload).to be_pending
      expect(action.scheduled_at.to_i).to eq((later - 1.hour).to_i)
    end
  end

  describe "com instrução para a IA" do
    let(:ai) { instance_double(Ai::Chat, complete: "Oi, Maria! Te espero daqui a uma hora.") }

    before do
      action
      allow(Ai::Chat).to receive(:new).and_return(ai)
      calendar.update!(scheduling_notification_config: [ { "interval" => 1, "period" => "hours", "message" => "Texto de reserva", "ai_prompt" => "Lembre com carinho" } ])
    end

    it "envia o texto gerado e cobra um crédito" do
      expect { perform }.to change { organization.reload.credits_used }.by(1)

      expect(sent).to eq([ "Oi, Maria! Te espero daqui a uma hora." ])
    end

    it "com a IA fora do ar, envia o texto de reserva e anota o motivo" do
      allow(ai).to receive(:complete).and_raise(Ai::Chat::Failed, "fora do ar")

      expect { perform }.not_to(change { organization.reload.credits_used })

      expect(sent).to eq([ "Texto de reserva" ])
      expect(action.reload.metadata).to include("fallback_reason" => "failed")
    end
  end

  it "resposta em partes guarda a inteira e envia cada parte" do
    calendar.update!(scheduling_notification_config: [ { "interval" => 1, "period" => "hours", "message" => "Primeira\n\nSegunda", "ai_prompt" => "x" } ])
    allow(Ai::Chat).to receive(:new).and_return(instance_double(Ai::Chat, complete: "Primeira\n\nSegunda"))

    perform

    messages = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant").order_by(created_at: :asc).to_a
    expect(messages.map(&:content)).to eq([ "Primeira\n\nSegunda", "Primeira", "Segunda" ])
    expect(messages.first.has_span).to be(true)
    expect(messages.last.is_span).to be(true)
  end
end
