require "rails_helper"

RSpec.describe EnableContactJob do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization, automation_enabled: false, active_job_id: "token-vigente", automation_resume_at: 1.hour.from_now) }

  def note_contents
    ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").map(&:content)
  end

  it "religa a automação ao fim de uma pausa humana" do
    described_class.perform_now(chat.id.to_s, organization.id, "token-vigente")

    expect(chat.reload).to have_attributes(automation_enabled: true, active_job_id: nil, automation_resume_at: nil)
  end

  it "registra a volta no histórico, com a nota genérica" do
    described_class.perform_now(chat.id.to_s, organization.id, "token-vigente")

    expect(note_contents).to eq([ "A automação foi retomada." ])
  end

  it "avisa a lista de conversas" do
    chat

    expect { described_class.perform_now(chat.id.to_s, organization.id, "token-vigente") }
      .to have_broadcasted_to(ApplicationCable::Channel.organization_stream(organization.id, "chat-list"))
      .with(a_hash_including("event" => a_hash_including("automationEnabled" => true, "automationResumeAt" => nil)))
  end

  describe "cancelamento por token" do
    it "um agendamento antigo não religa quando a pessoa pausou de novo" do
      described_class.perform_now(chat.id.to_s, organization.id, "token-antigo")

      expect(chat.reload).to have_attributes(automation_enabled: false, active_job_id: "token-vigente")
      expect(chat.automation_resume_at).to be_present
    end

    it "um agendamento antigo não religa depois de uma pausa sem volta" do
      chat.set(active_job_id: nil, automation_resume_at: nil)

      described_class.perform_now(chat.id.to_s, organization.id, "token-antigo")

      expect(chat.reload.automation_enabled).to be(false)
    end

    it "sem token, religa de qualquer jeito" do
      described_class.perform_now(chat.id.to_s, organization.id)

      expect(chat.reload.automation_enabled).to be(true)
    end
  end

  describe "escopo" do
    it "não alcança conversa de outra organização" do
      described_class.perform_now(chat.id.to_s, create(:organization).id, "token-vigente")

      expect(chat.reload.automation_enabled).to be(false)
    end

    it "não quebra com a conversa apagada" do
      expect { described_class.perform_now(BSON::ObjectId.new.to_s, organization.id, "token") }.not_to raise_error
    end
  end

  it "fica na fila default" do
    expect(described_class.new.queue_name).to eq("default")
  end
end
