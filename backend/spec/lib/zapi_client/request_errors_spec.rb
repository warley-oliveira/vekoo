require "rails_helper"

# Erro de rede: o contrato de `ZapiClient` é levantar `ZapiClient::Error`, e é isso que os
# providers e os serviços de mensagem resgatam. Na origem o erro subia cru.
RSpec.describe ZapiClient, "erro de rede" do
  subject(:client) { described_class.new("INST123", "TOKABC") }

  let(:url) { "https://api.z-api.io/instances/INST123/token/TOKABC/send-text" }

  it "vira ZapiClient::Error com a causa" do
    stub_request(:post, url).to_timeout

    expect { client.send_text("5511999999999", "Oi") }.to raise_error(ZapiClient::ConnectionError, /Z-API connection error: execution expired/)
  end

  it "não espera" do
    stub_request(:post, url).to_timeout
    allow(client).to receive(:sleep)

    expect { client.send_text("5511999999999", "Oi") }.to raise_error(ZapiClient::Error)

    expect(client).not_to have_received(:sleep)
  end

  # Repetir depois de um timeout de leitura poderia mandar a mesma mensagem duas vezes.
  it "não repete o pedido" do
    stub_request(:post, url).to_raise(Net::ReadTimeout)

    expect { client.send_text("5511999999999", "Oi") }.to raise_error(ZapiClient::Error)

    expect(a_request(:post, url)).to have_been_made.once
  end

  it "conexão recusada também" do
    stub_request(:post, url).to_raise(Errno::ECONNREFUSED)

    expect { client.send_text("5511999999999", "Oi") }.to raise_error(ZapiClient::Error, /Connection refused/)
  end

  it "quem trata ZapiClient::Error agora trata a rede fora também" do
    connector = create(:connector_whatsapp_web, :zapi)
    stub_request(:post, "https://api.z-api.io/instances/INST123/token/TOKABC/read-message").to_timeout

    expect(connector.mark_read_message("5511999999999", "MSG-1")).to be(false)
  end
end
