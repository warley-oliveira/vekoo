require "rails_helper"

RSpec.describe LeadChatApi do
  let(:client) { LeadChatApi::Client.new("chave") }
  let(:base) { LeadChatApi::Config::API_BASE_URL }

  it "envia texto para a sessão e devolve o corpo com chaves simbolizadas" do
    stub = stub_request(:post, "#{base}/chat/v1/session/s1/message/sync")
      .with(headers: { "Authorization" => "Bearer chave" }, body: { text: "oi" }.to_json)
      .to_return(status: 200, body: { id: "m1" }.to_json)

    expect(LeadChatApi::Message.new(client).send_text_message_to_session(session_id: "s1", message: "oi")).to eq(id: "m1")
    expect(stub).to have_been_requested
  end

  it "trata timeout no envio como nil, sem derrubar quem chamou" do
    stub_request(:post, "#{base}/chat/v1/session/s1/message/sync").to_raise(Net::ReadTimeout)

    expect(LeadChatApi::Message.new(client).send_text_message_to_session(session_id: "s1", message: "oi")).to be_nil
  end

  it "lê a sessão com os detalhes pedidos" do
    stub_request(:get, "#{base}/chat/v1/session/s1?includeDetails=ContactDetails&includeDetails=AgentDetails")
      .to_return(status: 200, body: { contactDetails: { name: "Ana" } }.to_json)

    session = LeadChatApi::Message.new(client).get_session("s1", %w[ContactDetails AgentDetails])

    expect(session.dig(:contactDetails, :name)).to eq("Ana")
  end

  it "cria e apaga a inscrição de webhook" do
    stub_request(:post, "#{base}/core/v1/webhook/subscription")
      .with(body: hash_including("name" => "Vekoo", "url" => "https://w", "topics" => %w[MESSAGE_RECEIVED MESSAGE_SENT]))
      .to_return(status: 200, body: { id: "sub" }.to_json)
    delete = stub_request(:delete, "#{base}/core/v1/webhook/subscription/sub").to_return(status: 200, body: "{}")

    webhook = LeadChatApi::Webhook.new(client)

    expect(webhook.create_subscription("Vekoo", "https://w")).to eq(id: "sub")
    webhook.delete_subscription("sub")
    expect(delete).to have_been_requested
  end

  it "levanta LeadChatApi::Error com status e corpo no DELETE recusado" do
    stub_request(:delete, "#{base}/core/v1/webhook/subscription/sub").to_return(status: 403, body: "negado")

    expect { LeadChatApi::Webhook.new(client).delete_subscription("sub") }
      .to raise_error(LeadChatApi::Error) { |error| expect(error.status).to eq(403) }
  end
end
