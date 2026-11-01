require "rails_helper"

# Os símbolos chegam no mesmo bloco de opções do logotipo, um de cada vez; o
# que falha conta em `failed`; no fim nada fica "chegando".
RSpec.describe LogoConceptsJob do
  let(:brand) { create(:brand_core, :complete) }
  let(:account) { create(:account, organization: brand.organization) }
  let(:conversation) { brand.agent_conversations.create!(organization: brand.organization, account: account, purpose: "onboarding", title: "Onboarding") }
  let(:turn) do
    conversation.turns.create!(organization: brand.organization, account: account, kind: "suggest", prompt: "", status: "answered",
      cost_micro_usd: 1_000,
      plan: { "reply" => [ { "type" => "options", "kind" => "wordmark", "source" => "curated", "pending" => 2,
        "items" => [ { "logoId" => "palavra", "style" => "asWritten" } ] } ] })
  end

  def logo(direction, arrangement)
    id = SecureRandom.uuid
    meta = { "origin" => "onboarding", "concept" => { "id" => "c", "direction" => direction, "arrangement" => arrangement, "idea" => "Um pão" } }
    create(:brand_asset, brand_core: brand, kind: "logo", variant: "light", logo_id: id, generated: true, meta: meta)
    id
  end

  it "acrescenta as logos com símbolo, conta a falha, soma o custo e avisa a tela" do
    ids = [ logo("figurative", "horizontal"), logo("figurative", "stacked") ]
    allow(Logos::Concepts).to receive(:new) { |_brand, on_concept:, on_failure:, **|
      double(call: (on_concept.call("figurative", ids) || on_failure.call("emblem") ||
        Logos::Concepts::Result.new(logo_ids: ids, failed: %w[emblem], cost_micro_usd: 200_000)))
    }
    allow(AgentChannel).to receive(:broadcast_to)

    described_class.perform_now(turn.id)

    options = turn.reload.plan["reply"].first
    expect(options["items"].map { |item| item["logoId"] }).to eq([ "palavra", *ids ])
    expect(options["items"].last["concept"]).to eq("direction" => "figurative", "arrangement" => "stacked", "idea" => "Um pão")
    expect(options).to include("pending" => 0, "failed" => 1)
    expect(turn.cost_micro_usd).to eq(201_000)
    expect(AgentChannel).to have_received(:broadcast_to).at_least(3).times
  end

  it "teto de gasto batido: nenhuma chega, todas contam como falha" do
    allow(Agent::Budget).to receive(:check!).and_raise(Agent::Budget::CapReached)

    described_class.perform_now(turn.id)

    expect(turn.reload.plan["reply"].first).to include("pending" => 0, "failed" => 2)
  end
end
