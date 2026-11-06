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

  describe "#converse" do
    let(:beta) { double(messages: messages) }
    let(:messages) { double }
    let(:client) { instance_double(Anthropic::Client).tap { |c| allow(c).to receive(:beta).and_return(beta) } }
    let(:final) { double(stop_reason: :end_turn) }

    def stream_of(*events)
      double(accumulated_message: final).tap do |stream|
        allow(stream).to receive(:each) { |&block| events.each(&block) }
      end
    end

    def converse(&block)
      described_class.new(client: client).converse(
        system: "estável", context: "de hoje", messages: [ { role: "user", content: "Oi" } ], tools: [ { name: "x" } ], &(block || proc {})
      )
    end

    it "entrega o texto em pedaços e devolve a mensagem inteira" do
      allow(messages).to receive(:stream).and_return(
        stream_of(double(type: :text, text: "Ol"), double(type: :content_block_stop), double(type: :text, text: "á"))
      )
      pieces = []

      expect(converse { |piece| pieces << piece }).to eq(final)
      expect(pieces).to eq([ "Ol", "á" ])
    end

    it "pede o modelo do agente, com recusa refeita pelo servidor e o cache no bloco estável" do
      allow(messages).to receive(:stream).and_return(stream_of)

      converse

      expect(messages).to have_received(:stream).with(
        hash_including(
          model: described_class::AGENT_MODEL,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          betas: [ described_class::FALLBACK_BETA ],
          fallbacks: :default,
          tools: [ { name: "x" } ],
          system_: [ { type: "text", text: "estável", cache_control: { type: "ephemeral" } }, { type: "text", text: "de hoje" } ]
        )
      )
    end

    it "traduz erro do SDK em Failed" do
      allow(messages).to receive(:stream).and_raise(Anthropic::Errors::APIConnectionError.new(url: "http://x"))

      expect { converse }.to raise_error(Ai::Chat::Failed)
    end

    it "levanta MissingKey sem chave" do
      without_key

      expect {
        described_class.new.converse(system: "s", messages: [], tools: []) { |_| }
      }.to raise_error(Ai::Chat::MissingKey)
    end
  end

  describe ".echoable" do
    def block(type)
      double(type: type)
    end

    it "devolve os blocos como vieram, com o pensamento intacto" do
      thinking = block(:thinking)
      use = block(:tool_use)

      expect(described_class.echoable([ thinking, use ])).to eq([ thinking, use ])
    end

    it "depois de uma virada de modelo, tira o pensamento e as chamadas do modelo que recusou, e o marcador" do
      old_thinking = block(:thinking)
      old_use = block(:tool_use)
      old_text = block(:text)
      marker = block(:fallback)
      new_thinking = block(:thinking)
      new_use = block(:tool_use)

      expect(described_class.echoable([ old_thinking, old_text, old_use, marker, new_thinking, new_use ])).to eq([ old_text, new_thinking, new_use ])
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
    it "usa Sonnet 5, pensamento adaptativo e marca o bloco estável para cache" do
      messages = double
      client = instance_double(Anthropic::Client)
      allow(client).to receive(:messages).and_return(messages)
      allow(messages).to receive(:stream).and_return(double(text: [ "oi" ]))

      described_class.new(client: client).stream_text(system: "voz", prompt: "pedido") { |_| }

      expect(messages).to have_received(:stream) do |params|
        expect(params[:model]).to eq(:"claude-sonnet-5")
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
