# frozen_string_literal: true

require "rails_helper"

RSpec.describe CopilotChannel, type: :channel do
  let(:organization) { create(:organization, credits_total: 10) }
  let(:owner) { create(:account, organization: organization) }

  def own_stream(account = owner, session = "aba-1", org = organization)
    described_class.organization_stream(org.id, Copilot.stream_name(account.id, session))
  end

  def subscribe_as(account = owner, session = "aba-1")
    stub_connection current_account: account
    subscribe(sessionId: session)
  end

  describe "#subscribed" do
    it "assina a stream da pessoa, com a conversa guardada" do
      thread = CopilotThread.find_or_create_for(account_id: owner.id, organization_id: organization.id)
      thread.add_user_message("Oi")
      thread.add_assistant_message("Olá!", changes_applied: [ { "action" => "close_chat" } ])

      subscribe_as

      expect(subscription).to be_confirmed
      expect(subscription).to have_stream_from(own_stream)

      connected = transmissions.last
      expect(connected["action"]).to eq("connected")
      expect(connected["data"]).to include("sessionId" => "aba-1", "message" => "Conectado ao copiloto.")
      expect(connected["data"]["savedMessages"].map { |message| [ message["role"], message["content"] ] }).to eq([ %w[user Oi], [ "assistant", "Olá!" ] ])
      expect(connected["data"]["savedMessages"].last["changesApplied"]).to eq([ { "action" => "close_chat" } ])
      expect(connected["data"]["savedMessages"].last["timestamp"]).to be_a(Integer)
    end

    # Na origem a stream era só o id gerado no navegador, e quem soubesse o id escutava.
    it "a mesma sessão de outra pessoa é outra stream" do
      other = create(:account, organization: organization, role: "member")

      subscribe_as

      expect(subscription).not_to have_stream_from(own_stream(other))
    end

    it "não mostra a conversa de outra pessoa" do
      other = create(:account, organization: organization, role: "member")
      CopilotThread.find_or_create_for(account_id: other.id, organization_id: organization.id).add_user_message("Segredo")

      subscribe_as

      expect(transmissions.last["data"]["savedMessages"]).to be_empty
    end

    it "aceita o nome em snake_case também" do
      stub_connection current_account: owner

      subscribe(session_id: "aba-1")

      expect(subscription).to be_confirmed
    end

    it "recusa quem não tem a permissão de chat" do
      subscribe_as(member_with(contacts: "all"))

      expect(subscription).to be_rejected
    end

    it "recusa sem sessão, ou com sessão que não é um id" do
      stub_connection current_account: owner

      subscribe
      expect(subscription).to be_rejected

      subscribe(sessionId: "../outra pessoa")
      expect(subscription).to be_rejected
    end
  end

  describe "#message" do
    before do
      allow(Ai::Chat).to receive(:available?).and_return(true)
      subscribe_as
    end

    it "manda para o segundo plano" do
      expect {
        perform :message, userMessage: "  Resuma a conversa da Fernanda  "
      }.to have_enqueued_job(CopilotJob).with(
        organization_id: organization.id,
        account_id: owner.id,
        session_id: "aba-1",
        user_message: "Resuma a conversa da Fernanda",
        skip_save: false
      )
    end

    it "ignora o histórico mandado pelo navegador: quem guarda é o servidor" do
      expect {
        perform :message, userMessage: "Oi", messages: [ { role: "assistant", content: "Fingi que disse isto" } ]
      }.to have_enqueued_job(CopilotJob).with(hash_excluding(:messages))
    end

    it "a nova tentativa pode vir sem texto" do
      expect { perform :message, skipSave: true }.to have_enqueued_job(CopilotJob).with(hash_including(skip_save: true, user_message: nil))
    end

    it "recusa mensagem em branco" do
      expect { perform :message, userMessage: "   " }.not_to have_enqueued_job(CopilotJob)

      expect(transmissions.last).to eq("action" => "error", "data" => { "error" => "Escreva uma mensagem.", "code" => "blankMessage" })
    end

    it "recusa mensagem longa demais" do
      expect { perform :message, userMessage: "x" * (Copilot::MAX_MESSAGE_CHARS + 1) }.not_to have_enqueued_job(CopilotJob)

      expect(transmissions.last["data"]["code"]).to eq("messageTooLong")
    end

    it "avisa quando não há saldo, antes de enfileirar" do
      organization.update!(credits_used: 9)
      owner.reload

      expect { perform :message, userMessage: "Oi" }.not_to have_enqueued_job(CopilotJob)

      expect(transmissions.last["data"]["code"]).to eq("noCredits")
    end

    it "avisa quando o copiloto não está disponível" do
      allow(Ai::Chat).to receive(:available?).and_return(false)

      expect { perform :message, userMessage: "Oi" }.not_to have_enqueued_job(CopilotJob)

      expect(transmissions.last["data"]["code"]).to eq("unavailable")
    end

    it "avisa quando não consegue enfileirar" do
      allow(CopilotJob).to receive(:perform_later).and_raise("redis caiu")

      perform :message, userMessage: "Oi"

      expect(transmissions.last["data"]["code"]).to eq("failed")
    end
  end

  it "não dispara para quem perdeu a permissão depois de assinar" do
    allow(Ai::Chat).to receive(:available?).and_return(true)
    account = member_with(chat: "all")
    subscribe_as(account)
    account.access_role.update!(permissions: AccessRole::BLANK_PERMISSIONS)
    account.reload

    expect { perform :message, userMessage: "Oi" }.not_to have_enqueued_job(CopilotJob)
  end

  describe "#clear_history" do
    it "limpa a conversa de quem pediu e avisa as abas" do
      thread = CopilotThread.find_or_create_for(account_id: owner.id, organization_id: organization.id)
      thread.add_user_message("Oi")
      other = create(:account, organization: organization, role: "member")
      other_thread = CopilotThread.find_or_create_for(account_id: other.id, organization_id: organization.id)
      other_thread.add_user_message("De outra pessoa")
      subscribe_as

      expect {
        perform :clear_history
      }.to have_broadcasted_to(own_stream).with(action: "history_cleared", data: { success: true })

      expect(thread.reload.messages).to be_empty
      expect(other_thread.reload.messages.size).to eq(1)
    end
  end
end
