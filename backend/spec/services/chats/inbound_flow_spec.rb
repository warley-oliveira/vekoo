require "rails_helper"

RSpec.describe Chats::InboundFlow do
  include ActiveSupport::Testing::TimeHelpers
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
  let(:chat) { create(:chat, connector: connector, organization_id: organization.id) }
  let(:message) { create(:chat_text_message, chat: chat, content: "Quero saber o preço", message_id: "wamid.1") }

  def run(**options)
    described_class.call(chat: chat, message: message, text: "Quero saber o preço", **options)
  end

  before { allow(Flows::InboundDispatcher).to receive(:call) }

  describe "mensagem do contato" do
    it "conta como não lida e chama o dispatcher" do
      run(first_message: true)

      expect(chat.reload.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).with(
        chat: chat, text: "Quero saber o preço", event: "first_message", message_id: "wamid.1", sent_at: a_kind_of(Time)
      )
    end

    it "conta como resposta da campanha que alcançou a conversa" do
      campaign = create(:outreach_campaign, :running, organization: organization)
      recipient = create(:outreach_recipient, campaign: campaign, status_cd: "delivered")
      chat.set(outreach_recipient_id: recipient.id.to_s)

      run

      expect(recipient.reload.replied_at).to be_present
      expect(campaign.reload.replied_count).to eq(1)
      expect(chat.reload.unread_messages).to eq(1)
    end

    it "mensagem nossa, feita fora da plataforma, não é resposta" do
      campaign = create(:outreach_campaign, :running, organization: organization)
      recipient = create(:outreach_recipient, campaign: campaign, status_cd: "delivered")
      chat.set(outreach_recipient_id: recipient.id.to_s)

      run(from_me: true)

      expect(recipient.reload.replied_at).to be_nil
      expect(chat.reload.outreach_recipient_id).to eq(recipient.id.to_s)
    end

    it "avisa message_received nas mensagens seguintes" do
      run(first_message: false)

      expect(Flows::InboundDispatcher).to have_received(:call).with(hash_including(event: "message_received"))
    end

    it "atualiza a prévia da lista mesmo com data do provedor anterior a last_message_at" do
      chat.set(last_message_at: 1.minute.from_now)
      old_message = create(:chat_text_message, chat: chat, content: "antiga", created_at: 5.minutes.ago)

      described_class.call(chat: chat, message: old_message, text: "antiga")

      expect(chat.reload).to have_attributes(last_message_content: "antiga", last_message_by: "user", last_message_type: "text")
    end

    it "não chama o dispatcher com a automação da conversa desligada, mas conta como não lida" do
      chat.set(automation_enabled: false)

      run

      expect(chat.reload.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não chama o dispatcher com a automação da organização desligada" do
      organization.update!(settings: { "automation_enabled" => false })

      run

      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não chama o dispatcher com o conector inativo" do
      connector.set(status_cd: "paused")

      run

      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não chama o dispatcher enquanto o conteúdo não chegou" do
      run(dispatch: false)

      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não deixa erro de automação derrubar o recebimento" do
      allow(Flows::InboundDispatcher).to receive(:call).and_raise("fluxo quebrado")

      expect { run }.not_to raise_error
    end
  end

  describe "intervenção humana" do
    before { organization.update!(settings: { "automation_pause_period" => "hours", "automation_pause_time_to" => 2 }) }

    it "pausa a automação, agenda a volta e não conta como não lida" do
      chat.set(unread_messages: 3)

      expect { run(from_me: true) }.to have_enqueued_job(EnableContactJob)

      chat.reload
      expect(chat.automation_enabled).to be(false)
      expect(chat.unread_messages).to eq(0)
      expect(chat.automation_resume_at).to be_within(5.seconds).of(2.hours.from_now)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  describe "janela de atendimento" do
    before do
      organization.update!(
        timezone: "America/Sao_Paulo",
        settings: {
          "business_work_enabled" => true,
          "business_work" => { "days" => [ { "day_of_week" => "1", "enabled" => "true", "windows" => [ { "start" => "09:00", "end" => "18:00" } ] } ] }
        }
      )
    end

    # 2026-11-08 é domingo; a janela só abre na segunda.
    around { |example| travel_to(Time.zone.parse("2026-11-08 12:00:00 -03:00")) { example.run } }

    it "fora da janela adia para a próxima abertura, uma vez só" do
      expect { run }.to have_enqueued_job(Chats::DispatchInboundJob).once
      expect(Flows::InboundDispatcher).not_to have_received(:call)
      expect(chat.reload.scheduled_outside_business_work).to be_present

      second = create(:chat_text_message, chat: chat, content: "oi de novo")
      expect { described_class.call(chat: chat, message: second, text: "oi de novo") }.not_to have_enqueued_job(Chats::DispatchInboundJob)
    end
  end

  describe Chats::DispatchInboundJob do
    it "entrega para os fluxos e limpa o agendamento" do
      chat.set(scheduled_outside_business_work: Time.current)

      described_class.perform_now(chat.id.to_s, chat.organization_id, "oi", "message_received", "wamid.9")

      expect(chat.reload.scheduled_outside_business_work).to be_nil
      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat, text: "oi", event: "message_received", message_id: "wamid.9", sent_at: nil)
    end

    it "não entrega se uma pessoa assumiu nesse meio-tempo" do
      chat.set(automation_enabled: false)

      described_class.perform_now(chat.id.to_s, chat.organization_id, "oi", "message_received", "wamid.9")

      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "não alcança conversa de outra organização" do
      described_class.perform_now(chat.id.to_s, create(:organization).id, "oi", "message_received", "wamid.9")

      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end
end
