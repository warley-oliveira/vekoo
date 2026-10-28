require "rails_helper"

# O "cria pra mim" de fontes quando ela já tem metade do par: a que existe
# fica fixa em toda proposta, e só o outro papel varia.
RSpec.describe Onboarding::Suggest do
  let(:brand) { create(:brand_core) }

  def chat_saying(payload)
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: JSON.generate(payload), usage: { input: 800, output: 120, cacheRead: 0, cacheWrite: 0 },
          model: "claude-opus-5")
      )
    end
  end

  def keep_utility(family)
    typography = brand.full_document["typography"]
    utility = { "family" => family, "source" => "catalog", "weights" => [ 400, 500 ], "usage" => "", "assetId" => nil }
    brand.assign_section("typography", typography.merge("utility" => utility))
    brand.save!
  end

  it "mantém a utilitária que ela já tem, mesmo que o modelo proponha outra" do
    keep_utility("Montserrat")
    chat = chat_saying({ "options" => [
      { "display" => "Libre Baskerville", "utility" => "Work Sans", "why" => "clássica" },
      { "display" => "EB Garamond", "utility" => "Inter", "why" => "discreta" },
      { "display" => "Newsreader", "utility" => "Montserrat", "why" => "calorosa" }
    ] })

    result = described_class.call(brand, kind: "fonts", chat: chat)

    expect(result.kept).to eq("Montserrat")
    expect(result.options.map { |o| o["utility"]["family"] }).to all(eq("Montserrat"))
    expect(result.options.map { |o| o["display"]["family"] }).to eq([ "Libre Baskerville", "EB Garamond", "Newsreader" ])
    expect(chat).to have_received(:answer).with(hash_including(
      messages: [ hash_including(content: a_string_including("A utilitária já está escolhida: Montserrat")) ]
    ))
  end

  it "nas curadas também: escolher uma não troca o que ela já decidiu" do
    keep_utility("Montserrat")

    result = described_class.curated(brand, kind: "fonts")

    expect(result.kept).to eq("Montserrat")
    expect(result.options).not_to be_empty
    expect(result.options.map { |o| o["utility"]["family"] }).to all(eq("Montserrat"))
  end

  it "sem metade de par nada fica fixo" do
    result = described_class.curated(brand, kind: "fonts")

    expect(result.kept).to be_nil
    expect(result.options.map { |o| o["utility"]["family"] }.uniq.size).to be > 1
  end
end
