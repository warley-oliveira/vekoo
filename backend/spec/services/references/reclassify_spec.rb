require "rails_helper"

# Só o gancho e a replicabilidade mudam, pelo critério atual; o modelo lê a
# análise gravada e não a classificação antiga. O `Ai::Chat` é um dublê.
RSpec.describe References::Reclassify do
  let(:card) do
    create(:reference_card, :analyzed, analysis_cost_micro_usd: 90_000,
      source: { "channel" => "@padoca.exemplo", "igMediaId" => "123" })
  end

  def chat_answering(payload)
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: JSON.generate(payload), usage: { input: 2_000, output: 400, cacheRead: 0, cacheWrite: 0 }, model: "claude-opus-5-5")
      )
    end
  end

  let(:payload) { { "hookType" => "promise", "hookFit" => "clear", "replicability" => 3, "reason" => "A capa mostra o ganho; foto de celular basta." } }

  it "troca só o gancho e a replicabilidade, e soma o custo" do
    before = card.analysis.except("hook", "replicability")
    old_score = card.replicability
    result = described_class.new(card, chat: chat_answering(payload)).call
    card.reload

    expect(result).to be_changed
    expect(result.before).to eq(hook: "curiosity", replicability: old_score)
    expect(card).to have_attributes(hook_type: "promise", replicability: 3, status: "in_review")
    expect(card.analysis.except("hook", "replicability")).to eq(before)
    expect(card.analysis.dig("hook", "description")).to start_with("A capa mostra o resultado")
    expect(card.analysis_cost_micro_usd).to be > 90_000
  end

  it "manda a análise sem a classificação antiga, com o critério e só as duas listas" do
    chat = chat_answering(payload)
    described_class.new(card, chat: chat).call

    expect(chat).to have_received(:answer) { |system:, messages:, schema:, **|
      text = messages.first[:content].first[:text]
      expect(text).to include("A capa mostra o resultado", "O que um negócio precisa para repetir")
      expect(text).not_to include("curiosity", "padoca")
      expect(system.first[:text]).to include("`announcement`", "Na dúvida entre 2 e 3", "### Tipos de gancho")
      expect(system.first[:text]).not_to include("### Nichos")
      expect(schema["required"]).to eq(%w[hookType hookFit replicability reason])
    }
  end

  it "no DRY_RUN só relata" do
    result = described_class.new(card, chat: chat_answering(payload)).call(dry_run: true)

    expect(result.after).to eq(hook: "promise", replicability: 3)
    expect(card.reload).to have_attributes(hook_type: "curiosity", analysis_cost_micro_usd: 90_000)
  end

  it "resposta fora da lista falha sem gravar" do
    chat = chat_answering(payload.merge("hookType" => "meme"))

    expect { described_class.new(card, chat: chat).call }.to raise_error(Ai::Chat::Failed)
    expect(card.reload.hook_type).to eq("curiosity")
  end
end
