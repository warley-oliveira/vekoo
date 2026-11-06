require "rails_helper"

RSpec.describe Widget::ChatChannel, type: :channel do
  let(:connector) { create(:connector_web_widget) }
  let(:visitor_id) { "visitor-uuid-abc" }

  before do
    stub_connection visitor_id: visitor_id, web_widget_connector_id: connector.id.to_s
  end

  it "escuta o stream do visitante" do
    subscribe

    expect(subscription).to be_confirmed
    expect(subscription.streams).to eq([ "widget_visitor_#{connector.id}_#{visitor_id}" ])
  end

  # O widget conecta antes da primeira mensagem: a conversa criada depois precisa transmitir
  # no stream que o socket já assinou.
  it "já escuta o stream em que a conversa criada depois vai transmitir" do
    subscribe

    chat = Chat.new(connector: connector, external_id: visitor_id)

    expect(subscription.streams).to include(connector.chat_stream(chat))
  end

  it "recebe o que o operador manda pelo conector" do
    subscribe
    chat = create(:chat, connector: connector, external_id: visitor_id)

    expect { connector.send_text_message(visitor_id, "Olá, posso ajudar?", chat) }
      .to have_broadcasted_to(subscription.streams.first)
      .with(hash_including(type: "message", role: "assistant", content: "Olá, posso ajudar?"))
  end

  it "recusa conector desligado" do
    connector.deactivate

    subscribe

    expect(subscription).to be_rejected
  end

  it "recusa conector pausado" do
    connector.set(status_cd: "paused")

    subscribe

    expect(subscription).to be_rejected
  end

  it "recusa conector que não existe" do
    stub_connection visitor_id: visitor_id, web_widget_connector_id: BSON::ObjectId.new.to_s

    subscribe

    expect(subscription).to be_rejected
  end

  it "para de escutar ao sair" do
    subscribe

    unsubscribe

    expect(subscription.streams).to be_empty
  end
end
