require "rails_helper"

RSpec.describe ZapiClient do
  let(:client) { described_class.new("INST", "TOK", account_token: "ACCT") }
  let(:base) { "https://api.z-api.io/instances/INST/token/TOK" }

  it "levanta ZapiClient::Error em 5xx em vez de devolver true" do
    stub_request(:post, "#{base}/send-text").to_return(status: 503, body: "fora")

    expect { client.send_text("5531971810932", "oi") }.to raise_error(ZapiClient::Error, /503/)
  end

  it "levanta ZapiClient::Error em 4xx" do
    stub_request(:post, "#{base}/send-text").to_return(status: 400, body: "ruim")

    expect { client.send_text("5531971810932", "oi") }.to raise_error(ZapiClient::Error, /400/)
  end

  it "envia o Client-Token da conta" do
    stub = stub_request(:post, "#{base}/send-text")
      .with(headers: { "Client-Token" => "ACCT" })
      .to_return(status: 200, body: { messageId: "M1" }.to_json, headers: { "Content-Type" => "application/json" })

    expect(client.send_text("5531971810932", "oi")["messageId"]).to eq("M1")
    expect(stub).to have_been_requested
  end

  it "recusa presença fora da lista sem chamar a API" do
    expect { client.update_presence("5531971810932", "dancing") }.to raise_error(ZapiClient::Error, /Invalid presence/)
  end

  it "manda documento pela extensão da URL" do
    stub = stub_request(:post, "#{base}/send-document/pdf")
      .with(body: { phone: "553", document: "https://x/tabela.pdf", fileName: "tabela.pdf" }.to_json)
      .to_return(status: 200, body: "{}", headers: { "Content-Type" => "application/json" })

    client.send_document("553", "https://x/tabela.pdf")

    expect(stub).to have_been_requested
  end

  it "apaga para todos pela query messageId + phone + owner" do
    stub = stub_request(:delete, "#{base}/messages?messageId=M1&phone=553&owner=true")
      .to_return(status: 200, body: "", headers: {})

    client.delete_message(phone: "553", message_id: "M1", owner: true)

    expect(stub).to have_been_requested
  end

  describe ZapiClient::Partner do
    it "cria a instância com os callbacks em camelCase" do
      stub = stub_request(:post, "https://api.z-api.io/instances/integrator/on-demand")
        .with(
          headers: { "Authorization" => "Bearer CONTA" },
          body: { name: "Loja", receivedCallbackUrl: "https://w/r" }.to_json
        )
        .to_return(status: 200, body: { id: "I", token: "T" }.to_json, headers: { "Content-Type" => "application/json" })

      expect(described_class.create_instance("Loja", account_token: "CONTA", received_callback_url: "https://w/r"))
        .to eq("id" => "I", "token" => "T")
      expect(stub).to have_been_requested
    end

    it "assina a instância" do
      stub_request(:post, "https://api.z-api.io/instances/I/token/T/integrator/on-demand/subscription")
        .to_return(status: 201, body: "")

      expect(described_class.sign_instance("I", "T", account_token: "CONTA")).to be(true)
    end

    it "levanta quando a criação falha" do
      stub_request(:post, "https://api.z-api.io/instances/integrator/on-demand").to_return(status: 401, body: "x")

      expect { described_class.create_instance("Loja", account_token: "CONTA") }.to raise_error(ZapiClient::Error, /401/)
    end
  end
end
