require "rails_helper"

RSpec.describe Connectors::SendFailure do
  describe ".reason" do
    [
      Net::OpenTimeout.new("execution expired"),
      Net::ReadTimeout.new,
      SocketError.new("Failed to open TCP connection to api.provedor.com:443 (getaddrinfo: Name or service not known)"),
      Errno::ECONNREFUSED.new("Failed to open TCP connection to api.provedor.com:443"),
      Errno::ECONNRESET.new,
      EOFError.new("end of file reached"),
      OpenSSL::SSL::SSLError.new("SSL_connect returned=1"),
      Faraday::ConnectionFailed.new("connection failed"),
      Faraday::TimeoutError.new
    ].each do |error|
      it "troca #{error.class} por uma frase para quem está atendendo" do
        expect(described_class.reason(error)).to eq(I18n.t("connectors.messages.channel_unreachable"))
      end
    end

    it "mantém a recusa do provedor, que explica o que fazer" do
      expect(described_class.reason(StandardError.new("Número não encontrado no WhatsApp"))).to eq("Número não encontrado no WhatsApp")
    end

    it "responde no idioma da requisição" do
      phrase = I18n.with_locale(:en) { described_class.reason(Net::OpenTimeout.new("execution expired")) }

      expect(phrase).to eq("The channel did not respond. Try again in a moment.")
    end
  end
end
