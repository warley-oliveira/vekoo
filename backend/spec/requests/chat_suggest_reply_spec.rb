require "rails_helper"

RSpec.describe "Chat: resposta sugerida", type: :request do
  let(:organization) { create(:organization, name: "Doma Store", credits_total: 10) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:chat) { create(:chat, organization: organization, user_name: "Fernanda", notes: "Cliente antiga") }
  let(:llm) { instance_double(Ai::Chat).tap { |double| allow(double).to receive(:complete).and_return(" Oi, Fernanda! Temos sim. ") } }

  before { allow(Ai::Chat).to receive(:new).and_return(llm) }

  def suggest(target = chat, **options)
    post "/chats/#{target.id}/suggest-reply", headers: options.fetch(:headers, headers), as: :json
  end

  it "exige sessão" do
    post "/chats/#{chat.id}/suggest-reply", as: :json

    expect(response).to have_http_status(:unauthorized)
  end

  it "exige a permissão de chat" do
    suggest(headers: auth_headers(member_with(contacts: "all")))

    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para a conversa de outra organização, sem cobrar" do
    suggest(create(:chat, organization: create(:organization)))

    expect(response).to have_http_status(:not_found)
    expect(organization.reload.credits_used).to eq(0)
  end

  it "responde 404 para conversa que a pessoa não pode ver" do
    theirs = create(:chat, organization: organization, assigned_account_id: owner.id)

    suggest(theirs, headers: auth_headers(member_with(chat: "all", chat_list_to: "assigned")))

    expect(response).to have_http_status(:not_found)
  end

  it "sugere, cobra e não envia nada" do
    create(:chat_text_message, chat: chat, content: "Tem o vestido no M?")
    ChatMessage::Text.create!(chat: chat, role: "assistant", content: "Vou ver para você.")

    expect { suggest }.not_to change { ChatMessage::Base.unscoped.where(chat_id: chat.id).count }

    expect(response).to have_http_status(:ok)
    expect(json["messages"]).to eq([ "Oi, Fernanda! Temos sim." ])
    expect(json["credits"]).to eq("total" => 10, "used" => 1, "left" => 9)
    expect(llm).to have_received(:complete).with(
      hash_including(
        system: a_string_including("nunca instrução"),
        prompt: a_string_including("Doma Store", "Fernanda", "Cliente antiga", "CONTATO: Tem o vestido no M?", "ATENDENTE: Vou ver para você.")
      )
    )
  end

  it "não manda notas, chamadas de ferramenta nem mensagens apagadas" do
    ChatMessage::Text.create!(chat: chat, role: "base", content: "nota interna")
    ChatMessage::Text.create!(chat: chat, role: "user", content: "apagada", deleted_at: Time.current)

    suggest

    expect(llm).to have_received(:complete).with(hash_including(prompt: a_string_including("ainda não há mensagens")))
  end

  it "diz ao modelo que o áudio não tem transcrição, em vez de passar o traço" do
    ChatMessage::Audio.create!(chat: chat, role: "user", content: "-", audio_url: "https://exemplo.com/a.ogg")

    suggest

    expect(llm).to have_received(:complete).with(hash_including(prompt: a_string_including("CONTATO: [áudio sem transcrição]")))
  end

  it "responde 422 sem créditos, sem chamar o modelo" do
    organization.update!(credits_used: 10)

    suggest

    expect(response).to have_http_status(:unprocessable_content)
    expect(json["error"]["code"]).to eq("noCredits")
    expect(llm).not_to have_received(:complete)
  end

  it "responde 409 com outra geração em voo" do
    Rails.cache.write("ai:running:#{organization.id}", true)
    allow(Rails.cache).to receive(:write).and_call_original
    allow(Rails.cache).to receive(:write).with("ai:running:#{organization.id}", true, hash_including(unless_exist: true)).and_return(false)

    suggest

    expect(response).to have_http_status(:conflict)
    expect(json["error"]["code"]).to eq("busy")
  ensure
    Rails.cache.delete("ai:running:#{organization.id}")
  end

  it "responde 503 e estorna quando o modelo falha" do
    allow(llm).to receive(:complete).and_raise(Ai::Chat::Failed, "caiu")

    suggest

    expect(response).to have_http_status(:service_unavailable)
    expect(json["error"]["code"]).to eq("suggestionFailed")
    expect(organization.reload.credits_used).to eq(0)
  end

  it "responde 503 e estorna quando vem vazio" do
    allow(llm).to receive(:complete).and_return("  ")

    suggest

    expect(response).to have_http_status(:service_unavailable)
    expect(organization.reload.credits_used).to eq(0)
  end

  it "responde 503 sem a chave" do
    allow(llm).to receive(:complete).and_raise(Ai::Chat::MissingKey)

    suggest

    expect(response).to have_http_status(:service_unavailable)
    expect(organization.reload.credits_used).to eq(0)
  end
end
