require "rails_helper"

# O `ai_spec.rb` dubla o `Ai::Chat` inteiro — o que é certo para testar crédito
# e protocolo, mas deixa a própria porta sem cobertura. Foi assim que passou um
# `NameError`: dentro de `module Ai`, `rescue Anthropic::Errors::…` procurava
# `Ai::Chat::Anthropic`, e o erro de constante mascarava o erro verdadeiro.
#
# Nada aqui toca a rede.
RSpec.describe Ai::Chat do
  def without_key
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return(nil)
  end

  describe ".available?" do
    it "diz que não dá para gerar sem chave" do
      without_key

      expect(described_class).not_to be_available
    end

    it "diz que dá quando a chave existe" do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return("sk-ant-teste")

      expect(described_class).to be_available
    end
  end

  describe "sem chave" do
    before { without_key }

    it "levanta MissingKey, e não NameError, ao escrever em fluxo" do
      expect {
        described_class.new.stream_text(system: "s", prompt: "p") { |_| }
      }.to raise_error(Ai::Chat::MissingKey)
    end

    it "levanta MissingKey numa resposta única" do
      expect {
        described_class.new.complete(system: "s", prompt: "p")
      }.to raise_error(Ai::Chat::MissingKey)
    end
  end

  describe "erros do SDK" do
    # As classes de erro precisam ser alcançáveis daqui: se a resolução de
    # constante quebrar de novo, estes exemplos falham em vez de o erro virar
    # um NameError silencioso em produção.
    let(:messages) { double }
    let(:client) do
      instance_double(Anthropic::Client).tap { |c| allow(c).to receive(:messages).and_return(messages) }
    end

    it "traduz falha de conexão em Failed" do
      allow(messages).to receive(:stream)
        .and_raise(Anthropic::Errors::APIConnectionError.new(url: "http://x"))

      expect {
        described_class.new(client: client).stream_text(system: "s", prompt: "p") { |_| }
      }.to raise_error(Ai::Chat::Failed)
    end

    it "traduz erro de status em Failed" do
      allow(messages).to receive(:create).and_raise(
        Anthropic::Errors::RateLimitError.new(
          url: "http://x", status: 429, body: nil,
          headers: {}, request: nil, response: nil
        )
      )

      expect {
        described_class.new(client: client).complete(system: "s", prompt: "p")
      }.to raise_error(Ai::Chat::Failed, /RateLimitError/)
    end

    it "trata recusa do modelo como falha, em vez de devolver texto vazio" do
      refusal = double(stop_reason: :refusal, content: [])
      allow(messages).to receive(:create).and_return(refusal)

      expect {
        described_class.new(client: client).complete(system: "s", prompt: "p")
      }.to raise_error(Ai::Chat::Failed, /refusal/)
    end
  end

  describe "o que é mandado ao modelo" do
    it "usa Opus 5, pensamento adaptativo e marca o bloco estável para cache" do
      messages = double
      client = instance_double(Anthropic::Client)
      allow(client).to receive(:messages).and_return(messages)
      allow(messages).to receive(:stream).and_return(double(text: [ "oi" ]))

      described_class.new(client: client).stream_text(system: "voz", prompt: "pedido") { |_| }

      expect(messages).to have_received(:stream) do |params|
        expect(params[:model]).to eq(:"claude-opus-5")
        # `budget_tokens` foi removido e devolve 400 no Opus 5.
        expect(params[:thinking]).to eq({ type: "adaptive" })
        expect(params).not_to have_key(:budget_tokens)
        # O bloco estável é o que carrega o cache; o pedido, que muda a cada
        # requisição, vai na mensagem.
        expect(params[:system_].first).to include(cache_control: { type: "ephemeral" })
        expect(params[:system_].first[:text]).to eq("voz")
        expect(params[:messages]).to eq([ { role: "user", content: "pedido" } ])
      end
    end
  end
end
