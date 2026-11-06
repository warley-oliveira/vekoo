require "rails_helper"

# Repetir um POST de envio sem ter recebido resposta pode mandar a mesma mensagem duas vezes:
# um timeout de leitura não diz se ela saiu. Resposta de erro do provedor é recusa clara, e
# essa continua sendo repetida, porque pode ser passageira (a instância reconectando).
RSpec.describe Connector::WhatsappWeb::Providers::Base do
  before { allow(described_class).to receive(:sleep) }

  def attempts_with(error, **options)
    attempts = 0
    begin
      described_class.with_retry(label: "teste", **options) do
        attempts += 1
        raise error
      end
    rescue StandardError
      attempts
    end
  end

  context "em envio (idempotent: false)" do
    it "não repete quando não veio resposta" do
      [ Net::ReadTimeout, Net::WriteTimeout, Errno::ECONNRESET, Errno::EPIPE, EOFError ].each do |error|
        expect(attempts_with(error, idempotent: false)).to eq(1), "#{error} não deveria repetir"
      end
    end

    it "repete resposta de erro do provedor, que é recusa clara" do
      expect(attempts_with(RuntimeError.new("Failed to send message: boom"), idempotent: false)).to eq(3)
    end

    it "repete quando a conexão nem abriu" do
      [ Errno::ECONNREFUSED, Net::OpenTimeout, SocketError ].each do |error|
        expect(attempts_with(error, idempotent: false)).to eq(3), "#{error} deveria repetir"
      end
    end
  end

  context "em consulta (padrão)" do
    it "repete qualquer erro passageiro" do
      expect(attempts_with(Net::ReadTimeout)).to eq(3)
    end
  end

  it "dentro de send_once, nada se repete" do
    described_class.send_once do
      expect(attempts_with(Errno::ECONNREFUSED, idempotent: false)).to eq(1)
    end
  end
end
