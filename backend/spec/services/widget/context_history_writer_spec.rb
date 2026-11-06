require "rails_helper"

RSpec.describe Widget::ContextHistoryWriter do
  let(:connector) { create(:connector_web_widget) }
  let(:chat) { create(:chat, connector: connector, external_id: "visitor-history-1", audience_type: "web") }
  let(:context) do
    {
      "product" => { "name" => "Tênis X", "price" => "199.90", "captured_at" => "2026-07-22T10:00:00Z" },
      "events" => [ { "name" => "view", "at" => "t1" } ]
    }
  end

  it "grava o cartão de contexto como mensagem de sistema" do
    message = described_class.record(chat, context)

    expect(message).to be_persisted
    expect(message).to have_attributes(
      role: "system",
      role_base_type: "widget-context",
      message_origin: "widget_context"
    )
    expect(message.content).to include("Tênis X")
  end

  it "guarda o contexto sem o carimbo interno de frescor" do
    message = described_class.record(chat, context)

    expect(message.context_message["product"]).to eq("name" => "Tênis X", "price" => "199.90")
    expect(message.context_message["events"]).to eq(context["events"])
  end

  it "fica antes da mensagem do visitante e da abordagem proativa na ordem da conversa" do
    message = described_class.record(chat, context)

    expect(message.created_at).to be <= 2.seconds.ago + 1.second
  end

  it "não mexe na prévia da conversa" do
    chat.set(last_message_content: "Oi")

    described_class.record(chat, context)

    expect(chat.reload.last_message_content).to eq("Oi")
  end

  it "transmite o cartão no stream da conversa para a tela de atendimento" do
    chat

    expect { described_class.record(chat, context) }
      .to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
      .with(hash_including(messageOrigin: "widget_context"))
  end

  it "não grava nada quando não há o que dizer" do
    expect(described_class.record(chat, { "page" => {} })).to be_nil
    expect(ChatMessage::Base.where(chat_id: chat.id).count).to eq(0)
  end
end
