require "rails_helper"

RSpec.describe Agenda::AttendanceSequenceJob do
  let(:organization) { create(:organization, name: "Clínica Vida") }
  let(:connector) { create(:connector_web_widget, organization: organization) }
  let(:sequence) do
    {
      "id" => "seq-1", "name" => "Recuperar", "trigger" => "no_show", "enabled" => true, "stop_on_reply" => true,
      "steps" => [ { "id" => "s1", "name" => "Primeiro contato", "message" => "Sentimos sua falta, {{nome}}", "run_after" => 1, "run_after_unit" => "hours" } ]
    }
  end
  let(:calendar) { create(:agenda_calendar, organization: organization, attendance_sequences: [ sequence ]) }
  let(:chat) { create(:chat, organization_id: organization.id, connector: connector, user_name: "Maria") }
  let(:booking) do
    create(:agenda_booking, calendar: calendar, chat: chat, skip_professional_notifications: true,
           sequence_token: "token-1", enrolled_sequence_id: "seq-1", sequence_enrolled_at: 2.hours.ago)
  end

  before { allow_any_instance_of(Connector::WebWidget).to receive(:send_text_message).and_return("EXT-1") }

  def perform(token: "token-1", step: "s1", sequence_id: "seq-1")
    described_class.perform_now(booking.id.to_s, organization.id.to_s, sequence_id, step, token)
  end

  def messages(role)
    ChatMessage::Base.unscoped.where(chat_id: chat.id, role: role).order_by(created_at: :asc).to_a
  end

  it "anota no histórico e envia, com o remetente da sequência" do
    perform

    note = messages("base").first
    expect(note).to have_attributes(role_base_type: "sequence-notation", content: "Primeiro contato")
    expect(note.context_message).to include("sequence_name" => "Recuperar", "step_index" => 1, "trigger" => "no_show")

    sent = messages("assistant").first
    expect(sent.content).to eq("Sentimos sua falta, Maria")
    expect(sent.sender_name).to eq("Clínica Vida [Sequência]")
  end

  describe "cancelamento por token" do
    it "reinscreveu ou cancelou a inscrição: não faz nada, nem anota" do
      perform(token: "token-velho")

      expect(messages("base")).to be_empty
      expect(messages("assistant")).to be_empty
    end
  end

  it "agendamento cancelado não recebe passo, que a origem ainda enviava" do
    booking.update!(status: "canceled")

    perform

    expect(messages("assistant")).to be_empty
  end

  it "sequência ou passo removidos: não faz nada" do
    perform(sequence_id: "outra")
    perform(step: "outro")

    expect(messages("assistant")).to be_empty
  end

  describe "parar quando o contato responde" do
    before { create(:chat_text_message, chat: chat, role: "user", content: "Oi, vi agora", created_at: 1.hour.ago) }

    it "anota a saída, não envia, e mata os próximos passos" do
      perform

      expect(messages("base").map(&:role_base_type)).to eq(%w[sequence-notation sequence-exit-notation])
      expect(messages("assistant")).to be_empty
      expect(booking.reload.sequence_token).to be_nil
    end

    it "com a opção desligada, envia assim mesmo" do
      sequence["stop_on_reply"] = false

      perform

      expect(messages("assistant").size).to eq(1)
    end

    it "resposta de antes da inscrição não conta" do
      booking.update!(sequence_enrolled_at: Time.current)

      perform

      expect(messages("assistant").size).to eq(1)
    end
  end

  describe "automação" do
    it "desligada na conversa: anota a saída e não envia" do
      chat.update!(automation_enabled: false)

      perform

      expect(messages("base").last.role_base_type).to eq("sequence-exit-notation")
      expect(messages("assistant")).to be_empty
    end

    it "desligada na organização: não envia" do
      organization.update_automation_settings!("automation_enabled" => false)

      perform

      expect(messages("assistant")).to be_empty
    end

    it "`ignore_automation_paused` envia sem religar" do
      sequence["ignore_automation_paused"] = true
      chat.update!(automation_enabled: false)

      perform

      expect(messages("assistant").size).to eq(1)
      expect(chat.reload.automation_enabled).to be(false)
    end

    it "`reactivate_automation` religa a conversa" do
      sequence["reactivate_automation"] = true
      chat.update!(automation_enabled: false)

      perform

      expect(messages("assistant").size).to eq(1)
      expect(chat.reload.automation_enabled).to be(true)
    end
  end

  describe "com instrução para a IA" do
    let(:ai) { instance_double(Ai::Chat) }

    before do
      sequence["steps"] = [ { "id" => "s1", "name" => "IA", "ai_prompt" => "Convide para remarcar", "run_after" => 1, "run_after_unit" => "hours" } ]
      allow(Ai::Chat).to receive(:new).and_return(ai)
    end

    it "gera com as ferramentas, cobra e envia" do
      allow(ai).to receive(:complete_with_tools).and_return("Vamos remarcar?")

      expect { perform }.to change { organization.reload.credits_used }.by(1)

      expect(messages("assistant").map(&:content)).to eq([ "Vamos remarcar?" ])
      expect(ai).to have_received(:complete_with_tools).with(hash_including(tools: be_present))
    end

    it "se a geração falhar e não houver texto de reserva, não envia nada" do
      allow(ai).to receive(:complete_with_tools).and_raise(Ai::Chat::Failed, "fora do ar")

      expect { perform }.not_to(change { organization.reload.credits_used })

      expect(messages("assistant")).to be_empty
    end
  end
end
