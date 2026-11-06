# frozen_string_literal: true

require "rails_helper"

RSpec.describe CopilotJob, type: :job do
  let(:organization) { create(:organization, credits_total: 10, credits_used: 0) }
  let(:account) { create(:account, organization: organization) }
  let(:stream) { ApplicationCable::Channel.organization_stream(organization.id, Copilot.stream_name(account.id, "aba-1")) }

  def run(user_message: "Oi", skip_save: false, person: account)
    described_class.perform_now(organization_id: organization.id, account_id: person.id, session_id: "aba-1", user_message: user_message, skip_save: skip_save)
  end

  def broadcasts
    ActionCable.server.pubsub.broadcasts(stream).map { |payload| JSON.parse(payload) }
  end

  def event(action)
    broadcasts.find { |entry| entry["action"] == action }
  end

  def thread
    CopilotThread.where(account_id: account.id).take
  end

  def stub_llm(*responses)
    scripted_chat(*responses).tap { |llm| allow(Ai::Chat).to receive(:new).and_return(llm) }
  end

  it "responde em pedaços, numerados, e termina com a mensagem completa" do
    stub_llm(text_response("Olá!"))

    run

    expect(event("text_chunk")).to eq("action" => "text_chunk", "data" => { "chunk" => "Olá!", "seq" => 0 })
    expect(event("message_complete")["data"]).to include("text" => "Olá!", "changesApplied" => [])
  end

  it "guarda a pergunta e a resposta, e na próxima o histórico vem do servidor" do
    llm = stub_llm(text_response("Olá!"), text_response("De nada."))

    run(user_message: "Oi")
    run(user_message: "Obrigada")

    expect(thread.ordered_messages.map { |message| [ message.role, message.content ] }).to eq(
      [ %w[user Oi], [ "assistant", "Olá!" ], %w[user Obrigada], [ "assistant", "De nada." ] ]
    )
    expect(llm.seen.last[:messages].map { |message| message[:content] }).to eq([ "Oi", "Olá!", "Obrigada" ])
  end

  it "a nova tentativa não duplica a pergunta" do
    llm = stub_llm(text_response("Olá!"))
    CopilotThread.find_or_create_for(account_id: account.id, organization_id: organization.id).add_user_message("Oi")

    run(user_message: "Oi", skip_save: true)

    expect(thread.ordered_messages.count { |message| message.role == "user" }).to eq(1)
    expect(llm.seen.first[:messages].map { |message| message[:content] }).to eq([ "Oi" ])
  end

  it "guarda as mudanças e a linha do tempo" do
    chat = create(:chat, organization: organization)
    stub_llm(tool_response("close_chat", { chat_id: chat.id.to_s }), text_response("Fechei."))

    run

    saved = thread.ordered_messages.last
    expect(saved.changes_applied.first).to include("action" => "close_chat")
    expect(saved.tool_activities.first).to include("toolName" => "close_chat")
    expect(saved.content_segments.map { |segment| segment["type"] }).to eq(%w[activity text])
    expect(event("tool_activity")["data"]).to include("toolName" => "close_chat", "status" => "started")
  end

  describe "créditos" do
    it "cobra uma mensagem e avisa o saldo" do
      stub_llm(text_response("Olá!"))

      run

      expect(organization.reload.credits_used).to eq(Copilot::MESSAGE_COST)
      expect(event("credits_updated")["data"]).to eq("messageCredits" => 10 - Copilot::MESSAGE_COST, "consumedCredits" => Copilot::MESSAGE_COST)
    end

    it "sem saldo, não chama o modelo e avisa com o código" do
      organization.update!(credits_used: 9)
      llm = stub_llm(text_response("nunca"))

      run

      expect(llm).not_to have_received(:converse)
      expect(event("error")["data"]).to include("code" => "noCredits")
      expect(organization.reload.credits_used).to eq(9)
    end

    it "estorna quando o modelo falha sem entregar nada" do
      stub_llm(Ai::Chat::Failed.new("caiu"))

      run

      expect(organization.reload.credits_used).to eq(0)
      expect(event("error")["data"]).to include("code" => "failed", "error" => "Não foi possível processar a mensagem. Tente de novo.")
      expect(event("credits_updated")["data"]).to include("consumedCredits" => 0)
    end

    it "estorna quando falta a chave, com o código próprio" do
      allow(Ai::Chat).to receive(:new).and_return(scripted_chat(Ai::Chat::MissingKey.new))

      run

      expect(organization.reload.credits_used).to eq(0)
      expect(event("error")["data"]).to include("code" => "unavailable")
    end

    it "não estorna quando já entregou texto antes de falhar" do
      stub_llm(tool_response("list_tags", {}, text: "Vou olhar."), Ai::Chat::Failed.new("caiu"))

      run

      expect(organization.reload.credits_used).to eq(Copilot::MESSAGE_COST)
    end

    it "não estorna quando já aplicou uma mudança antes de falhar" do
      chat = create(:chat, organization: organization)
      stub_llm(tool_response("close_chat", { chat_id: chat.id.to_s }), Ai::Chat::Failed.new("caiu"))

      run

      expect(chat.reload.status).to eq("closed")
      expect(organization.reload.credits_used).to eq(Copilot::MESSAGE_COST)
    end

    it "estorna quando o modelo não devolve nada de útil" do
      stub_llm(CopilotHelpers::FakeMessage.new(stop_reason: :end_turn, content: []))

      run

      expect(organization.reload.credits_used).to eq(0)
      expect(thread.ordered_messages.map(&:role)).to eq(%w[user])
    end
  end

  it "sai no idioma da pessoa" do
    account.update!(locale: "en")
    stub_llm(Ai::Chat::Failed.new("caiu"))

    run

    expect(event("error")["data"]["error"]).to eq("Could not process the message. Try again.")
  end

  it "não faz nada para quem perdeu o acesso ou a permissão" do
    llm = stub_llm(text_response("nunca"))
    without_permission = member_with(contacts: "all")
    revoked = create(:account, organization: organization, role: "member")
    revoked.revoke!

    run(person: without_permission)
    run(person: revoked)

    expect(llm).not_to have_received(:converse)
    expect(organization.reload.credits_used).to eq(0)
  end

  it "não faz nada para pessoa de outra organização" do
    llm = stub_llm(text_response("nunca"))

    run(person: create(:account, organization: create(:organization)))

    expect(llm).not_to have_received(:converse)
  end

  it "uma falha inesperada avisa a tela em vez de sumir" do
    stub_llm(text_response("Olá!"))
    allow(CopilotThread).to receive(:find_or_create_for).and_raise("banco fora do ar")

    run

    expect(event("error")["data"]).to include("code" => "failed")
    expect(organization.reload.credits_used).to eq(0)
  end
end
